import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDevEngineTask } from "../engine-repository";
import { resolveProjectRepositoryId } from "../partner-isolation";

import { EXTERNAL_AI_WORKER_VERSION, EXTERNAL_AI_WORKFLOW, EXTERNAL_AI_DEFAULTS, normalizeExternalAiWorkflowState, canTransitionExternalAiWorkerState, isV10TransitionImplemented, type ExternalAiWorkflowState, type ExternalAiLaunchMode, type ExternalAiModelPreference } from "./workflow";
import { EXTERNAL_AI_WORKERS } from "./profiles";
import { mockWorkerAdapter } from "./model-adapter";
import { analyzeTechnicalScope } from "./scope-analyzer";

export { EXTERNAL_AI_WORKER_VERSION, EXTERNAL_AI_WORKFLOW, EXTERNAL_AI_DEFAULTS, EXTERNAL_AI_WORKERS, mockWorkerAdapter, canTransitionExternalAiWorkerState, isV10TransitionImplemented };

function dbClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-external-ai-worker-v1/1.0" } },
  });
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function positiveInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}
function launchMode(value: unknown): ExternalAiLaunchMode {
  const normalized = text(value).toUpperCase();
  return normalized === "QUICK" || normalized === "PARALLEL" ? normalized : "WORKER";
}
function modelPreference(value: unknown): ExternalAiModelPreference {
  const normalized = text(value).toUpperCase();
  return normalized === "CLAUDE" || normalized === "OPENAI_CODEX" ? normalized : "AUTO";
}
export async function createExternalAiWorkerTask(input: Record<string, unknown>) {
  const projectId = text(input.projectId);
  const title = text(input.title);
  const goal = text(input.goal);
  if (!projectId || !title || !goal) return { ok: false as const, error: "A projekt, feladatnév és cél kötelező." };
  const repositoryId = await resolveProjectRepositoryId(dbClient(), projectId);
  if (!repositoryId) return { ok: false as const, error: "A projekthez nincs aktív DEV repository-kötés." };
  const mode = launchMode(input.launchMode);
  const model = modelPreference(input.modelPreference);
  const taskBudgetHuf = positiveInt(input.taskBudgetHuf, EXTERNAL_AI_DEFAULTS.taskBudgetHuf, 100, 1_000_000);
  const maxActiveMinutesPerWorker = positiveInt(input.maxActiveMinutesPerWorker, EXTERNAL_AI_DEFAULTS.maxActiveMinutesPerWorker, 5, 480);
  const metadata = {
    origin: "BENJADMIN_EXTERNAL_AI_WORKER_V1",
    workflowTarget: EXTERNAL_AI_WORKFLOW,
    recordType: "WORKER_TASK",
    externalAiWorkerVersion: EXTERNAL_AI_WORKER_VERSION,
    workflowState: "DRAFT" as ExternalAiWorkflowState,
    launchMode: mode,
    modelPreference: model,
    moduleHint: text(input.moduleHint) || null,
    technicalScopeMode: "AUTO_BENJADMIN",
    scopeUserSelectionRequired: false,
    taskBudgetHuf,
    forgeBudgetHuf: Math.min(taskBudgetHuf, EXTERNAL_AI_DEFAULTS.forgeBudgetHuf),
    guardBudgetHuf: Math.min(taskBudgetHuf, EXTERNAL_AI_DEFAULTS.guardBudgetHuf),
    maxActiveMinutesPerWorker,
    maxFixRounds: EXTERNAL_AI_DEFAULTS.maxFixRounds,
    budgetThresholds: { warning: 75, strongWarning: 90, hardStop: 100 },
    productionAccess: "DENY",
    providerAdapter: "MOCK",
    providerExecutionEnabled: false,
    sourceDocument: {
      name: "05_DIMPRO_BENJADMIN_Kulso_AI_Worker_V1_fejlesztoi_kiegeszites_v2_2026-08-12.pdf",
      version: "V2",
      sha256: "7d60b8a9a2930aa4e41e239d2df878ed6b3a5445a1bd51d0eae13e4c63b9e149",
    },
    avatarResource: {
      id: "devres-860dcf5a-b085-4dd9-bc0a-4f10640eaa5d",
      sha256: "100032cd10a4664e85d8d36bd6b95aae92cab2ce40275119fb3791af968bd748",
    },
  };
  const created = await createDevEngineTask({
    projectId,
    repositoryId,
    title,
    description: goal,
    priority: 70,
    requestedWorkerId: null,
    scope: [],
    acceptance: [],
    metadata,
    createdBy: "BenAI",
  });
  if (!created.ok) return created;
  return {
    ok: true as const,
    task: created.task,
    workflow: { state: "DRAFT" as const, launchMode: mode, modelPreference: model, taskBudgetHuf, maxActiveMinutesPerWorker },
    workers: EXTERNAL_AI_WORKERS,
    adapter: await mockWorkerAdapter.probe(),
  };
}

