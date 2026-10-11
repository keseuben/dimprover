-- DIMPRO Professional roles, SOURCE ONLY; no authorization implication and no automatic notifications.
BEGIN;
CREATE TABLE IF NOT EXISTS public.drive_core_member_professional_roles (
 project_id text NOT NULL,
 membership_id text NOT NULL,
 roles text[] NOT NULL DEFAULT '{}',
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,membership_id),
 CONSTRAINT drive_professional_roles_count_check CHECK (cardinality(roles)<=8),
 CONSTRAINT drive_professional_roles_values_check CHECK (
  roles <@ ARRAY['INVESTOR','CLIENT','INVESTMENT_MANAGER','TECHNICAL_INSPECTOR',
   'GENERAL_DESIGNER','DISCIPLINE_DESIGNER','PROJECT_MANAGER_ENGINEER',
   'GENERAL_CONTRACTOR','RESPONSIBLE_SITE_MANAGER','SPECIALIST_CONTRACTOR','SUPPLIER','OTHER_PARTICIPANT']::text[])
);
CREATE TABLE IF NOT EXISTS public.drive_core_member_professional_roles_audit (
 id bigint generated always as identity primary key,
 project_id text NOT NULL,
 membership_id text NOT NULL,
 old_roles text[] NOT NULL,
 new_roles text[] NOT NULL,
 actor_user_id text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.drive_core_member_professional_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_core_member_professional_roles_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drive_core_member_professional_roles FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.drive_core_member_professional_roles_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.drive_core_member_professional_roles TO service_role;
CREATE OR REPLACE FUNCTION public.drive_set_professional_roles_atomic(
 p_project_id text,p_membership_id text,p_roles text[],p_actor_user_id text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_old text[]; v_normalized text[];
BEGIN
 IF p_project_id IS NULL OR p_membership_id IS NULL OR p_actor_user_id IS NULL THEN
  RAISE EXCEPTION 'DRIVE_PROFESSIONAL_ROLE_INVALID_INPUT' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.project_core_memberships
  WHERE project_id=p_project_id AND id=p_membership_id AND status='ACTIVE') THEN
  RAISE EXCEPTION 'DRIVE_PROFESSIONAL_ROLE_MEMBERSHIP_NOT_ACTIVE' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(array_agg(DISTINCT r ORDER BY r),'{}'::text[]) INTO v_normalized
 FROM unnest(coalesce(p_roles,'{}'::text[])) r;
 IF cardinality(v_normalized)>8 OR NOT (
  v_normalized <@ ARRAY['INVESTOR','CLIENT','INVESTMENT_MANAGER','TECHNICAL_INSPECTOR',
   'GENERAL_DESIGNER','DISCIPLINE_DESIGNER','PROJECT_MANAGER_ENGINEER',
   'GENERAL_CONTRACTOR','RESPONSIBLE_SITE_MANAGER','SPECIALIST_CONTRACTOR','SUPPLIER','OTHER_PARTICIPANT']::text[]
 ) THEN
  RAISE EXCEPTION 'DRIVE_PROFESSIONAL_ROLE_INVALID_CODE' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id||':'||p_membership_id,0));
 SELECT roles INTO v_old FROM public.drive_core_member_professional_roles
 WHERE project_id=p_project_id AND membership_id=p_membership_id FOR UPDATE;
 v_old:=coalesce(v_old,'{}'::text[]);
 IF v_old=v_normalized THEN RETURN; END IF;
 INSERT INTO public.drive_core_member_professional_roles(project_id,membership_id,roles,updated_by)
 VALUES(p_project_id,p_membership_id,v_normalized,p_actor_user_id)
 ON CONFLICT(project_id,membership_id) DO UPDATE SET
  roles=excluded.roles,updated_by=excluded.updated_by,updated_at=now();
 INSERT INTO public.drive_core_member_professional_roles_audit(project_id,membership_id,old_roles,new_roles,actor_user_id)
 VALUES(p_project_id,p_membership_id,v_old,v_normalized,p_actor_user_id);
END; $$;
REVOKE ALL ON FUNCTION public.drive_set_professional_roles_atomic(text,text,text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drive_set_professional_roles_atomic(text,text,text[],text) TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.drive_core_member_professional_roles_audit_id_seq TO service_role;
GRANT INSERT,UPDATE,SELECT ON public.drive_core_member_professional_roles TO service_role;
GRANT INSERT ON public.drive_core_member_professional_roles_audit TO service_role;
COMMENT ON TABLE public.drive_core_member_professional_roles IS 'Descriptive professional roles only. Never use as authorization grants; ACL and technical Project Core roles remain authoritative.';
COMMIT;
