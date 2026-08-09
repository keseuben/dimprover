const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('./load-next-env.cjs');

const base = process.env.DIMPRO_TEST_BASE_URL || 'http://127.0.0.1:3000';
const host = process.env.DIMPRO_TEST_HOST || 'app.dimpro.hu';
const secret = String(process.env.MEETING_ASSISTANT_SIGNING_SECRET || '');
const stamp = Date.now();
const projectId = `delete-project-${stamp}`;
const projectName = `Törlési tesztprojekt ${stamp}`;
const meetingOne = `delete-meeting-a-${stamp}`;
const meetingTwo = `delete-meeting-b-${stamp}`;
const meetingOneTitle = `Törlési teszt értekezlet A ${stamp}`;
const meetingTwoTitle = `Törlési teszt értekezlet B ${stamp}`;
const root = path.join(process.cwd(), '.dimprover', 'data', 'meeting-assistant');
let checks = 0;

function tokenFor(meetingId, issuedTo = 'dimpro-web-preview') {
  const now = Math.floor(Date.now() / 1000);
  const payload = { v: 1, meetingId, issuedTo, iat: now, exp: now + 3600, grantId: '', subjectName: 'Törlési Tesztelő', subjectEmail: '' };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { host, ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks += 1;
  console.log(`OK ${String(checks).padStart(2, '0')} ${label}`);
}

async function createMeeting(meetingId, title) {
  const result = await request(`${base}/api/meeting-assistant/workspace`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ meetingId, accessToken: tokenFor(meetingId), role: 'organizer', operation: 'update_meta', payload: { title, projectId, projectCode: 'DEL', projectName, meetingType: 'Általános egyeztetés', meetingTypeCode: 'ÁLT', documentKind: 'reminder', organizerName: 'Törlési Tesztelő', reserveNumber: false } }),
  });
  if (!result.response.ok) throw new Error(result.body.error || 'meeting create failed');
}

function cleanup() {
  for (const meetingId of [meetingOne, meetingTwo]) {
    fs.rmSync(path.join(root, 'workspaces', `${meetingId}.json`), { force: true });
    fs.rmSync(path.join(root, 'uploads', meetingId), { recursive: true, force: true });
    fs.rmSync(path.join(root, 'snapshots', meetingId), { recursive: true, force: true });
    fs.rmSync(path.join(root, 'editor-pairings', `${meetingId}.json`), { force: true });
    fs.rmSync(path.join(root, 'presentation-pairings', `${meetingId}.json`), { force: true });
  }
  fs.rmSync(path.join(root, 'project-profiles', `${projectId}.json`), { force: true });
  const deletedFile = path.join(root, 'deleted-projects.json');
  if (fs.existsSync(deletedFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(deletedFile, 'utf8'));
      data.projectIds = (data.projectIds || []).filter((id) => id !== projectId);
      fs.writeFileSync(deletedFile, `${JSON.stringify(data, null, 2)}\n`);
    } catch {}
  }
}

(async () => {
  try {
    if (secret.length < 32) throw new Error('MEETING_ASSISTANT_SIGNING_SECRET missing');
    const homeToken = tokenFor('meeting-assistant-home');
    let result = await request(`${base}/api/meeting-assistant/project-profiles`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meetingId: 'meeting-assistant-home', accessToken: homeToken, action: 'upsert_project', project: { projectId, code: 'DEL', name: projectName, location: 'Teszt helyszín', status: 'active' } }),
    });
    ok(result.response.status === 200 && result.body.profile?.projectId === projectId, 'tesztprojekt létrejön');

    await createMeeting(meetingOne, meetingOneTitle);
    await createMeeting(meetingTwo, meetingTwoTitle);
    fs.mkdirSync(path.join(root, 'uploads', meetingOne), { recursive: true });
    fs.writeFileSync(path.join(root, 'uploads', meetingOne, 'test.txt'), 'delete');
    fs.mkdirSync(path.join(root, 'snapshots', meetingOne), { recursive: true });
    fs.writeFileSync(path.join(root, 'snapshots', meetingOne, 'v001.json'), '{}');
    fs.mkdirSync(path.join(root, 'presentation-pairings'), { recursive: true });
    fs.writeFileSync(path.join(root, 'presentation-pairings', `${meetingOne}.json`), JSON.stringify({ meetingId: meetingOne }));
    ok(fs.existsSync(path.join(root, 'workspaces', `${meetingOne}.json`)) && fs.existsSync(path.join(root, 'workspaces', `${meetingTwo}.json`)), 'két projekthez tartozó értekezlet létrejön');

    result = await request(`${base}/api/meeting-assistant/archive`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentMeetingId: 'meeting-assistant-home', selectedMeetingId: meetingOne, accessToken: homeToken, confirmationTitle: 'hibás cím', actorName: 'Törlési Tesztelő' }),
    });
    ok(result.response.status === 400, 'hibás értekezletcím nem engedi a törlést');

    result = await request(`${base}/api/meeting-assistant/archive`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentMeetingId: 'meeting-assistant-home', selectedMeetingId: meetingOne, accessToken: homeToken, confirmationTitle: meetingOneTitle, actorName: 'Törlési Tesztelő' }),
    });
    ok(result.response.status === 200 && result.body.ok, 'értekezlet pontos címbeírással törölhető');
    ok(!fs.existsSync(path.join(root, 'workspaces', `${meetingOne}.json`)), 'értekezleti munkatérfájl törlődik');
    ok(!fs.existsSync(path.join(root, 'uploads', meetingOne)) && !fs.existsSync(path.join(root, 'snapshots', meetingOne)), 'feltöltések és snapshotok törlődnek');
    ok(!fs.existsSync(path.join(root, 'presentation-pairings', `${meetingOne}.json`)), 'ideiglenes vezérlőkód rekord törlődik');

    result = await request(`${base}/api/meeting-assistant/project-profiles`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meetingId: 'meeting-assistant-home', accessToken: homeToken, action: 'delete_project', projectId, projectName, confirmationName: 'hibás név', actorName: 'Törlési Tesztelő' }),
    });
    ok(result.response.status === 400, 'hibás projektnév nem engedi a projekt törlését');

    result = await request(`${base}/api/meeting-assistant/project-profiles`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meetingId: 'meeting-assistant-home', accessToken: homeToken, action: 'delete_project', projectId, projectName, confirmationName: projectName, actorName: 'Törlési Tesztelő' }),
    });
    ok(result.response.status === 200 && result.body.deletedMeetingCount === 1, 'projekt törlése a maradék értekezletet is törli');
    ok(!fs.existsSync(path.join(root, 'project-profiles', `${projectId}.json`)) && !fs.existsSync(path.join(root, 'workspaces', `${meetingTwo}.json`)), 'projektprofil és kapcsolódó munkatér törlődik');
    const deletedProjects = JSON.parse(fs.readFileSync(path.join(root, 'deleted-projects.json'), 'utf8')).projectIds || [];
    ok(deletedProjects.includes(projectId), 'törölt Drive-projekt nem jelenik meg újra az Értekezleti Kísérőben');
    ok(fs.existsSync(path.join(root, 'deletion-audit.jsonl')), 'törlési auditnapló létrejön');

    console.log(`Meeting/project deletion integration completed successfully: ${checks} checks.`);
  } finally {
    cleanup();
  }
})().catch((error) => {
  cleanup();
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
