import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

const PORT = Number(process.env.DROP_IDENTITY_E2E_PORT || 3120);
const FORWARDED_IP = '198.51.100.211';
const USER_AGENT = 'DIMPRO DROP 1.2.4 full UX Identity E2E';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name) {
  const value = process.env[name]?.trim();
  assert.ok(value, `${name} hiányzik`);
  return value;
}

function api(path, input = {}) {
  return new Promise((resolve, reject) => {
    const payload = input.body === undefined ? null : Buffer.from(JSON.stringify(input.body));
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method: input.method || 'GET',
      headers: {
        Host: input.host || 'drop.dimpro.hu',
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        'X-Forwarded-For': FORWARDED_IP,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) } : {}),
        ...(input.cookie ? { Cookie: input.cookie } : {}),
        ...(input.bearer ? { Authorization: `Bearer ${input.bearer}` } : {}),
        ...(input.adminKey ? { 'x-dimpro-license-admin-key': input.adminKey } : {}),
        ...(input.workerSecret ? { 'x-dimpro-drop-worker-secret': input.workerSecret } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { /* keep raw */ }
        const setCookie = res.headers['set-cookie'];
        resolve({ status: res.statusCode || 0, raw, json, headers: res.headers, setCookie: Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [] });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function cookieValue(rows) {
  return rows.map((row) => row.split(';', 1)[0]).join('; ');
}

async function rpcScalar(client, fn) {
  const result = await client.rpc(fn);
  if (result.error) throw result.error;
  return String(result.data);
}

async function waitClean(client, fileId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await client.from('drop_files').select('id,security_status,virus_scan_status,processing_status,storage_key,storage_bucket,size_stored_bytes,group_id').eq('id', fileId).single();
    if (result.error) throw result.error;
    if (result.data.security_status === 'clean' && result.data.virus_scan_status === 'clean' && result.data.processing_status === 'ready') return result.data;
    if (result.data.security_status === 'infected') throw new Error('Az E2E tesztfájl fertőzöttnek minősült.');
    await sleep(1000);
  }
  throw new Error('ClamAV/worker timeout az Identity Core E2E-ben.');
}

async function uploadOne(initialized, bytes) {
  const signUrl = String(initialized.partSignUrlTemplate || initialized.partUrlTemplate).replace('{partNumber}', '1');
  const signed = await api(signUrl, { method: 'POST', bearer: initialized.uploadToken });
  assert.equal(signed.status, 200, `part sign: ${signed.status} ${signed.raw}`);
  const put = await fetch(signed.json.signed.url, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes });
  assert.ok(put.ok, `S3 PUT: ${put.status} ${await put.text()}`);
  const etag = (put.headers.get('etag') || '').replace(/^"|"$/g, '');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const confirmUrl = String(initialized.partConfirmUrlTemplate || initialized.partUrlTemplate).replace('{partNumber}', '1');
  const confirmed = await api(confirmUrl, { method: 'PATCH', bearer: initialized.uploadToken, body: { checksum, etag, receivedBytes: bytes.length } });
  assert.equal(confirmed.status, 200, `part confirm: ${confirmed.status} ${confirmed.raw}`);
  const completed = await api(initialized.completeUrl, { method: 'POST', bearer: initialized.uploadToken });
  assert.equal(completed.status, 200, `upload complete: ${completed.status} ${completed.raw}`);
}

function storageConfig() {
  const env = (a, b) => process.env[a]?.trim() || (b ? process.env[b]?.trim() : '') || '';
  return {
    endpoint: env('DIMPRO_DROP_S3_ENDPOINT', 'DROP_STORAGE_ENDPOINT'),
    region: env('DIMPRO_DROP_S3_REGION', 'DROP_STORAGE_REGION'),
    accessKeyId: env('DIMPRO_DROP_S3_ACCESS_KEY_ID', 'DROP_STORAGE_ACCESS_KEY_ID'),
    secretAccessKey: env('DIMPRO_DROP_S3_SECRET_ACCESS_KEY', 'DROP_STORAGE_SECRET_ACCESS_KEY'),
    bucket: env('DIMPRO_DROP_S3_BUCKET', 'DROP_STORAGE_BUCKET'),
    forcePathStyle: env('DIMPRO_DROP_S3_FORCE_PATH_STYLE', 'DROP_STORAGE_FORCE_PATH_STYLE').toLowerCase() === 'true',
  };
}

