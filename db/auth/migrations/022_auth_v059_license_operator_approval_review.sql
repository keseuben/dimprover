-- DIMPRO Central AUTH V0.5.9 – operator role catalog and dual-approval draft queue.
-- SOURCE ONLY / PROD DENY / NEVER RUN ON REAL AUTH DB WITHOUT APPROVED RELEASE.
-- Depends on 001_auth_v010_core.sql. No app role grants, live license rows,
-- entitlement provisioning, invoice payment or customer notification.
BEGIN;

DO $$
BEGIN
 IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
   RAISE EXCEPTION 'AUTH_LICENSE_OPERATOR_MIGRATOR_ONLY' USING ERRCODE='42501';
 END IF;
END $$;

-- Existing central AUTH RBAC, NOT a second authentication/role system.
INSERT INTO public.auth_roles(code,name,security_level) VALUES
 ('LICENSE_SUPERADMIN','Licencközpont főadmin','SUPERADMIN'),
 ('LICENSE_OPERATOR','Licencügyintéző','STAFF'),
 ('LICENSE_FINANCE','Pénzügyi ellenőr','STAFF'),
 ('LICENSE_SECURITY','Biztonsági jóváhagyó','SUPERADMIN'),
 ('LICENSE_AUDITOR','Licencellenőr - csak olvasás','STAFF'),
 ('LICENSE_SUPPORT_READONLY','Ügyfélszolgálat - csak olvasás','STAFF')
ON CONFLICT(code) DO NOTHING;

INSERT INTO public.auth_permissions(code,description) VALUES
 ('license.center.read','Licencállapot és kérelem áttekintése'),
 ('license.request.create','Kereskedelmi licenckérelem előkészítése'),
 ('license.request.cancel','Kérelem visszavonásának kezdeményezése'),
 ('license.billing.review','Pénzügyi igazolás felülvizsgálata'),
 ('license.security.review','Különálló biztonsági jóváhagyás'),
 ('license.release.prepare','Jóváhagyott kérelem kiadásra előkészítése; NEM aktiválás'),
 ('license.audit.read','Központi licencaudit olvasása'),
 ('license.operator.manage','Operátori szerepkörök kezelési kérelme')
ON CONFLICT(code) DO NOTHING;

-- Each permission is assigned only to new role definitions. No auth_access_grants
-- are created and no product access is granted here.
WITH matrix(role_code,permission_code) AS (
 VALUES
 ('LICENSE_SUPERADMIN','license.center.read'),
 ('LICENSE_SUPERADMIN','license.request.create'),
 ('LICENSE_SUPERADMIN','license.request.cancel'),
 ('LICENSE_SUPERADMIN','license.billing.review'),
 ('LICENSE_SUPERADMIN','license.security.review'),
 ('LICENSE_SUPERADMIN','license.release.prepare'),
 ('LICENSE_SUPERADMIN','license.audit.read'),
 ('LICENSE_SUPERADMIN','license.operator.manage'),
 ('LICENSE_OPERATOR','license.center.read'),
 ('LICENSE_OPERATOR','license.request.create'),
 ('LICENSE_OPERATOR','license.request.cancel'),
 ('LICENSE_FINANCE','license.center.read'),
 ('LICENSE_FINANCE','license.billing.review'),
 ('LICENSE_SECURITY','license.center.read'),
 ('LICENSE_SECURITY','license.security.review'),
 ('LICENSE_SECURITY','license.release.prepare'),
 ('LICENSE_SECURITY','license.audit.read'),
 ('LICENSE_AUDITOR','license.center.read'),
 ('LICENSE_AUDITOR','license.audit.read'),
 ('LICENSE_SUPPORT_READONLY','license.center.read')
)
INSERT INTO public.auth_role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM matrix m
JOIN public.auth_roles r ON r.code=m.role_code
JOIN public.auth_permissions p ON p.code=m.permission_code
ON CONFLICT DO NOTHING;

