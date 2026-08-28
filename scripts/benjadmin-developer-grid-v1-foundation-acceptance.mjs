import assert from "node:assert/strict";
import { resolveAuthoritativeDeveloperContext, verifyDeveloperGridSourceProvenance } from "../app/lib/dev-center/developer-grid/context.ts";
import { appendDeveloperGridEvent, getDeveloperGridDelta, resetDeveloperGridEventStoreForTests } from "../app/lib/dev-center/developer-grid/event-store.ts";
import { resolveDeveloperGridBuildNodes, selectDeveloperGridBuildExecutor } from "../app/lib/dev-center/developer-grid/build-nodes.ts";

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS ${passed}: ${name}`); };

const task = {
  id: "dev-task-benjadmin-developer-grid-v1-night-20260827",
  projectId: "project_dimprover",
  title: "BENJADMIN Developer Grid V1 – éjszakai foundation",
  metadata: {
    developmentContext: {
      projectId: "project_dimprover",
      mainModule: "BENJADMIN",
      moduleName: "Developer Grid V1",
      submoduleName: "Central Core",
      workItem: "Authoritative task context",
      workStageIndex: 2,
      updatedAt: "2026-08-28T00:00:00.000Z",
    },
  },
};

const stalePresence = {
  taskId: "dev-task-commerce-p6-media-overlay-renderer-20260822",
  projectId: "project_dimprover",
  mainModule: "DIMPRO",
  moduleName: "Árutér / Commerce Core",
  submoduleName: "P6",
  workItem: "Régi presence",
  heartbeatAt: "2026-08-22T15:12:00.000Z",
};

test("explicit task context overrides stale presence", () => {
  const ctx = resolveAuthoritativeDeveloperContext({ task, presence: stalePresence });
  assert.equal(ctx.moduleName, "Developer Grid V1");
  assert.equal(ctx.source, "TASK_EXPLICIT");
});

test("activity for same task is used when explicit context missing", () => {
  const ctx = resolveAuthoritativeDeveloperContext({
    task: { id: "t1" },
    activity: [{ taskId: "t1", mainModule: "BENJADMIN", moduleName: "Developer Grid V1", submoduleName: "Events", workItem: "Delta", createdAt: "2026-08-28T00:01:00Z" }],
    presence: stalePresence,
  });
  assert.equal(ctx.source, "ACTIVITY");
  assert.equal(ctx.submoduleName, "Events");
});

test("activity from another task cannot override current task", () => {
  const ctx = resolveAuthoritativeDeveloperContext({
    task: { id: "t2", projectId: "project_dimprover", title: "BENJADMIN Developer Grid V1" },
    activity: [{ taskId: "old", mainModule: "DIMPRO", moduleName: "Wrong", submoduleName: "Wrong", workItem: "Wrong", createdAt: "2026-08-28T00:02:00Z" }],
  });
  assert.equal(ctx.source, "TASK_INFERENCE");
  assert.equal(ctx.moduleName, "Developer Grid V1");
});

test("presence is fallback only when task and activity have no context", () => {
  const ctx = resolveAuthoritativeDeveloperContext({ task: { id: "blank" }, presence: stalePresence });
  assert.equal(ctx.source, "PRESENCE_FALLBACK");
  assert.equal(ctx.moduleName, "Árutér / Commerce Core");
});

test("verified source provenance requires exact branch/worktree/head/canonical and clean tree", () => {
  const p = verifyDeveloperGridSourceProvenance({ expectedBranch: "feature/grid", actualBranch: "feature/grid", expectedWorktree: "/srv/grid", actualWorktree: "/srv/grid/", expectedHead: "abc", actualHead: "abc", canonicalHead: "abc", clean: true });
  assert.equal(p.state, "VERIFIED");
  assert.equal(p.blocker, null);
});

test("head drift fails closed", () => {
  const p = verifyDeveloperGridSourceProvenance({ expectedBranch: "feature/grid", actualBranch: "feature/grid", expectedWorktree: "/srv/grid", actualWorktree: "/srv/grid", expectedHead: "abc", actualHead: "def", canonicalHead: "abc", clean: true });
  assert.equal(p.state, "BLOCKED");
  assert.equal(p.blocker, "SOURCE_BASELINE_MISMATCH");
  assert.ok(p.reasons.includes("HEAD_MISMATCH"));
});

test("dirty tree fails source provenance", () => {
  const p = verifyDeveloperGridSourceProvenance({ expectedBranch: "feature/grid", actualBranch: "feature/grid", expectedWorktree: "/srv/grid", actualWorktree: "/srv/grid", expectedHead: "abc", actualHead: "abc", canonicalHead: "abc", clean: false });
  assert.ok(p.reasons.includes("DIRTY_WORKTREE"));
});

test("delta gateway returns only events after cursor", () => {
  resetDeveloperGridEventStoreForTests();
  appendDeveloperGridEvent({ taskId: "t", workerCode: "OUTMINAI", kind: "analysis", summary: "one" });
  appendDeveloperGridEvent({ taskId: "t", workerCode: "OUTMINAI", kind: "coding", summary: "two" });
  const delta = getDeveloperGridDelta({ afterSequence: 1 });
  assert.equal(delta.items.length, 1);
  assert.equal(delta.items[0].summary, "two");
});

test("delta gateway filters by task id", () => {
  resetDeveloperGridEventStoreForTests();
  appendDeveloperGridEvent({ taskId: "a", workerCode: "ARMINAI", kind: "analysis", summary: "a" });
  appendDeveloperGridEvent({ taskId: "b", workerCode: "JAZMINAI", kind: "analysis", summary: "b" });
  const delta = getDeveloperGridDelta({ taskId: "b" });
  assert.deepEqual(delta.items.map((x) => x.taskId), ["b"]);
});

test("delta gateway exposes bounded cursor pagination", () => {
  resetDeveloperGridEventStoreForTests();
  for (let i = 0; i < 4; i += 1) appendDeveloperGridEvent({ taskId: "t", workerCode: "OUTMINAI", kind: "coding", summary: `e${i}` });
  const first = getDeveloperGridDelta({ limit: 2 });
  assert.equal(first.items.length, 2);
  assert.equal(first.hasMore, true);
  const second = getDeveloperGridDelta({ afterSequence: first.cursor, limit: 2 });
  assert.equal(second.items.length, 2);
  assert.equal(second.hasMore, false);
});

test("dedicated READY build node is preferred", () => {
  const nodes = resolveDeveloperGridBuildNodes({ build01: { state: "READY", verifiedAt: "2026-08-28T00:00:00Z" } });
  assert.equal(selectDeveloperGridBuildExecutor(nodes)?.id, "build01");
});

test("canonical DEV remains executor while dedicated nodes are not connected", () => {
  const nodes = resolveDeveloperGridBuildNodes();
  assert.equal(nodes.find((n) => n.id === "build01")?.state, "NOT_CONNECTED");
  assert.equal(nodes.find((n) => n.id === "build02")?.state, "NOT_CONNECTED");
  assert.equal(selectDeveloperGridBuildExecutor(nodes)?.id, "canonical-dev");
});

console.log(`FOUNDATION_ACCEPTANCE_PASS ${passed}/12`);
