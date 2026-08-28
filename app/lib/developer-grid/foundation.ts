import { probeBuildNodes } from "./build-nodes";
import { resolveBuildExecutor } from "./build-orchestrator";
import { resolveDeveloperGridRuntimeProvenance } from "./runtime-provenance";
import { verifySourceProvenance } from "./source-provenance";
import type { DeveloperGridFoundation } from "./types";
import { DEVELOPER_GRID_SCHEMA_VERSION, DEVELOPER_GRID_VERSION } from "./types";
import { listDeveloperGridWorkers } from "./worker-registry";

export const DEVELOPER_GRID_TASK_ID = "dev-task-benjadmin-developer-grid-v1-night-20260827";
export const DEVELOPER_GRID_PROJECT_ID = "project_dimprover";

const DEFAULT_DEVELOPER_GRID_BRANCH = "feature/benjadmin-developer-grid-v1-20260827";
const DEFAULT_DEVELOPER_GRID_WORKTREE = "/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v1-20260827";
const DEFAULT_DEVELOPER_GRID_REPOSITORY = "/srv/dimpro-dev/repositories/dimprover.git";

function runtimeExpectation(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

export const DEVELOPER_GRID_BRANCH = runtimeExpectation("DIMPRO_DEVELOPER_GRID_SOURCE_BRANCH", DEFAULT_DEVELOPER_GRID_BRANCH);
export const DEVELOPER_GRID_WORKTREE = runtimeExpectation("DIMPRO_DEVELOPER_GRID_SOURCE_WORKTREE", DEFAULT_DEVELOPER_GRID_WORKTREE);
export const DEVELOPER_GRID_REPOSITORY = runtimeExpectation("DIMPRO_DEVELOPER_GRID_SOURCE_REPOSITORY", DEFAULT_DEVELOPER_GRID_REPOSITORY);

const CENTRAL_CORE_DOMAINS = [
  "Task / Workflow",
  "Agent / Worker Registry",
  "Worker Session",
  "Development Context",
  "Source Baseline / Provenance",
  "Worker Activity / Event",
  "Handoff / Development Knowledge",
  "Build / Release / Runtime Provenance",
  "Decision / Approval / Review",
  "Development Memory",
  "Usage / Telemetry",
  "Notification / Reporting",
] as const;

const FOUNDATION_ACCEPTANCE = [
  "ChatGrid v0.3.x érintetlen fallback/reference marad.",
  "4 fix agent cella + 05 DevminAI helye.",
  "Source provenance fail-closed.",
  "Presence nem authoritative development context.",
  "Realtime delta/event; history explicit/paginált.",
  "Release/runtime provenance fail-closed mismatch esetén.",
  "Build node abstraction; kerülő build tilos.",
  "Build/restart/shared release csak exclusive coordination lock alatt.",
] as const;

export async function getDeveloperGridFoundation(): Promise<DeveloperGridFoundation> {
  const now = new Date().toISOString();
  const sourceProvenance = await verifySourceProvenance({
    repository: DEVELOPER_GRID_REPOSITORY,
    worktree: DEVELOPER_GRID_WORKTREE,
    branch: DEVELOPER_GRID_BRANCH,
    worker: "OUTMINAI",
    taskId: DEVELOPER_GRID_TASK_ID,
    sessionId: `foundation-${DEVELOPER_GRID_TASK_ID}`,
  });
  const releaseRuntimeProvenance = await resolveDeveloperGridRuntimeProvenance({
    projectRoot: DEVELOPER_GRID_WORKTREE,
    expectedSourceCommit: sourceProvenance.head || null,
    expectedSourceBranch: DEVELOPER_GRID_BRANCH,
  });
  const provenanceBlocked = sourceProvenance.sourceState !== "VERIFIED"
    || releaseRuntimeProvenance.state === "BLOCKED";
  const buildNodes = await probeBuildNodes();

  return {
    schemaVersion: DEVELOPER_GRID_SCHEMA_VERSION,
    product: "BENJADMIN Developer Grid V1",
    version: DEVELOPER_GRID_VERSION,
    environment: "DEV",
    productionAccess: "DENY",
    task: {
      id: DEVELOPER_GRID_TASK_ID,
      projectId: DEVELOPER_GRID_PROJECT_ID,
      title: "BENJADMIN Developer Grid V1 – éjszakai foundation",
      priority: 98,
      environment: "DEV",
      productionAccess: "DENY",
      status: provenanceBlocked ? "BLOCKED" : "RUNNING",
      acceptance: [...FOUNDATION_ACCEPTANCE],
    },
    workers: listDeveloperGridWorkers(),
    centralCore: {
      domains: [...CENTRAL_CORE_DOMAINS],
      invariants: [
        "A rendszer emlékszik, nem az egyes AI-chat.",
        "Presence aktivitásjel; nem authoritative development context.",
        "SOURCE_BASELINE_MISMATCH esetén fail-closed BLOCKED.",
        "RELEASE_STATE_MISMATCH esetén fail-closed BLOCKED.",
        "DEV ONLY · PROD DENY.",
      ],
    },
    sourceProvenance,
    releaseRuntimeProvenance,
    buildNodes,
    buildExecutor: resolveBuildExecutor(buildNodes),
    realtime: {
      mode: "DELTA_EVENT",
      fullSnapshotPollingAllowed: false,
      historyMode: "EXPLICIT_PAGINATED",
    },
    controlPlane: {
      source: "BENJADMIN_DEVELOPER_CONSOLE",
      legacyReferencePath: "/admin/dev-console",
      views: ["ÁTTEKINTÉS", "FELADATOK", "MODULOK", "DOKUMENTUMOK", "ÁTADÓK", "BUILDEK", "ESEMÉNYEK"],
    },
    generatedAt: now,
  };
}
