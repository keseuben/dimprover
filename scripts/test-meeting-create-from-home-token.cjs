const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('./load-next-env.cjs');

const base = process.env.DIMPRO_TEST_BASE_URL || 'http://127.0.0.1:3000';
const host = process.env.DIMPRO_TEST_HOST || 'app.dimpro.hu';
const secret = String(process.env.MEETING_ASSISTANT_SIGNING_SECRET || '');
const meetingId = `home-create-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const workspaceFile = path.join(process.cwd(), '.dimprover', 'data', 'meeting-assistant', 'workspaces', `${meetingId}.json`);

function tokenFor(tokenMeetingId, issuedTo) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { v: 1, meetingId: tokenMeetingId, issuedTo, iat: now, exp: now + 3600, grantId: '', subjectName: 'Teszt Szervező', subjectEmail: '' };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

async function post(accessToken, operation, payload) {
  const response = await fetch(`${base}/api/meeting-assistant/workspace`, {
    method: 'POST',
    headers: { host, 'content-type': 'application/json' },
    body: JSON.stringify({ meetingId, accessToken, role: 'organizer', operation, payload }),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  console.log(`OK ${label}`);
}

(async () => {
  try {
    if (secret.length < 32) throw new Error('MEETING_ASSISTANT_SIGNING_SECRET missing');
    const homeToken = tokenFor('meeting-assistant-home', 'dimpro-web-preview');
    let result = await post(homeToken, 'update_meta', {
      title: 'Kezdőoldalról létrehozott értekezlet',
      projectId: 'home-create-project',
      projectCode: 'HCP',
      projectName: 'Kezdőoldali projekt',
      meetingLocation: 'Várdomb, Sárpilis',
      meetingType: 'Általános egyeztetés',
      meetingTypeCode: 'ÁLT',
      documentKind: 'reminder',
      chairpersonName: 'Keserű Benjámin',
      minuteTakerName: 'Szervező',
      organizerName: 'Keserű Benjámin',
      scheduledStart: '',
      reserveNumber: true,
    });
    ok(result.response.status === 200 && result.body.ok === true, 'home token bootstraps a new meeting');
    ok(typeof result.body.accessToken === 'string' && result.body.accessToken.includes('.'), 'new meeting-specific organizer token returned');
    ok(result.body.workspace?.projectId === 'home-create-project', 'project relation saved');

    result = await post(result.body.accessToken, 'apply_agenda_template', { templateKey: 'quick_general' });
    ok(result.response.status === 200 && result.body.workspace?.agendaTemplateKey === 'quick_general', 'returned token loads agenda template');
    ok(Array.isArray(result.body.workspace?.agenda) && result.body.workspace.agenda.length > 0, 'agenda items created');

    const pageResponse = await fetch(`${base}/ertekezleti-kisero?meetingId=${encodeURIComponent(meetingId)}`, { headers: { host }, redirect: 'manual' });
    ok([200, 307].includes(pageResponse.status), 'created meeting workspace route opens');
    console.log('Meeting creation from home token test completed successfully.');
  } finally {
    if (fs.existsSync(workspaceFile)) fs.rmSync(workspaceFile, { force: true });
  }
})().catch((error) => {
  if (fs.existsSync(workspaceFile)) fs.rmSync(workspaceFile, { force: true });
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
