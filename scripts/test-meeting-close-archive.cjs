const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('./load-next-env.cjs');

const secret = process.env.MEETING_ASSISTANT_SIGNING_SECRET;
if (!secret) throw new Error('MEETING_ASSISTANT_SIGNING_SECRET missing');
const meetingId = `archive-close-smoke-${Date.now()}`;
const now = Math.floor(Date.now() / 1000);
const payload = { v: 1, meetingId, issuedTo: 'dimpro-fajlmuhely-desktop', iat: now, exp: now + 3600 };
const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
const token = `${encoded}.${signature}`;
fs.writeFileSync('/tmp/archive-smoke-token.txt', token);

const base = 'http://127.0.0.1:3000';

async function getWorkspace() {
  const response = await fetch(`${base}/api/meeting-assistant/workspace?meetingId=${meetingId}&accessToken=${encodeURIComponent(token)}`, {
    headers: { host: 'app.dimpro.hu' },
  });
  const body = await response.json();
  if (!response.ok || !body.workspace) throw new Error(`GET ${response.status} ${JSON.stringify(body)}`);
  return body.workspace;
}

async function post(operation, payload = {}) {
  const response = await fetch(`${base}/api/meeting-assistant/workspace`, {
    method: 'POST',
    headers: { host: 'app.dimpro.hu', 'content-type': 'application/json' },
    body: JSON.stringify({ meetingId, role: 'organizer', operation, payload, accessToken: token }),
  });
  return { status: response.status, body: await response.json() };
}

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  console.log(`OK ${label}`);
}

(async () => {
  let workspace = await getWorkspace();
  ok(workspace.version === 8 && workspace.status === 'active', '01 default v8 active workspace');

  let result = await post('update_meta', {
    title: 'Archívum tesztértekezlet B',
    projectName: 'DIMPRO tesztprojekt',
    organizerName: 'Teszt Szervező',
    participants: ['Résztvevő A', 'Résztvevő B'],
  });
  ok(result.status === 200 && result.body.workspace.participants.length === 2, '02 metadata and participants saved');

  result = await post('update_notes', { privateNotes: 'Belső privát jegyzet', sharedNote: 'Közös tesztjegyzet' });
  ok(result.status === 200 && result.body.workspace.sharedNote === 'Közös tesztjegyzet', '03 notes saved');

  result = await post('add_action_item', { type: 'task', title: 'Nyitott tesztfeladat', owner: '', dueDate: '', shared: true });
  ok(result.status === 200 && result.body.workspace.actionItems.length === 1, '04 task saved');

  result = await post('add_action_item', { type: 'decision', title: 'Teszt döntés', owner: 'Szervező', shared: true });
  ok(result.status === 200 && result.body.workspace.actionItems.length === 2, '05 decision saved');

  result = await post('close_meeting', { mode: 'draft', closedBy: 'Teszt Szervező', note: 'Piszkozat lezárás' });
  ok(result.status === 200 && result.body.workspace.status === 'draft_closed' && result.body.workspace.closure.snapshotVersion === 1, '06 draft close snapshot v1');

  result = await post('close_meeting', { mode: 'approval', closedBy: 'Teszt Szervező', note: 'Jóváhagyásra küldve' });
  ok(result.status === 200 && result.body.workspace.status === 'pending_approval' && result.body.workspace.closure.snapshotVersion === 2, '07 approval close snapshot v2');

  result = await post('close_meeting', { mode: 'publish', closedBy: 'Teszt Szervező', note: 'Közzétéve' });
  ok(result.status === 200 && result.body.workspace.status === 'published' && result.body.workspace.closure.snapshotVersion === 3, '08 publish snapshot v3');

  result = await post('update_notes', { privateNotes: 'tiltott', sharedNote: 'tiltott' });
  ok(result.status === 400 && String(result.body.error).includes('újranyitás'), '09 published edit blocked');

  result = await post('reopen_meeting', { note: 'Javítás miatt újranyitva' });
  ok(result.status === 200 && result.body.workspace.status === 'active', '10 reopened');

  result = await post('update_notes', { privateNotes: 'javított privát', sharedNote: 'javított közös' });
  ok(result.status === 200 && result.body.workspace.sharedNote === 'javított közös', '11 edit after reopen works');

  result = await post('close_meeting', { mode: 'publish', closedBy: 'Teszt Szervező', note: 'Végleges közzététel' });
  ok(result.status === 200 && result.body.workspace.closure.snapshotVersion === 4, '12 republish snapshot v4');

  result = await post('archive_meeting');
  ok(result.status === 200 && result.body.workspace.status === 'archived' && result.body.workspace.closure.snapshotVersion === 5, '13 archive snapshot v5');

  workspace = await getWorkspace();
  ok(workspace.status === 'archived' && workspace.title === 'Archívum tesztértekezlet B', '14 archived workspace retrieved');

  const snapshotDirectory = path.join(process.cwd(), '.dimprover', 'data', 'meeting-assistant', 'snapshots', meetingId);
  const snapshots = fs.readdirSync(snapshotDirectory).filter((name) => name.endsWith('.json'));
  ok(snapshots.length === 5, '15 five snapshot files in persistent root');

  const workspaceFile = path.join(process.cwd(), '.dimprover', 'data', 'meeting-assistant', 'workspaces', `${meetingId}.json`);
  const stored = JSON.parse(fs.readFileSync(workspaceFile, 'utf8'));
  ok(stored.version === 8 && stored.status === 'archived', '16 persisted root workspace v8 archived');

  fs.rmSync(workspaceFile, { force: true });
  fs.rmSync(snapshotDirectory, { recursive: true, force: true });
})();