CREATE TABLE public.auth_license_approval_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 requester_user_id uuid NOT NULL REFERENCES public.auth_users(id) ON DELETE RESTRICT,
 owner_user_id uuid REFERENCES public.auth_users(id) ON DELETE RESTRICT,
 owner_organization_id uuid REFERENCES public.auth_organizations(id) ON DELETE RESTRICT,
 owner_project_id uuid REFERENCES public.auth_projects(id) ON DELETE RESTRICT,
 product_code text NOT NULL REFERENCES public.auth_products(code) ON DELETE RESTRICT,
 license_scope text NOT NULL CHECK(license_scope IN ('USER','ORGANIZATION','PROJECT')),
 payer_type text NOT NULL CHECK(payer_type IN ('USER','ORGANIZATION')),
 payer_user_id uuid REFERENCES public.auth_users(id) ON DELETE RESTRICT,
 payer_organization_id uuid REFERENCES public.auth_organizations(id) ON DELETE RESTRICT,
 plan_code text NOT NULL CHECK(plan_code ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'),
 action_actor_user_id uuid NOT NULL REFERENCES public.auth_users(id) ON DELETE RESTRICT,
 action_reason text NOT NULL CHECK(length(btrim(action_reason)) BETWEEN 12 AND 500),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 12 AND 500),
 proposed_expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN
  ('DRAFT','PENDING_BILLING','PENDING_SECURITY','READY_FOR_RELEASE','REJECTED','CANCELLED')),
 billing_evidence_ref text CHECK(billing_evidence_ref IS NULL OR billing_evidence_ref ~ '^[A-Z0-9][A-Z0-9_:/.-]{7,127}$'),
 finance_reviewer_id uuid REFERENCES public.auth_users(id) ON DELETE RESTRICT,
 finance_approved_at timestamptz,
 security_reviewer_id uuid REFERENCES public.auth_users(id) ON DELETE RESTRICT,
 security_approved_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision >= 1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT auth_license_request_owner_scope CHECK (
  (license_scope='USER' AND owner_user_id IS NOT NULL AND owner_organization_id IS NULL AND owner_project_id IS NULL)
  OR (license_scope='ORGANIZATION' AND owner_organization_id IS NOT NULL AND owner_user_id IS NULL AND owner_project_id IS NULL)
  OR (license_scope='PROJECT' AND owner_project_id IS NOT NULL AND owner_user_id IS NULL AND owner_organization_id IS NULL)
 ),
 CONSTRAINT auth_license_request_payer CHECK (
  (payer_type='USER' AND payer_user_id IS NOT NULL AND payer_organization_id IS NULL)
  OR (payer_type='ORGANIZATION' AND payer_organization_id IS NOT NULL AND payer_user_id IS NULL)
 ),
 CONSTRAINT auth_license_request_distinct_reviewers CHECK (
  (finance_reviewer_id IS NULL OR finance_reviewer_id<>requester_user_id)
  AND (security_reviewer_id IS NULL OR security_reviewer_id<>requester_user_id)
  AND (security_reviewer_id IS NULL OR finance_reviewer_id IS NULL OR security_reviewer_id<>finance_reviewer_id)
 ),
 CONSTRAINT auth_license_request_finance_pair CHECK (
  (finance_reviewer_id IS NULL AND finance_approved_at IS NULL) OR
  (finance_reviewer_id IS NOT NULL AND finance_approved_at IS NOT NULL)
 ),
 CONSTRAINT auth_license_request_security_pair CHECK (
  (security_reviewer_id IS NULL AND security_approved_at IS NULL) OR
  (security_reviewer_id IS NOT NULL AND security_approved_at IS NOT NULL)
 ),
 CONSTRAINT auth_license_request_approval_sequence CHECK (
  status NOT IN ('PENDING_SECURITY','READY_FOR_RELEASE')
  OR (billing_evidence_ref IS NOT NULL AND finance_reviewer_id IS NOT NULL AND finance_approved_at IS NOT NULL)
 ),
 CONSTRAINT auth_license_request_ready_evidence CHECK (
  status<>'READY_FOR_RELEASE' OR
  (security_reviewer_id IS NOT NULL AND security_approved_at IS NOT NULL AND
    finance_approved_at<=security_approved_at)
 )
);
CREATE INDEX auth_license_approval_requests_state_idx
 ON public.auth_license_approval_requests(status,created_at DESC);
COMMENT ON TABLE public.auth_license_approval_requests IS
 'SOURCE ONLY: operator approval queue, never an active commercial license, entitlement, quota or payment.';
CREATE TABLE public.auth_license_approval_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES public.auth_license_approval_requests(id) ON DELETE RESTRICT,
 operation text NOT NULL CHECK(operation IN ('CREATE','CHANGE')),
 previous_status text,
 new_status text NOT NULL,
 previous_revision integer,
 new_revision integer NOT NULL,
 action_actor_user_id uuid NOT NULL REFERENCES public.auth_users(id) ON DELETE RESTRICT,
 action_reason text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_license_approval_audit_idx
 ON public.auth_license_approval_audit(request_id,recorded_at DESC);

