const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('./load-next-env.cjs');

const base = process.env.DIMPRO_TEST_BASE_URL || 'http://127.0.0.1:3000';
const host = process.env.DIMPRO_TEST_HOST || 'app.dimpro.hu';
const secret = String(process.env.MEETING_ASSISTANT_SIGNING_SECRET || '');
const meetingId = `create-smtp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const dataRoot = path.join(process.cwd(), '.dimprover', 'data', 'meeting-assistant');
const workspaceFile = path.join(dataRoot, 'workspaces', `${meetingId}.json`);
const pairingFile = path.join(dataRoot, 'presentation-pairings', `${meetingId}.json`);
let checks = 0;

function tokenFor(tokenMeetingId, issuedTo) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { v: 1, meetingId: tokenMeetingId, issuedTo, iat: now, exp: now + 3600, grantId: '', subjectName: 'Teszt Szervező', subjectEmail: '' };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { host, ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks += 1;
  console.log(`OK ${String(checks).padStart(2, '0')} ${label}`);
}

function cleanup() {
  for (const file of [workspaceFile, pairingFile]) if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  for (const dir of [path.join(dataRoot, 'snapshots', meetingId), path.join(dataRoot, 'uploads', meetingId)]) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
}

(async () => {
  try {
    if (secret.length < 32) throw new Error('MEETING_ASSISTANT_SIGNING_SECRET missing');
    const profiles = await import('../app/lib/license/mail-profiles.ts');
    const safeConfig = await profiles.getMailProfilesSafeConfig();
    const recipient = safeConfig.testRecipients[0];
    if (!recipient) throw new Error('Nincs DIMPRO SMTP tesztcímzett beállítva.');

    const homeToken = tokenFor('meeting-assistant-home', 'dimpro-web-preview');
    let result = await jsonRequest(`${base}/api/meeting-assistant/workspace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        meetingId,
        accessToken: homeToken,
        role: 'organizer',
        operation: 'update_meta',
        payload: {
          title: 'Új értekezlet és SMTP integráció teszt',
          projectId: 'smtp-fix-project',
          projectCode: 'SMTP',
          projectName: 'SMTP javítási projekt',
          meetingLocation: 'Microsoft Teams',
          meetingType: 'Általános egyeztetés',
          meetingTypeCode: 'ÁLT',
          documentKind: 'reminder',
          chairpersonName: 'Teszt Szervező',
          minuteTakerName: 'Szervező',
          organizerName: 'Teszt Szervező',
          scheduledStart: '',
          reserveNumber: true,
        },
      }),
    });
    ok(result.response.status === 200 && result.body.ok === true, 'kezdőoldali token létrehozza az új értekezletet');
    const meetingToken = result.body.accessToken;
    ok(typeof meetingToken === 'string' && meetingToken.includes('.'), 'új meetinghez kötött szervezői token visszaérkezik');

    result = await jsonRequest(`${base}/api/meeting-assistant/workspace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meetingId, accessToken: meetingToken, role: 'organizer', operation: 'apply_agenda_template', payload: { templateKey: 'quick_general' } }),
    });
    ok(result.response.status === 200 && result.body.workspace?.agenda?.length > 0, 'napirendi sablon betöltődik az új meetingbe');

    result = await jsonRequest(`${base}/api/meeting-assistant/email?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(meetingToken)}`);
    ok(result.response.status === 200 && result.body.status?.configured === true, 'Értekezleti Kísérő központi SMTP státusza aktív');
    ok(result.body.status?.from === 'ertesites@dimpro.hu', 'értekezleti e-mail feladó a DIMPRO Értesítések profil');

    result = await jsonRequest(`${base}/api/meeting-assistant/presentation-control`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meetingId, accessToken: meetingToken, operation: 'create', actorName: 'Teszt Szervező', recipientName: 'SMTP Tesztcímzett', recipientEmail: recipient }),
    });
    ok(result.response.status === 200 && /^\d{6}$/.test(result.body.pairing?.code || ''), 'hatjegyű vezérlőkód létrejön');
    ok(result.body.emailSent === true && !result.body.emailError, 'vezérlőkód e-mail ténylegesen elküldve a központi SMTP-profilon');

    console.log(`Meeting creation + SMTP integration completed successfully: ${checks} checks.`);
  } finally {
    cleanup();
  }
})().catch((error) => {
  cleanup();
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
