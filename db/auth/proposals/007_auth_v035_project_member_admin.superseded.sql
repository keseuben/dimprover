-- DIMPRO AUTH V0.3.5 - project membership role administration
-- DEV first. Exact project scope only. PROD remains denied by deployment policy.

CREATE OR REPLACE FUNCTION public.auth_set_project_access_role(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_project_id uuid,
  p_role_code text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_product_id uuid;
  v_role_id uuid;
  v_organization_id uuid;
BEGIN
  IF p_role_code NOT IN ('DRIVE_PROJECT_MEMBER','DRIVE_PROJECT_MANAGER') THEN
    RAISE EXCEPTION 'AUTH_PROJECT_ROLE_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT product.id INTO v_product_id
    FROM public.auth_products product
   WHERE product.code='DRIVE' AND product.status='ACTIVE';
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_INVITATION_PRODUCT_UNAVAILABLE' USING ERRCODE='55000';
  END IF;

  SELECT project.organization_id INTO v_organization_id
    FROM public.auth_projects project
   WHERE project.id=p_project_id AND project.status='ACTIVE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTH_INVITATION_PROJECT_INVALID' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.auth_access_grants grant_row
      JOIN public.auth_role_permissions rp ON rp.role_id=grant_row.role_id
      JOIN public.auth_permissions permission ON permission.id=rp.permission_id
     WHERE grant_row.user_id=p_actor_user_id
       AND grant_row.product_id=v_product_id
       AND grant_row.project_id=p_project_id
       AND permission.code='project.members.invite'
       AND grant_row.revoked_at IS NULL
       AND grant_row.valid_from<=now()
       AND (grant_row.valid_until IS NULL OR grant_row.valid_until>=now())
  ) THEN
    RAISE EXCEPTION 'AUTH_INVITATION_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.auth_users auth_user
     WHERE auth_user.id=p_target_user_id AND auth_user.status='ACTIVE'
  ) THEN
    RAISE EXCEPTION 'AUTH_INVITATION_USER_BLOCKED' USING ERRCODE='42501';
  END IF;

  SELECT role.id INTO v_role_id
    FROM public.auth_roles role
   WHERE role.code=p_role_code;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_INVITATION_ROLE_MISSING' USING ERRCODE='55000';
  END IF;

  UPDATE public.auth_access_grants grant_row
     SET revoked_at=now()
    FROM public.auth_roles current_role
   WHERE grant_row.role_id=current_role.id
     AND grant_row.user_id=p_target_user_id
     AND grant_row.product_id=v_product_id
     AND grant_row.project_id=p_project_id
     AND grant_row.revoked_at IS NULL
     AND current_role.code IN ('DRIVE_PROJECT_MEMBER','DRIVE_PROJECT_MANAGER')
     AND current_role.id<>v_role_id;

  -- Expired/future-dated grants still participate in the active-scope unique index
  -- while revoked_at is null. Revoke an unusable same-role row before inserting a
  -- fresh exact-scope grant.
  UPDATE public.auth_access_grants grant_row
     SET revoked_at=now()
   WHERE grant_row.user_id=p_target_user_id
     AND grant_row.role_id=v_role_id
     AND grant_row.product_id=v_product_id
     AND grant_row.project_id=p_project_id
     AND grant_row.revoked_at IS NULL
     AND (grant_row.valid_from>now() OR (grant_row.valid_until IS NOT NULL AND grant_row.valid_until<now()));

  INSERT INTO public.auth_access_grants(
    user_id,role_id,product_id,organization_id,project_id,valid_from
  )
  SELECT p_target_user_id,v_role_id,v_product_id,v_organization_id,p_project_id,now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.auth_access_grants grant_row
     WHERE grant_row.user_id=p_target_user_id
       AND grant_row.role_id=v_role_id
       AND grant_row.product_id=v_product_id
       AND grant_row.project_id=p_project_id
       AND grant_row.revoked_at IS NULL
       AND grant_row.valid_from<=now()
       AND (grant_row.valid_until IS NULL OR grant_row.valid_until>=now())
  );

  INSERT INTO public.auth_audit_events(
    event_type,user_id,method,result,correlation_id,metadata
  ) VALUES (
    'PROJECT_ACCESS_ROLE_CHANGE',
    p_actor_user_id,
    'DIMPRO_AUTH_SCOPE',
    'SUCCESS',
    gen_random_uuid()::text,
    jsonb_build_object(
      'targetUserId',p_target_user_id,
      'projectId',p_project_id,
      'roleCode',p_role_code
    )
  );

  RETURN p_role_code;
END;
$$;

REVOKE ALL ON FUNCTION public.auth_set_project_access_role(uuid,uuid,uuid,text) FROM PUBLIC;

DO $$
DECLARE
  app_role text;
BEGIN
  IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
    RAISE EXCEPTION 'DIMPRO AUTH role-sync migration must run as an environment migrator role; current_user=%', current_user;
  END IF;
  app_role := regexp_replace(current_user, '_migrator_', '_app_');
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
    RAISE EXCEPTION 'DIMPRO AUTH runtime role % does not exist', app_role;
  END IF;
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.auth_set_project_access_role(uuid,uuid,uuid,text) TO %I',
    app_role
  );
END;
$$;
