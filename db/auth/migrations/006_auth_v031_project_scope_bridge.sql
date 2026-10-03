-- DIMPRO AUTH V0.3.1 · Project Core -> central AUTH project-scope bridge
-- IMPORTANT: the HTTP/service caller must first prove Project Core `project.manage_members`
-- on p_external_project_id. This function independently requires live central Drive access
-- and never accepts a target user different from the authenticated actor.

CREATE OR REPLACE FUNCTION auth_register_project_scope(
  p_actor_user_id uuid,
  p_external_project_id text,
  p_project_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_external_project_id text := btrim(p_external_project_id);
  v_project_name text := btrim(p_project_name);
  v_product_id uuid;
  v_manager_role_id uuid;
  v_auth_project_id uuid;
  v_status text;
BEGIN
  IF length(v_external_project_id)<1 OR length(v_external_project_id)>200 OR v_external_project_id ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'AUTH_PROJECT_SCOPE_EXTERNAL_ID_INVALID' USING ERRCODE='22023';
  END IF;
  IF length(v_project_name)<1 OR length(v_project_name)>240 OR v_project_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'AUTH_PROJECT_SCOPE_NAME_INVALID' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.auth_users auth_user
     WHERE auth_user.id=p_actor_user_id AND auth_user.status='ACTIVE' AND auth_user.login_enabled=true
  ) THEN
    RAISE EXCEPTION 'AUTH_PROJECT_SCOPE_ACTOR_INVALID' USING ERRCODE='42501';
  END IF;
  SELECT product.id INTO v_product_id
    FROM public.auth_products product
   WHERE product.code='DRIVE' AND product.status='ACTIVE';
  SELECT role.id INTO v_manager_role_id
    FROM public.auth_roles role
   WHERE role.code='DRIVE_PROJECT_MANAGER';
  IF v_product_id IS NULL OR v_manager_role_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_PROJECT_SCOPE_PREREQUISITE_MISSING' USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.auth_access_grants grant_row
      JOIN public.auth_role_permissions rp ON rp.role_id=grant_row.role_id
      JOIN public.auth_permissions permission ON permission.id=rp.permission_id
     WHERE grant_row.user_id=p_actor_user_id
       AND grant_row.product_id=v_product_id
       AND permission.code='drive.access'
       AND grant_row.revoked_at IS NULL
       AND grant_row.valid_from<=now()
       AND (grant_row.valid_until IS NULL OR grant_row.valid_until>=now())
  ) THEN
    RAISE EXCEPTION 'AUTH_PROJECT_SCOPE_DRIVE_ACCESS_REQUIRED' USING ERRCODE='42501';
  END IF;

  SELECT project.id,project.status INTO v_auth_project_id,v_status
    FROM public.auth_projects project
   WHERE project.external_project_id=v_external_project_id
   LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_status='DISABLED' THEN
      RAISE EXCEPTION 'AUTH_PROJECT_SCOPE_DISABLED' USING ERRCODE='42501';
    END IF;
    UPDATE public.auth_projects project
       SET name=v_project_name,status='ACTIVE'
     WHERE project.id=v_auth_project_id;
  ELSE
    INSERT INTO public.auth_projects(external_project_id,name,status)
    VALUES(v_external_project_id,v_project_name,'ACTIVE')
    RETURNING id INTO v_auth_project_id;
  END IF;

  INSERT INTO public.auth_access_grants(user_id,role_id,product_id,project_id)
  SELECT p_actor_user_id,v_manager_role_id,v_product_id,v_auth_project_id
   WHERE NOT EXISTS (
     SELECT 1 FROM public.auth_access_grants grant_row
      WHERE grant_row.user_id=p_actor_user_id
        AND grant_row.role_id=v_manager_role_id
        AND grant_row.product_id=v_product_id
        AND grant_row.project_id=v_auth_project_id
        AND grant_row.revoked_at IS NULL
   );

  INSERT INTO public.auth_audit_events(event_type,user_id,method,result,correlation_id,metadata)
  VALUES(
    'PROJECT_SCOPE_REGISTER',p_actor_user_id,'PROJECT_CORE_BRIDGE','SUCCESS',gen_random_uuid()::text,
    jsonb_build_object('externalProjectId',v_external_project_id,'authProjectId',v_auth_project_id)
  );

  RETURN v_auth_project_id;
END;
$$;

REVOKE ALL ON FUNCTION auth_register_project_scope(uuid,text,text) FROM PUBLIC;

DO $$
DECLARE
  app_role text;
BEGIN
  IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
    RAISE EXCEPTION 'DIMPRO AUTH project bridge migration must run as an environment migrator role; current_user=%',current_user;
  END IF;
  app_role := regexp_replace(current_user,'_migrator_','_app_');
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
    RAISE EXCEPTION 'DIMPRO AUTH runtime role % does not exist',app_role;
  END IF;
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.auth_register_project_scope(uuid,text,text) TO %I',app_role);
END;
$$;