type TaskRow = {
  id: string;
  project_id: string | null;
  repository_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: number | null;
  scope: unknown;
  acceptance: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function mapTask(row: TaskRow) {
  const metadata = record(row.metadata);
  return {
    id: row.id,
    projectId: row.project_id,
    repositoryId: row.repository_id,
    title: row.title,
    goal: row.description || "",
    engineStatus: row.status,
    workflowState: normalizeExternalAiWorkflowState(metadata.workflowState),
    launchMode: launchMode(metadata.launchMode),
    modelPreference: modelPreference(metadata.modelPreference),
    moduleHint: text(metadata.moduleHint) || null,
    taskBudgetHuf: positiveInt(metadata.taskBudgetHuf, EXTERNAL_AI_DEFAULTS.taskBudgetHuf, 0, 1_000_000),
    forgeBudgetHuf: positiveInt(metadata.forgeBudgetHuf, EXTERNAL_AI_DEFAULTS.forgeBudgetHuf, 0, 1_000_000),
    guardBudgetHuf: positiveInt(metadata.guardBudgetHuf, EXTERNAL_AI_DEFAULTS.guardBudgetHuf, 0, 1_000_000),
    maxActiveMinutesPerWorker: positiveInt(metadata.maxActiveMinutesPerWorker, EXTERNAL_AI_DEFAULTS.maxActiveMinutesPerWorker, 1, 480),
    maxFixRounds: positiveInt(metadata.maxFixRounds, EXTERNAL_AI_DEFAULTS.maxFixRounds, 0, 2),
    technicalScopeMode: text(metadata.technicalScopeMode) || "AUTO_BENJADMIN",
    scopeAnalysisState: text(metadata.scopeAnalysisState) || "PENDING",
    scopeAnalysis: record(metadata.scopeAnalysis),
    scopeExpansionRequest: record(metadata.scopeExpansionRequest),
    preflight: record(metadata.preflight),
    checkpoint: record(metadata.checkpoint),
    contextPack: record(metadata.contextPack),
    workspacePlan: record(metadata.workspacePlan),
    scope: row.scope,
    acceptance: row.acceptance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listExternalAiWorkerTasks() {
  const { data, error } = await dbClient()
    .from("dev_center_tasks")
    .select("id,project_id,repository_id,title,description,status,priority,scope,acceptance,metadata,created_at,updated_at")
    .contains("metadata", { workflowTarget: EXTERNAL_AI_WORKFLOW, recordType: "WORKER_TASK" })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return ((data || []) as TaskRow[]).map(mapTask);
}

export async function transitionExternalAiWorkerTask(taskId: string, requestedState: string) {
  const target = normalizeExternalAiWorkflowState(requestedState);
  const db = dbClient();
  const { data, error } = await db.from("dev_center_tasks").select("id,project_id,status,metadata").eq("id", taskId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: false as const, error: "Az AI worker task nem található." };
  const metadata = record(data.metadata);
  if (metadata.workflowTarget !== EXTERNAL_AI_WORKFLOW) return { ok: false as const, error: "A task nem Külső AI Worker V1 feladat." };
  const current = normalizeExternalAiWorkflowState(metadata.workflowState);
  if (!canTransitionExternalAiWorkerState(current, target)) return { ok: false as const, error: `Érvénytelen workflow átmenet: ${current} → ${target}.` };
  if (!isV10TransitionImplemented(current, target)) return { ok: false as const, error: `A ${current} → ${target} átmenet a V1.1+ fázisban aktiválható; V1.0 nem színlel végrehajtást.` };
  const nextMetadata = { ...metadata, workflowState: target, workflowUpdatedAt: new Date().toISOString() };
  const engineStatus = target === "READY" ? "ready" : target === "PAUSED" ? "blocked" : data.status;
  const updated = await db.from("dev_center_tasks").update({ metadata: nextMetadata, status: engineStatus, updated_at: new Date().toISOString() }).eq("id", taskId).select("id,status,metadata,updated_at").single();
  if (updated.error) throw new Error(updated.error.message);
  const audit = await db.from("dev_center_audit_events").insert({
    id: `dev-audit-${randomUUID().slice(0, 12)}`,
    actor_type: "system",
    actor_id: "BenAI",
    action: "AI_WORKER_STATE_TRANSITION",
    entity_type: "task",
    entity_id: taskId,
    task_id: taskId,
    project_id: data.project_id,
    summary: `Külső AI Worker V1: ${current} → ${target}`,
    metadata: { from: current, to: target, version: EXTERNAL_AI_WORKER_VERSION },
  });
  if (audit.error) throw new Error(audit.error.message);
  return { ok: true as const, taskId, from: current, to: target, engineStatus };
}

export async function analyzeExternalAiWorkerTask(taskId: string) {
  const db = dbClient();
  const { data, error } = await db.from("dev_center_tasks").select("id,project_id,title,description,status,metadata").eq("id", taskId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: false as const, error: "Az AI worker task nem található." };
  const metadata = record(data.metadata);
  if (metadata.workflowTarget !== EXTERNAL_AI_WORKFLOW || metadata.recordType !== "WORKER_TASK") return { ok: false as const, error: "A task nem Külső AI Worker V1 végrehajtási task." };
  const analysis = await analyzeTechnicalScope({ title: data.title || "", goal: data.description || "", moduleHint: text(metadata.moduleHint) || null });
  const blockedByRed = analysis.deniedCount > 0;
  const nextState: ExternalAiWorkflowState = blockedByRed ? "DRAFT" : "READY";
  const analysisState = blockedByRed ? "BLOCKED_RED" : analysis.reviewRequired ? "NEEDS_REVIEW" : "AUTO_APPROVED";
  const scopeExpansionRequest = analysis.reviewCount > 0 ? {
    id: `scope-exp-${randomUUID().slice(0, 12)}`, status: "PENDING", requestedAt: new Date().toISOString(), requestedBy: "BenAI",
    candidatePaths: analysis.candidates.filter((candidate) => candidate.riskLevel === "YELLOW").map((candidate) => candidate.path),
    reason: "YELLOW technikai scope külön felülvizsgálatot igényel; a felhasználónak nem kell fájlonként döntenie.",
  } : null;
  const nextMetadata = { ...metadata, workflowState: nextState, scopeAnalysisState: analysisState, scopeAnalysis: analysis, scopeExpansionRequest, scopeAnalyzedAt: analysis.generatedAt };
  const update = await db.from("dev_center_tasks").update({
    metadata: nextMetadata,
    scope: blockedByRed ? [] : analysis.approvedScope,
    status: blockedByRed ? "blocked" : "ready",
    blocked_reason: blockedByRed ? "A technikai scope PIROS/tiltott területet érint; külön BENJADMIN döntés szükséges." : null,
    updated_at: new Date().toISOString(),
  }).eq("id", taskId).select("id,status,scope,metadata,blocked_reason,updated_at").single();
  if (update.error) throw new Error(update.error.message);
  const audit = await db.from("dev_center_audit_events").insert({
    id: `dev-audit-${randomUUID().slice(0, 12)}`, actor_type: "system", actor_id: "BenAI", action: "AI_WORKER_SCOPE_ANALYZED",
    entity_type: "task", entity_id: taskId, task_id: taskId, project_id: data.project_id,
    summary: `Automatikus technikai scope: ${analysis.overallRisk} · ${analysis.candidates.length} jelölt · ${analysis.approvedScope.length} automatikusan engedhető.`,
    metadata: { analyzerVersion: analysis.analyzerVersion, overallRisk: analysis.overallRisk, reviewCount: analysis.reviewCount, deniedCount: analysis.deniedCount, analysisState },
  });
  if (audit.error) throw new Error(audit.error.message);
  return { ok: true as const, taskId, workflowState: nextState, scopeAnalysisState: analysisState, analysis };
}

export async function resolveExternalAiScopeReview(taskId: string, action: string) {
  const db=dbClient();
  const task=await db.from("dev_center_tasks").select("id,project_id,status,scope,metadata").eq("id",taskId).maybeSingle();
  if(task.error)throw new Error(task.error.message);
  if(!task.data)return{ok:false as const,error:"Az AI worker task nem található."};
  const metadata=record(task.data.metadata),analysis=record(metadata.scopeAnalysis);
  if(metadata.workflowTarget!==EXTERNAL_AI_WORKFLOW||metadata.recordType!=="WORKER_TASK")return{ok:false as const,error:"A task nem Külső AI Worker V1 task."};
  if(metadata.scopeAnalysisState!=="NEEDS_REVIEW")return{ok:false as const,error:"A scope jelenleg nem YELLOW review állapotú."};
  if(action!=="EXCLUDE_YELLOW")return{ok:false as const,error:"V1.1-ben csak a biztonságos YELLOW-kizárás aktív; YELLOW write-jóváhagyás provider/gate nélkül tiltott."};
  const request=record(metadata.scopeExpansionRequest);
  const nextRequest={...request,status:"RESOLVED_EXCLUDED",resolvedAt:new Date().toISOString(),resolvedBy:"BENJADMIN_SAFE_POLICY",decision:"EXCLUDE_YELLOW"};
  const nextMetadata={...metadata,scopeAnalysisState:"REVIEW_RESOLVED_SAFE",scopeExpansionRequest:nextRequest,scopeReviewResolvedAt:new Date().toISOString()};
  const update=await db.from("dev_center_tasks").update({metadata:nextMetadata,status:"ready",blocked_reason:null,updated_at:new Date().toISOString()}).eq("id",taskId).select("id,status,scope,metadata,updated_at").single();
  if(update.error)throw new Error(update.error.message);
  const audit=await db.from("dev_center_audit_events").insert({id:`dev-audit-${randomUUID().slice(0,12)}`,actor_type:"system",actor_id:"BenAI",action:"AI_WORKER_SCOPE_REVIEW_RESOLVED_SAFE",entity_type:"task",entity_id:taskId,task_id:taskId,project_id:task.data.project_id,summary:"YELLOW scope biztonságosan kizárva; csak a GREEN scope marad végrehajtható.",metadata:{scopeExpansionRequestId:request.id||null,yellowCount:Array.isArray(analysis.candidates)?analysis.candidates.filter((candidate)=>record(candidate).riskLevel==="YELLOW").length:0}});
  if(audit.error)throw new Error(audit.error.message);
  return{ok:true as const,taskId,scopeAnalysisState:"REVIEW_RESOLVED_SAFE" as const,scopeExpansionRequest:nextRequest,scope:update.data.scope};
}