async function cleanupS3(client, packageId) {
  const cfg = storageConfig();
  if (!cfg.endpoint || !cfg.region || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) return 0;
  const s3 = new S3Client({ endpoint: cfg.endpoint, region: cfg.region, forcePathStyle: cfg.forcePathStyle, credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } });
  const [files, reports] = await Promise.all([
    client.from('drop_files').select('storage_key,storage_bucket').eq('package_id', packageId),
    client.from('drop_reports').select('storage_key').eq('package_id', packageId),
  ]);
  if (files.error) throw files.error;
  if (reports.error) throw reports.error;
  const objects = [];
  for (const row of files.data || []) if (row.storage_key) objects.push({ Key: row.storage_key, Bucket: row.storage_bucket || cfg.bucket });
  for (const row of reports.data || []) if (row.storage_key) objects.push({ Key: row.storage_key, Bucket: cfg.bucket });
  for (const object of objects) await s3.send(new DeleteObjectCommand(object)).catch(() => undefined);
  s3.destroy();
  return objects.length;
}

async function main() {
  const client = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const adminKey = (await readFile('.dimprover/license/admin-key.txt', 'utf8')).trim();
  assert.ok(adminKey.length >= 20, 'Licencadmin kulcs hiányzik');
  const unique = `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`;
  const manualSendCode = `EETX-${String(Date.now() % 1000000).padStart(6, '0').slice(0, 3)}-${String(Date.now() % 1000000).padStart(6, '0').slice(3)}`;
  const fixtureEmail = `drop-identity-e2e-${unique}@example.invalid`;
  const recipientEmail = 'admin@dimpro.hu';
  const now = new Date();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const fixture = { userId: '', licenseId: '', projectId: '', projectCode: '', entitlementId: '', packageId: '', fileId: '', rateHash: '' };
  const evidence = { ok: false, version: 'DROP 1.2.4', checks: [], auditEvents: [], rateLimit: null, accountingCount: null, packagePublicCode: null, projectCode: null, cleanup: { s3Objects: 0 } };

  const check = (name, condition, detail = undefined) => {
    assert.ok(condition, `${name}${detail ? `: ${detail}` : ''}`);
    evidence.checks.push(name);
  };

  try {
    const publicUserCode = await rpcScalar(client, 'dimpro_generate_user_code');
    const userInsert = await client.from('dimpro_users').insert({
      public_user_code: publicUserCode,
      full_name: 'DIMPRO Identity E2E felhasználó',
      email: fixtureEmail,
      email_normalized: fixtureEmail,
      email_verified_at: now.toISOString(),
      status: 'active',
    }).select('id').single();
    if (userInsert.error) throw userInsert.error;
    fixture.userId = userInsert.data.id;

    const publicLicenseCode = await rpcScalar(client, 'dimpro_generate_license_code');
    const licenseInsert = await client.from('dimpro_licenses').insert({
      public_license_code: publicLicenseCode,
      owner_type: 'user',
      owner_user_id: fixture.userId,
      product_code: 'DIMPRO',
      plan_code: 'E2E',
      status: 'active',
      activated_at: now.toISOString(),
      expires_at: expires,
      max_devices: 1,
    }).select('id').single();
    if (licenseInsert.error) throw licenseInsert.error;
    fixture.licenseId = licenseInsert.data.id;

    fixture.projectCode = await rpcScalar(client, 'dimpro_generate_project_code');
    const projectInsert = await client.from('dimpro_projects').insert({
      public_project_code: fixture.projectCode,
      name: `Identity E2E projekt ${unique}`,
      short_name: 'Identity E2E',
      description: 'Automatikus, ideiglenes Drop Identity Core E2E fixture.',
      status: 'active',
      project_drop_enabled: true,
      created_by: fixture.userId,
    }).select('id').single();
    if (projectInsert.error) throw projectInsert.error;
    fixture.projectId = projectInsert.data.id;

    const membership = await client.from('dimpro_project_memberships').insert({
      project_id: fixture.projectId,
      user_id: fixture.userId,
      role_code: 'e2e_sender',
      can_view: true,
      can_upload_to_drop: true,
      can_download: true,
      can_manage_inbox: false,
      status: 'active',
      valid_from: now.toISOString(),
    });
    if (membership.error) throw membership.error;
    const settings = await client.from('dimpro_project_drop_settings').insert({
      project_id: fixture.projectId,
      enabled: true,
      incoming_folder_name: 'Beérkező Drop',
      preserve_groups: true,
      require_virus_scan: true,
      notify_project_admins: false,
    });
    if (settings.error) throw settings.error;
    check('central-fixture-created', true);

    const adminCreate = await api('/api/dimpro-identity/admin/send-entitlements', {
      method: 'POST', host: 'license.dimpro.hu', adminKey, body: {
        userId: fixture.userId,
        licenseId: fixture.licenseId,
        sendCode: manualSendCode,
        recipientMode: 'locked_default',
        recipients: [{ name: 'DIMPRO E2E fogadó', email: recipientEmail, organizationName: 'DIMPRO', label: 'E2E', isDefault: true, locked: true }],
        canUseStandardSend: true,
        canUseQuickImageSend: true,
        canUseImageGroups: true,
        canUseFileComments: true,
        canUseProjectDrop: true,
        maxRecipients: 3,
        maxPackageSizeBytes: 5 * 1024 * 1024,
        monthlySendLimit: 3,
        expiresAt: expires,
      },
    });
    assert.equal(adminCreate.status, 201, `admin entitlement: ${adminCreate.status} ${adminCreate.raw}`);
    const rawCode = adminCreate.json?.created?.rawCode;
    check('manual-send-code-preserved', rawCode === manualSendCode, String(rawCode));
    fixture.entitlementId = String(adminCreate.json?.created?.result?.entitlementId || '');
    check('central-entitlement-admin-created', typeof rawCode === 'string' && rawCode.length === 12 && fixture.entitlementId.length > 20);

    const verify = await api('/api/dimpro-identity/send/verify', { method: 'POST', body: { code: rawCode } });
    assert.equal(verify.status, 200, `central verify: ${verify.status} ${verify.raw}`);
    const sendSessionToken = verify.json?.sendSession?.token;
    check('send-code-central-verify', verify.json?.ok === true && verify.json?.entitlement?.id === fixture.entitlementId && typeof sendSessionToken === 'string');
    check('verified-sender-bound', verify.json?.user?.id === fixture.userId && verify.json?.user?.email === fixtureEmail);
    check('locked-recipient-returned', verify.json?.defaultRecipient?.email === recipientEmail && Array.isArray(verify.json?.approvedRecipients));

    const projects = await api('/api/dimpro-identity/send/projects', { bearer: sendSessionToken });
    assert.equal(projects.status, 200, `project list: ${projects.status} ${projects.raw}`);
    check('allowed-project-list', projects.json?.projects?.some((p) => p.id === fixture.projectId && p.publicCode === fixture.projectCode));

    const rateBefore = await client.from('dimpro_access_rate_limits').select('subject_hash').eq('scope', 'project_code');
    if (rateBefore.error) throw rateBefore.error;
    const existingRateHashes = new Set((rateBefore.data || []).map((row) => row.subject_hash));
    const wrongProjectCode = 'PRJ-26-AAA-BBB';
    assert.notEqual(wrongProjectCode, fixture.projectCode);
    const wrongProject = await api('/api/dimpro-identity/projects/verify-code', { method: 'POST', bearer: sendSessionToken, body: { projectCode: wrongProjectCode } });
    assert.equal(wrongProject.status, 403, `wrong project code: ${wrongProject.status} ${wrongProject.raw}`);
    const rateAfter = await client.from('dimpro_access_rate_limits').select('scope,subject_hash,failure_count,locked_until,updated_at').eq('scope', 'project_code').order('updated_at', { ascending: false });
    if (rateAfter.error) throw rateAfter.error;
    const rateRow = (rateAfter.data || []).find((row) => !existingRateHashes.has(row.subject_hash));
    fixture.rateHash = rateRow?.subject_hash || '';
    check('project-rate-limit-recorded', Boolean(rateRow && rateRow.failure_count >= 1));
    evidence.rateLimit = { scope: rateRow?.scope || null, failureCount: rateRow?.failure_count || 0, locked: Boolean(rateRow?.locked_until) };

    const projectVerify = await api('/api/dimpro-identity/projects/verify-code', { method: 'POST', bearer: sendSessionToken, body: { projectCode: fixture.projectCode } });
    assert.equal(projectVerify.status, 200, `project verify: ${projectVerify.status} ${projectVerify.raw}`);
    check('project-code-central-verify', projectVerify.json?.ok === true && projectVerify.json?.project?.id === fixture.projectId);
    check('incoming-drop-target', projectVerify.json?.destination?.type === 'project_drop_inbox' && projectVerify.json?.destination?.label === 'Beérkező Drop');

    const bridge = await api('/api/drop/public/send/session', { method: 'POST', body: { sendSessionToken, website: '' } });
    assert.equal(bridge.status, 201, `drop session bridge: ${bridge.status} ${bridge.raw}`);
    const dropCookie = cookieValue(bridge.setCookie);
    check('identity-to-drop-session-bridge', bridge.json?.session?.identityCore === true && dropCookie.length > 10);

    const packageCreate = await api('/api/drop/public/packages', { method: 'POST', cookie: dropCookie, body: {
      workflowType: 'send',
      senderName: 'IGNORED CLIENT NAME',
      senderEmail: 'ignored@example.invalid',
      subject: `DROP Identity E2E ${unique}`,
      senderMessage: 'Automatikus Identity Core fogyasztói E2E.',
      packageNote: 'Automatikus tesztcsomag; a teszt végén törlendő.',
      retentionDays: 1,
      downloadProtection: 'link',
      recipients: [{ name: 'IGNORED CLIENT RECIPIENT', email: 'ignored@example.invalid' }],
      projectCode: fixture.projectCode,
    } });
    assert.equal(packageCreate.status, 201, `package create: ${packageCreate.status} ${packageCreate.raw}`);
    fixture.packageId = packageCreate.json?.created?.package?.id || '';
    evidence.packagePublicCode = packageCreate.json?.created?.package?.publicCode || null;
    evidence.projectCode = fixture.projectCode;
    const uploadToken = packageCreate.json?.created?.uploadToken;
    check('project-send-package-created', fixture.packageId.length > 20 && typeof uploadToken === 'string');
    check('central-package-limit-applied', Number(packageCreate.json?.created?.package?.maxTotalSizeBytes) <= 5 * 1024 * 1024);

    const workflowRow = await client.from('drop_public_package_workflows').select('dimpro_send_entitlement_id,dimpro_project_id,project_public_code,target_folder,recipient_emails,identity_accounted_at').eq('package_id', fixture.packageId).single();
    if (workflowRow.error) throw workflowRow.error;
    check('central-ids-persisted', workflowRow.data.dimpro_send_entitlement_id === fixture.entitlementId && workflowRow.data.dimpro_project_id === fixture.projectId && workflowRow.data.project_public_code === fixture.projectCode);
    check('server-locked-recipient-enforced', Array.isArray(workflowRow.data.recipient_emails) && workflowRow.data.recipient_emails.length === 1 && workflowRow.data.recipient_emails[0] === recipientEmail);
    check('incoming-folder-persisted', workflowRow.data.target_folder === 'Beérkező Drop');

    const group = await api('/api/drop/access/groups', { method: 'POST', bearer: uploadToken, body: { name: 'E2E helyszín', description: 'Identity Core E2E képcsoport.' } });
    assert.ok([200, 201].includes(group.status), `group: ${group.status} ${group.raw}`);
    const groupId = group.json?.group?.id;
    check('logical-group-created', typeof groupId === 'string' && groupId.length > 20);

    const intent = await api('/api/drop/access/uploads/intent', { method: 'POST', bearer: uploadToken, body: { count: 1 } });
    assert.equal(intent.status, 201, `upload intent: ${intent.status} ${intent.raw}`);
    await sleep(1700);
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAfR3fOQAAAAASUVORK5CYII=', 'base64');
    const structuredFileName = `260807_2359_260808_F0001_e2e_foto.png`;
    const init = await api('/api/drop/access/uploads/init', { method: 'POST', bearer: uploadToken, body: {
      fileName: structuredFileName,
      originalFileName: `IMG_${unique}.PNG`,
      displayFileName: structuredFileName,
      sourceOriginalSizeBytes: bytes.length,
      sizeBytes: bytes.length,
      mimeType: 'image/png',
      groupId,
      clientUploadId: `identity-e2e-${unique}`,
      uploadedByName: 'DIMPRO Identity E2E felhasználó',
      uploadedByEmail: fixtureEmail,
      rulesAccepted: true,
      rulesVersion: 'DIMPRO-DROP-UPLOAD-HU-1.0',
      rulesAcceptedAt: new Date().toISOString(),
      robotGuard: { intentToken: intent.json?.intents?.[0]?.token, website: '' },
    } });
    assert.equal(init.status, 201, `upload init: ${init.status} ${init.raw}`);
    const initialized = init.json?.initialized;
    fixture.fileId = initialized?.file?.id || '';
    await uploadOne(initialized, bytes);
    check('real-object-storage-upload', fixture.fileId.length > 20);

    const workerRun = await api('/api/drop/worker/run', {
      method: 'POST',
      host: '127.0.0.1',
      workerSecret: required('DROP_WORKER_SECRET'),
      body: { limit: 2, scanOnly: true },
    });
    assert.equal(workerRun.status, 200, `candidate scan-only worker: ${workerRun.status} ${workerRun.raw}`);
    check('candidate-scan-only-worker', workerRun.json?.ok === true && Number(workerRun.json?.claimedScanJobs || 0) >= 1);
    const clean = await waitClean(client, fixture.fileId);
    check('virus-scan-clean', clean.security_status === 'clean' && clean.virus_scan_status === 'clean');
    check('group-preserved-on-file', clean.group_id === groupId);

    const final = await api(`/api/drop/public/packages/${encodeURIComponent(fixture.packageId)}/finalize`, { method: 'POST', cookie: dropCookie });
    assert.equal(final.status, 200, `finalize: ${final.status} ${final.raw}`);
    check('send-finalized', final.json?.ok === true || final.json?.result?.delivery?.sent >= 1);

    const workflowAfter = await client.from('drop_public_package_workflows').select('dimpro_send_entitlement_id,dimpro_project_id,project_public_code,identity_accounted_at,finalized_at,notification_status').eq('package_id', fixture.packageId).single();
    if (workflowAfter.error) throw workflowAfter.error;
    const entitlementAfter = await client.from('dimpro_send_entitlements').select('current_month_send_count,last_used_at').eq('id', fixture.entitlementId).single();
    if (entitlementAfter.error) throw entitlementAfter.error;
    const accountingAudit = await client.from('dimpro_access_audit_logs').select('event_type,success,project_id').eq('entitlement_id', fixture.entitlementId).eq('event_type', 'send_completed');
    if (accountingAudit.error) throw accountingAudit.error;
    const dropAccountingEvent = await client.from('drop_events').select('event_type').eq('package_id', fixture.packageId).eq('event_type', 'identity.send_accounted');
    if (dropAccountingEvent.error) throw dropAccountingEvent.error;
    evidence.accountingDiagnostics = {
      workflowEntitlementBound: workflowAfter.data.dimpro_send_entitlement_id === fixture.entitlementId,
      workflowProjectBound: workflowAfter.data.dimpro_project_id === fixture.projectId,
      accountedAt: Boolean(workflowAfter.data.identity_accounted_at),
      finalizedAt: Boolean(workflowAfter.data.finalized_at),
      notificationStatus: workflowAfter.data.notification_status,
      currentMonthSendCount: entitlementAfter.data.current_month_send_count,
      sendCompletedAuditCount: (accountingAudit.data || []).length,
      dropAccountingEventCount: (dropAccountingEvent.data || []).length,
    };
    evidence.accountingCount = entitlementAfter.data.current_month_send_count;
    console.log('ACCOUNTING_DIAGNOSTICS', JSON.stringify(evidence.accountingDiagnostics));
    check('central-accounting-idempotent-marker', Boolean(workflowAfter.data.identity_accounted_at));
    check('workflow-finalized-marker', Boolean(workflowAfter.data.finalized_at));
    check('monthly-accounting-incremented-once', entitlementAfter.data.current_month_send_count === 1);

    const finalizeAgain = await api(`/api/drop/public/packages/${encodeURIComponent(fixture.packageId)}/finalize`, { method: 'POST', cookie: dropCookie });
    assert.ok([200, 409].includes(finalizeAgain.status), `second finalize unexpected: ${finalizeAgain.status} ${finalizeAgain.raw}`);
    const entitlementAfterRetry = await client.from('dimpro_send_entitlements').select('current_month_send_count').eq('id', fixture.entitlementId).single();
    if (entitlementAfterRetry.error) throw entitlementAfterRetry.error;
    check('accounting-not-double-counted', entitlementAfterRetry.data.current_month_send_count === 1);

    const audits = await client.from('dimpro_access_audit_logs').select('event_type,success').eq('entitlement_id', fixture.entitlementId).order('created_at', { ascending: true });
    if (audits.error) throw audits.error;
    evidence.auditEvents = (audits.data || []).map((row) => `${row.event_type}:${row.success ? 'ok' : 'fail'}`);
    for (const eventType of ['send_entitlement_created', 'send_code_verified', 'project_code_verified', 'send_completed']) {
      check(`audit-${eventType}`, audits.data?.some((row) => row.event_type === eventType && row.success === true));
    }
    check('audit-project-failure', audits.data?.some((row) => row.event_type === 'project_code_failed' && row.success === false));

    const downloadToken = await api(`/api/drop/admin/packages/${encodeURIComponent(fixture.packageId)}/tokens/download/reissue`, {
      method: 'POST', host: 'license.dimpro.hu', adminKey, body: {},
    });
    assert.equal(downloadToken.status, 201, `download token reissue: ${downloadToken.status} ${downloadToken.raw}`);
    const rawDownloadToken = String(downloadToken.json?.issued?.rawToken || '');
    check('fresh-download-token-issued', rawDownloadToken.length > 30);

    let browser;
    try {
      browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--host-resolver-rules=MAP drop.dimpro.hu 127.0.0.1'] });
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(String(error)));
      const response = await page.goto(`http://drop.dimpro.hu:${PORT}/d/${encodeURIComponent(rawDownloadToken)}`, { waitUntil: 'networkidle2', timeout: 120000 });
      check('download-album-http', response?.status() === 200, String(response?.status()));
      await page.waitForFunction((name) => (document.body.textContent || '').includes('Képalbum és fájlok') && (document.body.textContent || '').includes(name), { timeout: 60000 }, structuredFileName);
      await page.waitForFunction((name) => { const img=[...document.querySelectorAll('img')].find((item)=>item.alt===name); return Boolean(img && img.complete && img.naturalWidth>0); }, { timeout: 60000 }, structuredFileName);
      const album = await page.evaluate((name) => {
        const body = document.body.textContent || '';
        const img = [...document.querySelectorAll('img')].find((item) => item.alt === name);
        const link = img?.closest('a');
        const downloadButton = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Letöltés');
        const grid = [...document.querySelectorAll('div')].find((el) => String(el.className).includes('grid-cols-2') && String(el.className).includes('md:grid-cols-3') && String(el.className).includes('xl:grid-cols-4'));
        return {
          albumCopy: body.includes('Képalbum és fájlok'),
          filename: body.includes(name),
          image: Boolean(img && img.src),
          imageLoaded: Boolean(img && img.complete && img.naturalWidth > 0),
          senderSummary: body.includes('fájlokat küldött Önnek'),
          subjectSummary: body.includes('Tárgy:'),
          recipientSummary: body.includes('Címzettek:') && body.includes('admin@dimpro.hu'),
          messageSummary: body.includes('Üzenet:') && body.includes('Automatikus Identity Core fogyasztói E2E.'),
          newTab: link?.getAttribute('target') === '_blank',
          downloadButton: Boolean(downloadButton),
          responsiveGrid: Boolean(grid),
          overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        };
      }, structuredFileName);
      check('album-thumbnail-visible', album.image && album.imageLoaded && album.filename, JSON.stringify(album));
      check('download-summary-visible', album.senderSummary && album.subjectSummary && album.recipientSummary && album.messageSummary, JSON.stringify(album));
      check('album-image-opens-new-tab', album.newTab, JSON.stringify(album));
      check('album-download-button-visible', album.downloadButton, JSON.stringify(album));
      check('album-responsive-grid', album.responsiveGrid && !album.overflow, JSON.stringify(album));
      check('download-page-no-page-errors', pageErrors.length === 0, pageErrors.join(' | '));
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await sleep(350);
      const mobileAlbum = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth + 2, width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      check('album-mobile-no-overflow', !mobileAlbum.overflow, `${mobileAlbum.scrollWidth}/${mobileAlbum.width}`);
    } finally {
      if (browser) await browser.close().catch(() => undefined);
    }

    const zipResponse = await api('/api/drop/downloads/package/zip', {
      method: 'POST', host: 'drop.dimpro.hu', body: { token: rawDownloadToken, brandPrefix: true, requestId: `v120_${unique}` },
    });
    check('zip-brand-prefix-http', zipResponse.status === 200, `${zipResponse.status}`);
    const disposition = String(zipResponse.headers?.['content-disposition'] || '');
    const zipContentType = String(zipResponse.headers?.['content-type'] || '');
    console.log('ZIP_DIAGNOSTICS', JSON.stringify({status:zipResponse.status,contentType:zipContentType,disposition}));
    check('zip-content-type', zipContentType.includes('application/zip'), zipContentType);
    check('zip-brand-prefix-applied', disposition.includes('DIMPRO_'), disposition);

    evidence.ok = true;
  } finally {
    // Előbb az objektumtárat takarítjuk, aztán a DB-fixture-t. Nyers Send-kód vagy session token nem kerül fájlba.
    if (fixture.packageId) {
      evidence.cleanup.s3Objects = await cleanupS3(client, fixture.packageId).catch(() => 0);
      await client.from('drop_packages').delete().eq('id', fixture.packageId).then(() => undefined).catch(() => undefined);
    }
    if (fixture.rateHash) await client.from('dimpro_access_rate_limits').delete().eq('scope', 'project_code').eq('subject_hash', fixture.rateHash).then(() => undefined).catch(() => undefined);
    if (fixture.entitlementId || fixture.userId) {
      let query = client.from('dimpro_access_audit_logs').delete();
      if (fixture.entitlementId) query = query.eq('entitlement_id', fixture.entitlementId);
      else query = query.eq('user_id', fixture.userId);
      await query.then(() => undefined).catch(() => undefined);
    }
    if (fixture.entitlementId) await client.from('dimpro_send_entitlements').delete().eq('id', fixture.entitlementId).then(() => undefined).catch(() => undefined);
    if (fixture.projectId) await client.from('dimpro_projects').delete().eq('id', fixture.projectId).then(() => undefined).catch(() => undefined);
    if (fixture.licenseId) await client.from('dimpro_licenses').delete().eq('id', fixture.licenseId).then(() => undefined).catch(() => undefined);
    if (fixture.userId) await client.from('dimpro_users').delete().eq('id', fixture.userId).then(() => undefined).catch(() => undefined);
    const out = '.work_drop_v124_full_e2e_result.json';
    await writeFile(out, JSON.stringify(evidence, null, 2), { mode: 0o600 });
    await chmod(out, 0o600);
  }

  console.log(JSON.stringify({ ok: evidence.ok, checks: evidence.checks.length, auditEvents: evidence.auditEvents, rateLimit: evidence.rateLimit, accountingCount: evidence.accountingCount, cleanupS3Objects: evidence.cleanup.s3Objects }, null, 2));
}

main().catch((error) => {
  console.error(`DROP_V124_FULL_E2E_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
