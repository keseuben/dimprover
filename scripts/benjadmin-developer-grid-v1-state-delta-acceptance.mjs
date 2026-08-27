import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DeveloperGridStateStore } from "../app/lib/dev-center/developer-grid/state-store.ts";

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS ${passed}: ${name}`); };

const file = `/srv/dimpro-dev/runtime/developer-grid-test/state-${process.pid}.json`;
fs.rmSync(path.dirname(file), { recursive: true, force: true });
const store = new DeveloperGridStateStore(file);

const context = {
  projectId: "project_dimprover",
  mainModule: "BENJADMIN",
  moduleName: "Developer Grid V1",
  submoduleName: "Central Core",
  workItem: "Task/session delta state",
  workStageIndex: 2,
  source: "TASK_EXPLICIT",
  updatedAt: "2026-08-28T00:30:00.000Z",
};

const task = {
  id: "dev-task-benjadmin-developer-grid-v1-night-20260827",
  projectId: "project_dimprover",
  title: "BENJADMIN Developer Grid V1 – éjszakai foundation",
  status: "IN_PROGRESS",
  developmentContext: context,
  sourceProvenance: null,
  updatedAt: "2026-08-28T00:30:00.000Z",
};

const session = {
  id: "outmin-session-night",
  taskId: task.id,
  workerCode: "OUTMINAI",
  status: "ACTIVE",
  branch: "feature/benjadmin-developer-grid-v1-20260827",
  worktree: "/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v1-20260827",
  head: "1aded720fc97e013e22aa542ffbf6eae1cb112c2",
  openedAt: "2026-08-28T00:00:00.000Z",
  heartbeatAt: "2026-08-28T00:30:00.000Z",
  updatedAt: "2026-08-28T00:30:00.000Z",
};

test("empty persistent state starts at revision zero", () => {
  assert.equal(store.snapshot().revision, 0);
});

test("task upsert persists authoritative development context", () => {
  store.upsertTask(task);
  const saved = store.snapshot().tasks[0];
  assert.equal(saved.developmentContext.source, "TASK_EXPLICIT");
  assert.equal(saved.developmentContext.moduleName, "Developer Grid V1");
});

test("task upsert creates task delta revision", () => {
  const delta = store.delta(0);
  assert.equal(delta.changes[0].kind, "task-upsert");
  assert.equal(delta.cursor, 1);
});

test("session upsert persists source-bound worker state", () => {
  store.upsertSession(session);
  const saved = store.snapshot().sessions[0];
  assert.equal(saved.workerCode, "OUTMINAI");
  assert.equal(saved.head, session.head);
});

test("delta after cursor contains only newer changes", () => {
  const delta = store.delta(1);
  assert.equal(delta.changes.length, 1);
  assert.equal(delta.changes[0].kind, "session-upsert");
});

test("task-filtered delta excludes unrelated task changes", () => {
  store.upsertTask({ ...task, id: "other-task", title: "Other", updatedAt: "2026-08-28T00:31:00.000Z" });
  const delta = store.delta(0, task.id);
  assert.ok(delta.changes.every((item) => item.taskId === task.id));
});

test("delta returns only entities touched by selected changes", () => {
  const delta = store.delta(1, task.id);
  assert.equal(delta.tasks.length, 1);
  assert.equal(delta.tasks[0].id, task.id);
  assert.equal(delta.sessions.length, 1);
});

test("session close is persisted as explicit delta", () => {
  const closed = store.closeSession(session.id, "2026-08-28T00:32:00.000Z");
  assert.equal(closed?.status, "CLOSED");
  const delta = store.delta(3, task.id);
  assert.equal(delta.changes.at(-1)?.kind, "session-close");
});

test("closing unknown session is a no-op", () => {
  const before = store.snapshot().revision;
  assert.equal(store.closeSession("missing"), null);
  assert.equal(store.snapshot().revision, before);
});

test("delta limit is bounded and exposes hasMore", () => {
  for (let i = 0; i < 4; i += 1) store.upsertTask({ ...task, title: `Update ${i}`, updatedAt: `2026-08-28T00:4${i}:00.000Z` });
  const delta = store.delta(0, task.id, 2);
  assert.equal(delta.changes.length, 2);
  assert.equal(delta.hasMore, true);
});

test("state survives a new store instance", () => {
  const reopened = new DeveloperGridStateStore(file);
  assert.equal(reopened.snapshot().tasks.some((item) => item.id === task.id), true);
  assert.equal(reopened.snapshot().sessions.some((item) => item.id === session.id), true);
});

test("corrupt state fails closed to empty readable state", () => {
  const corrupt = `${file}.corrupt`;
  fs.writeFileSync(corrupt, "{bad-json", { mode: 0o600 });
  const broken = new DeveloperGridStateStore(corrupt);
  assert.equal(broken.snapshot().revision, 0);
  fs.rmSync(corrupt, { force: true });
});

fs.rmSync(path.dirname(file), { recursive: true, force: true });
console.log(`STATE_DELTA_ACCEPTANCE_PASS ${passed}/12`);
