const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

async function main() {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const stamp = Date.now();
  const projectId = `drive-v030-hotfix-${stamp}`;
  const now = new Date().toISOString();
  let created = false;

  try {
    const project = {
      id: projectId,
      organization_id: null,
      code: `HFX-${String(stamp).slice(-6)}`,
      name: 'DRIVE conflict hotfix test',
      description: 'Temporary',
      status: 'DRAFT',
      progress_percent: 0,
      current_phase: 'Hotfix test',
      starts_at: null,
      ends_at: null,
      created_by: 'license-admin',
      created_at: now,
      updated_at: now,
    };
    const membership = {
      id: `membership-${crypto.randomUUID().slice(0, 12)}`,
      project_id: projectId,
      user_id: 'license-admin',
      email: null,
      display_name: 'License admin',
      organization_name: null,
      role: 'OWNER',
      status: 'ACTIVE',
      invited_at: now,
      accepted_at: now,
      updated_at: now,
    };
    const audit = {
      id: `project-audit-${crypto.randomUUID().slice(0, 12)}`,
      project_id: projectId,
      actor_user_id: 'license-admin',
      event_type: 'PROJECT_CREATED',
      entity_type: 'project',
      entity_id: projectId,
      summary: 'Hotfix test project',
      metadata: {},
      created_at: now,
    };

    let result = await client.rpc('project_core_create_project_atomic', {
      p_project: project,
      p_membership: membership,
      p_audit: audit,
    });
    if (result.error) throw result.error;
    created = true;

    result = await client.rpc('drive_core_bootstrap_project', {
      p_project_id: projectId,
      p_actor_user_id: 'license-admin',
    });
    if (result.error) throw result.error;

    const folder = await client
      .from('drive_core_folders')
      .select('id,path')
      .eq('project_id', projectId)
      .eq('path', '01_Tervek/Epiteszet')
      .single();
    if (folder.error) throw folder.error;

    const documentId = `drive-document-${crypto.randomUUID().slice(0, 12)}`;
    const document = {
      id: documentId,
      folder_id: folder.data.id,
      name: 'hotfix.pdf',
      extension: 'pdf',
      mime_type: 'application/pdf',
      description: '',
      source: 'SYSTEM',
      created_by: 'license-admin',
      created_at: now,
      updated_at: now,
    };
    const version1 = {
      id: `drive-version-${crypto.randomUUID().slice(0, 12)}`,
      version_number: 1,
      revision_code: 'V1',
      original_name: 'hotfix.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1,
      sha256: null,
      storage_provider: 'METADATA_ONLY',
      status: 'METADATA_ONLY',
      change_note: '',
      created_by: 'license-admin',
      created_at: now,
    };

    result = await client.rpc('drive_core_create_document_atomic', {
      p_project_id: projectId,
      p_document: document,
      p_version: version1,
      p_actor_user_id: 'license-admin',
    });
    if (result.error) throw result.error;

    const version2 = {
      id: `drive-version-${crypto.randomUUID().slice(0, 12)}`,
      expected_current_version: 1,
      revision_code: 'V2',
      original_name: 'hotfix-v2.pdf',
      mime_type: 'application/pdf',
      size_bytes: 2,
      sha256: null,
      storage_provider: 'METADATA_ONLY',
      status: 'METADATA_ONLY',
      change_note: '',
      created_by: 'license-admin',
      created_at: now,
    };

    result = await client.rpc('drive_core_add_version_atomic', {
      p_project_id: projectId,
      p_document_id: documentId,
      p_version: version2,
      p_actor_user_id: 'license-admin',
    });
    if (result.error) throw result.error;

    const staleVersion = {
      id: `drive-version-${crypto.randomUUID().slice(0, 12)}`,
      expected_current_version: 1,
      revision_code: 'V3',
      original_name: 'hotfix-stale.pdf',
      mime_type: 'application/pdf',
      size_bytes: 3,
      sha256: null,
      storage_provider: 'METADATA_ONLY',
      status: 'METADATA_ONLY',
      change_note: '',
      created_by: 'license-admin',
      created_at: now,
    };

    const startedAt = Date.now();
    const conflict = await client.rpc('drive_core_add_version_atomic', {
      p_project_id: projectId,
      p_document_id: documentId,
      p_version: staleVersion,
      p_actor_user_id: 'license-admin',
    });
    const durationMs = Date.now() - startedAt;
    const pass = Boolean(
      conflict.error
      && conflict.error.code === 'P0001'
      && String(conflict.error.message || '').includes('DRIVE_CORE_VERSION_CONFLICT')
      && durationMs < 10000
    );

    console.log(JSON.stringify({
      pass,
      projectId,
      durationMs,
      error: conflict.error,
      data: conflict.data,
    }, null, 2));

    if (!pass) process.exitCode = 1;
  } finally {
    if (created) {
      const cleanup = await client.from('project_core_projects').delete().eq('id', projectId);
      if (cleanup.error) throw cleanup.error;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
