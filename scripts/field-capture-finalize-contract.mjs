import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const shell = read("components/field-capture/FieldCaptureShell.tsx");
const sessionService = read("app/lib/field-capture/captureSessionService.ts");
const finalizeService = read("app/lib/field-capture/captureFinalizeService.ts");
const route = read("app/api/field-capture/sessions/[sessionId]/finalize/route.ts");
const repo = read("app/lib/field-capture/serverRepository.ts");
const types = read("app/lib/field-capture/types.ts");

const tests = [
  ["step 3 is Mentés és megosztás with explicit finalize action", () => {
    assert.match(shell, /label: "Mentés és megosztás"/);
    assert.match(shell, /data-terep-finalize-button/);
    assert.match(shell, /Mentés és befejezés/);
    assert.doesNotMatch(shell, /P7 szerveres DIMPRO szinkron külön fejlesztési kapu/);
  }],
  ["save screen reports truthful local, server, Drive and retry states", () => {
    assert.match(shell, /Helyben mentve/);
    assert.match(shell, /DIMPRO szerveren/);
    assert.match(shell, /Saját DIMPRO Drive/);
    assert.match(shell, /Várakozó/);
    assert.match(shell, /Sikertelen/);
    assert.match(shell, /GPS-pont/);
    assert.match(shell, /kamerairány/);
  }],
  ["closed local session survives reload and records server binding", () => {
    assert.match(types, /closedAt: string \| null/);
    assert.match(types, /serverSessionId: string \| null/);
    assert.match(sessionService, /value\.status === "CLOSED"/);
    assert.match(sessionService, /closeFieldCaptureLocalSession/);
    assert.match(sessionService, /serverSessionId/);
  }],
  ["finalize does not clear IndexedDB until explicit new session", () => {
    const finalizeStart = shell.indexOf("async function finalizeCurrentSession");
    const newSessionStart = shell.indexOf("const newSession = async");
    assert.ok(finalizeStart >= 0 && newSessionStart > finalizeStart);
    const finalizeBlock = shell.slice(finalizeStart, newSessionStart);
    assert.doesNotMatch(finalizeBlock, /clearFieldCaptureSession/);
    assert.match(shell.slice(newSessionStart), /clearFieldCaptureSession\(session\.id\)/);
    assert.match(shell, /data-terep-new-session-after-close/);
  }],
  ["finalize is explicit and never automatic", () => {
    assert.match(shell, /onClick=\{\(\) => void finalizeCurrentSession\(\)\}/);
    assert.doesNotMatch(shell, /useEffect\([\s\S]{0,300}finalizeCurrentSession/);
  }],
  ["client finalize recovers server session idempotently then calls finalize endpoint", () => {
    assert.match(finalizeService, /\/api\/field-capture\/sessions/);
    assert.match(finalizeService, /clientSessionId: input\.session\.id/);
    assert.match(finalizeService, /\/finalize`/);
    assert.match(finalizeService, /expectedItemCount/);
    assert.match(finalizeService, /serverSession\?\.status !== "CLOSED"/);
  }],
  ["server session upsert no longer reopens a closed session", () => {
    const start = repo.indexOf("export async function upsertFieldCaptureServerSession");
    const end = repo.indexOf("export async function assertFieldCaptureSessionOwner", start);
    const upsert = repo.slice(start, end);
    assert.doesNotMatch(upsert, /status: "ACTIVE"/);
    assert.match(upsert, /onConflict: "user_id,client_session_id"/);
  }],
  ["finalize route is bearer authorized and owner scoped", () => {
    assert.match(route, /authorizeFieldCaptureRequest/);
    assert.match(route, /finalizeFieldCaptureServerSession/);
    assert.match(route, /authorized\.context\.user\.id/);
    assert.match(route, /authorized\.context\.entitlement\.id/);
    assert.match(route, /expectedItemCount/);
  }],
  ["server finalization is count checked, storage gated and idempotent", () => {
    assert.match(repo, /FIELD_CAPTURE_FINALIZE_ITEM_COUNT_MISMATCH/);
    assert.match(repo, /FIELD_CAPTURE_FINALIZE_ITEMS_NOT_STORED/);
    assert.match(repo, /FIELD_CAPTURE_FINALIZE_DESTINATIONS_PENDING/);
    assert.match(repo, /target\) === "CAPTURE"/);
    assert.match(repo, /\["USER_DRIVE", "PROJECT_DRIVE"\]/);
    assert.match(repo, /session\.status === "CLOSED"/);
    assert.match(repo, /event_type", "SESSION_CLOSED"/);
    assert.match(repo, /closed_at: now/);
  }],
  ["project Drive P9 blocks local finalize readiness", () => {
    assert.match(finalizeService, /saveToProjectDrive/);
    assert.match(finalizeService, /Projektkapu Drive P9 cél még nincs aktiválva/);
    assert.match(finalizeService, /projectDriveBlockedCount/);
  }],
  ["offline finalize never discards local data", () => {
    assert.match(shell, /A lezáráshoz szerveres visszaigazolás szükséges/);
    assert.match(shell, /helyi képek offline is biztonságban maradnak/);
    assert.match(shell, /A helyi adatok változatlanul megmaradtak/);
  }],
];

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${passed}: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}
console.log(`FIELD_CAPTURE_FINALIZE_CONTRACT ${passed}/${tests.length} PASS`);