CREATE FUNCTION public.auth_license_approval_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'AUTH_LICENSE_APPROVAL_DELETE_DENIED' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' OR NEW.action_actor_user_id<>NEW.requester_user_id
     OR NEW.finance_reviewer_id IS NOT NULL OR NEW.finance_approved_at IS NOT NULL
     OR NEW.security_reviewer_id IS NOT NULL OR NEW.security_approved_at IS NOT NULL
     OR NEW.billing_evidence_ref IS NOT NULL THEN
   RAISE EXCEPTION 'AUTH_LICENSE_APPROVAL_INSERT_MUST_BE_DRAFT' USING ERRCODE='42501';
  END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.requester_user_id<>OLD.requester_user_id
     OR NEW.product_code<>OLD.product_code OR NEW.license_scope<>OLD.license_scope
     OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR NEW.owner_organization_id IS DISTINCT FROM OLD.owner_organization_id
     OR NEW.owner_project_id IS DISTINCT FROM OLD.owner_project_id
     OR NEW.payer_type<>OLD.payer_type
     OR NEW.payer_user_id IS DISTINCT FROM OLD.payer_user_id
     OR NEW.payer_organization_id IS DISTINCT FROM OLD.payer_organization_id
     OR NEW.plan_code<>OLD.plan_code
     OR NEW.proposed_expires_at<>OLD.proposed_expires_at
     OR NEW.reason<>OLD.reason THEN
   RAISE EXCEPTION 'AUTH_LICENSE_APPROVAL_IDENTITY_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN
   RAISE EXCEPTION 'AUTH_LICENSE_APPROVAL_REVISION_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF OLD.status IN ('READY_FOR_RELEASE','REJECTED','CANCELLED') OR
     NOT (
       (OLD.status='DRAFT' AND NEW.status IN ('PENDING_BILLING','CANCELLED')) OR
       (OLD.status='PENDING_BILLING' AND NEW.status IN ('PENDING_SECURITY','REJECTED','CANCELLED')) OR
       (OLD.status='PENDING_SECURITY' AND NEW.status IN ('READY_FOR_RELEASE','REJECTED','CANCELLED'))
     ) THEN
   RAISE EXCEPTION 'AUTH_LICENSE_APPROVAL_TRANSITION_DENIED' USING ERRCODE='22023';
  END IF;
  IF (NEW.status='PENDING_BILLING' AND NEW.action_actor_user_id<>NEW.requester_user_id)
   OR (NEW.status='PENDING_SECURITY' AND
     (NEW.finance_reviewer_id IS NULL OR NEW.action_actor_user_id<>NEW.finance_reviewer_id))
   OR (NEW.status='READY_FOR_RELEASE' AND
     (NEW.security_reviewer_id IS NULL OR NEW.action_actor_user_id<>NEW.security_reviewer_id)) THEN
   RAISE EXCEPTION 'AUTH_LICENSE_APPROVAL_ACTOR_MISMATCH' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER auth_license_approval_guard_trg
 BEFORE UPDATE OR DELETE ON public.auth_license_approval_requests
 FOR EACH ROW EXECUTE FUNCTION public.auth_license_approval_guard();

CREATE FUNCTION public.auth_license_approval_audit_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO public.auth_license_approval_audit(
  request_id,operation,previous_status,new_status,previous_revision,new_revision,
  action_actor_user_id,action_reason
 ) VALUES(
  NEW.id,CASE WHEN TG_OP='INSERT' THEN 'CREATE' ELSE 'CHANGE' END,
  CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END,NEW.status,
  CASE WHEN TG_OP='UPDATE' THEN OLD.revision ELSE NULL END,NEW.revision,
  NEW.action_actor_user_id,NEW.action_reason
 );
 RETURN NEW;
END $$;
CREATE TRIGGER auth_license_approval_audit_trg
 AFTER INSERT OR UPDATE ON public.auth_license_approval_requests
 FOR EACH ROW EXECUTE FUNCTION public.auth_license_approval_audit_event();

CREATE FUNCTION public.auth_license_approval_audit_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'AUTH_LICENSE_APPROVAL_AUDIT_IMMUTABLE' USING ERRCODE='42501';
END $$;
CREATE TRIGGER auth_license_approval_audit_immutable_trg
 BEFORE UPDATE OR DELETE ON public.auth_license_approval_audit
 FOR EACH ROW EXECUTE FUNCTION public.auth_license_approval_audit_immutable();

REVOKE ALL ON public.auth_license_approval_requests FROM PUBLIC;
REVOKE ALL ON public.auth_license_approval_audit FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_license_approval_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_license_approval_audit_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_license_approval_audit_immutable() FROM PUBLIC;
-- No INSERT/UPDATE/DELETE/SELECT is granted to the normal application role.
-- No operator identity assignment in auth_access_grants.
-- A future security-reviewed service must authenticate caller identity, check
-- precise central AUTH scope+role, apply distinct human review and audit changes.
COMMIT;
