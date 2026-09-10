"server-only";

import { createHash, randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { scanSensitiveText } from "@/app/lib/dev-center/ai-worker/secret-scanner";
import { listDevelopmentHandoffs, saveDevelopmentHandoff } from "@/app/lib/dev-center/handoff-store";
import { appendGridEvidence, getGridEvidenceSummary, listGridEvidence } from "./evidence";
import { readGridState, upsertWorkerSession } from "./state-store";
import type { GridEvidence, RoutableWorkerCode, WorkerSession } from "./types";

export const RAW_CHAT_TRANSCRIPT_SCHEMA = "RAW_CHAT_TRANSCRIPT_V1" as const;
export const CONTEXT_SNAPSHOT_SCHEMA = "BENJADMIN_CONTEXT_SNAPSHOT_V1" as const;
export const HANDOFF_PACK_SCHEMA = "BENJADMIN_HANDOFF_PACK_V1" as const;
export const DEFAULT_CONVERSATION_MEMORY_ROOT = "/srv/dimpro-dev/coordination/developer-grid/conversation-memory";

const MAX_MESSAGES = 500;
const MAX_MESSAGE_CHARS = 80_000;
const MAX_RAW_SNAPSHOT_BYTES = 32 * 1024 * 1024;
const MAX_CONTEXT_ROWS = 4000;
const LOCK_WAIT_MS = 40;
const LOCK_ATTEMPTS = 150;
const workers = new Set(["ARMINAI", "OUTMINAI", "BENJAMINAI", "JAZMINAI"]);

export type RawConversationMessage = {
  ordinal: number;
  messageId: string;
  role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
  text: string;
  textSha256: string;
};

export type RawConversationSnapshot = {
  schema: typeof RAW_CHAT_TRANSCRIPT_SCHEMA;
  schemaVersion: 1;
  id: string;
  environment: "DEV";
  productionAccess: "DENY";
  immutable: true;
  taskId: string;
  sessionId: string;
  workerCode: RoutableWorkerCode;
  conversationId: string;
  conversationUrl: string;
  conversationTitle: string;
  capturedAt: string;
  messageCount: number;
  deltaMessageCount: number;
  storageMode: "DELTA";
  snapshotSha256: string;
  previousChainSha256: string | null;
  chainSha256: string;
  messages: RawConversationMessage[];
};

export type ContextSnapshot = {
  schema: typeof CONTEXT_SNAPSHOT_SCHEMA;
  schemaVersion: 1;
  id: string;
  revision: number;
  environment: "DEV";
  productionAccess: "DENY";
  sanitized: true;
  taskId: string;
  sessionId: string;
  workerCode: RoutableWorkerCode;
  projectId: string;
  mainModule: string;
  moduleName: string;
  submoduleName: string | null;
  conversationId: string;
  rawSnapshotSha256: string;
  stage: number;
  stageLabel: string;
  sourceHead: string;
  branch: string;
  worktree: string;
  sourcePrompt: string;
  latestUserExcerpt: string;
  latestAssistantExcerpt: string;
  evidenceCounts: Record<string, number>;
  unresolvedBlockers: Array<{ kind: string; severity: string; status: string; summary: string }>;
  nextStage: number | null;
  nextStageLabel: string | null;
  summary: string;
  createdAt: string;
};

export type AutomaticHandoffPack = {
  schema: typeof HANDOFF_PACK_SCHEMA;
  schemaVersion: 1;
  id: string;
  environment: "DEV";
  productionAccess: "DENY";
  taskId: string;
  sessionId: string;
  workerCode: RoutableWorkerCode;
  conversationId: string;
  contextSnapshotId: string;
  sourceHead: string;
  stage: number;
  state: "DRAFT" | "READY" | "COMPLETED";
  buildEvidenceId: string | null;
  testEvidenceIds: string[];
  changedFiles: string[];
  blockers: string[];
  nextStep: string;
  summary: string;
  canonicalHandoffId: string | null;
  createdAt: string;
};

function text(value: unknown, max = 1000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}
function iso(value: unknown) {
  const raw = text(value, 100);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}
function safeId(value: unknown, max = 180) {
  return text(value, max).replace(/[^A-Za-z0-9._:-]/g, "-").replace(/^-+|-+$/g, "");
}
function sha(value: string) { return createHash("sha256").update(value).digest("hex"); }
function safeExcerpt(value: unknown, max = 1400) {
  const raw = text(value, max);
  if (!raw) return "";
  return scanSensitiveText(raw).length ? "[REDACTED_SENSITIVE_CONTENT]" : raw;
}
function role(value: unknown): RawConversationMessage["role"] | null {
  const raw = text(value, 40).toUpperCase();
  if (raw === "USER" || raw === "ASSISTANT" || raw === "SYSTEM" || raw === "TOOL") return raw;
  return null;
}
function stageLabel(stage: number) {
  return ({ 1:"ELEMZÉS", 2:"FEJLESZTÉS", 3:"TESZTELÉS", 4:"ELLENŐRZÉS", 5:"BUILD / KIADÁS", 6:"LEZÁRÁS" } as Record<number,string>)[stage] || "ISMERETLEN";
}
function memoryFiles(root = DEFAULT_CONVERSATION_MEMORY_ROOT) {
  const base = path.resolve(root);
  return {
    root: base,
    rawDir: path.join(base, "raw"),
    latestDir: path.join(base, "latest"),
    contexts: path.join(base, "contexts.jsonl"),
    handoffs: path.join(base, "handoff-packs.jsonl"),
    lock: path.join(base, ".memory.lock"),
  };
}
async function ensureRoot(root = DEFAULT_CONVERSATION_MEMORY_ROOT) {
  const f = memoryFiles(root);
  await Promise.all([mkdir(f.root,{recursive:true,mode:0o700}),mkdir(f.rawDir,{recursive:true,mode:0o700}),mkdir(f.latestDir,{recursive:true,mode:0o700})]);
  await Promise.all([chmod(f.root,0o700),chmod(f.rawDir,0o700),chmod(f.latestDir,0o700)]).catch(()=>undefined);
  return f;
}
async function atomicJson(file: string, payload: unknown) {
  const temp = `${file}.${process.pid}.${randomUUID().slice(0,8)}.tmp`;
  await writeFile(temp, `${JSON.stringify(payload,null,2)}\n`, {encoding:"utf8",mode:0o600});
  await rename(temp,file);
  await chmod(file,0o600).catch(()=>undefined);
}
async function acquire(root = DEFAULT_CONVERSATION_MEMORY_ROOT) {
  const f = await ensureRoot(root);
  for(let attempt=0; attempt<LOCK_ATTEMPTS; attempt+=1){
    try{
      const handle=await open(f.lock,"wx",0o600);
      await handle.writeFile(`${JSON.stringify({pid:process.pid,at:new Date().toISOString()})}\n`);
      return async()=>{await handle.close().catch(()=>undefined);await unlink(f.lock).catch(()=>undefined);};
    }catch(error){
      if((error as NodeJS.ErrnoException).code!=="EEXIST") throw error;
      try{const s=await stat(f.lock);if(Date.now()-s.mtimeMs>30_000){await unlink(f.lock).catch(()=>undefined);continue;}}catch{continue;}
      await new Promise(r=>setTimeout(r,LOCK_WAIT_MS));
    }
  }
  throw Object.assign(new Error("Conversation memory lock timeout."),{code:"DEVELOPER_GRID_MEMORY_LOCK_TIMEOUT"});
}
async function readLines<T>(file: string, max = MAX_CONTEXT_ROWS): Promise<T[]> {
  try{
    const raw=await readFile(file,"utf8");
    return raw.split("\n").filter(Boolean).slice(-max).flatMap(line=>{try{return [JSON.parse(line) as T];}catch{return [];}});
  }catch{return [];}
}
function normalizeMessages(value: unknown): RawConversationMessage[] {
  if(!Array.isArray(value)) return [];
  const rows: RawConversationMessage[]=[];
  for(const [index,item] of value.slice(0,MAX_MESSAGES).entries()){
    const row=item&&typeof item==="object"&&!Array.isArray(item)?item as Record<string,unknown>:{};
    const normalizedRole=role(row.role); const body=String(row.text??"").replace(/\r\n/g,"\n").trim().slice(0,MAX_MESSAGE_CHARS);
    if(!normalizedRole||!body) continue;
    rows.push({ordinal:index+1,messageId:safeId(row.messageId,220)||`${normalizedRole.toLowerCase()}-${index+1}`,role:normalizedRole,text:body,textSha256:sha(body)});
  }
  return rows;
}
function snapshotDigest(messages: RawConversationMessage[]) {
  return sha(JSON.stringify(messages.map(m=>({ordinal:m.ordinal,messageId:m.messageId,role:m.role,textSha256:m.textSha256}))));
}
function reconstructRawSnapshot(rows: RawConversationSnapshot[], taskId: string, sessionId: string) {
  const relevant=rows.filter(row=>row.taskId===taskId&&row.sessionId===sessionId);
  const latest=relevant.at(-1)||null;
  if(!latest) return null;
  const byId=new Map<string,RawConversationMessage>();
  for(const row of relevant){
    for(const message of row.messages||[]) byId.set(message.messageId,{...message});
  }
  const messages=[...byId.values()].sort((a,b)=>a.ordinal-b.ordinal||a.messageId.localeCompare(b.messageId));
  return {...latest,messages,messageCount:latest.messageCount||messages.length,deltaMessageCount:latest.deltaMessageCount||0,storageMode:"DELTA" as const};
}
function deltaMessages(current: RawConversationMessage[], prior: RawConversationSnapshot | null) {
  if(!prior) return current;
  const previous=new Map(prior.messages.map(message=>[message.messageId,message]));
  return current.filter(message=>{
    const before=previous.get(message.messageId);
    return !before||before.textSha256!==message.textSha256||before.role!==message.role||before.ordinal!==message.ordinal;
  });
}
async function currentSessionForInput(input: Record<string,unknown>, stateRoot?: string) {
  const state=await readGridState(stateRoot);
  const taskId=text(input.taskId,220); const sessionId=text(input.sessionId,240); const workerCode=text(input.workerCode,40).toUpperCase() as RoutableWorkerCode;
  if(!state.task||state.task.id!==taskId) throw Object.assign(new Error("A RAW transcript nem az authoritative aktuális taskhoz tartozik."),{code:"DEVELOPER_GRID_RAW_TASK_MISMATCH",status:409});
  if(!workers.has(workerCode)) throw Object.assign(new Error("Ismeretlen RAW transcript worker."),{code:"DEVELOPER_GRID_RAW_WORKER_INVALID",status:400});
  const session=state.sessions.find(s=>s.id===sessionId&&s.taskId===taskId&&s.workerCode===workerCode&&s.endedAt===null);
  if(!session) throw Object.assign(new Error("A RAW transcript aktív worker sessionje nem található."),{code:"DEVELOPER_GRID_RAW_SESSION_MISMATCH",status:409});
  const conversationId=safeId(input.conversationId,180);
  if(!conversationId||conversationId!==safeId(session.developmentContext.chatConversationId,180)) throw Object.assign(new Error("A RAW transcript csevegésazonosítója nem egyezik a rögzített ChatGPT csevegéssel."),{code:"DEVELOPER_GRID_RAW_CONVERSATION_MISMATCH",status:409});
  return {state,session,taskId,sessionId,workerCode,conversationId};
}
function latestMessage(messages: RawConversationMessage[], wanted: RawConversationMessage["role"]){return [...messages].reverse().find(m=>m.role===wanted)||null;}
function evidenceChangedFiles(evidence: GridEvidence[]){return [...new Set(evidence.filter(e=>e.kind==="FILE").map(e=>e.attributes.path).filter((v):v is string=>Boolean(v&&v!=="[SENSITIVE_PATH]")))].slice(0,120);}
function evidenceTests(evidence: GridEvidence[]){return evidence.filter(e=>e.kind==="TEST"&&e.status==="PASS").slice(0,80);}
function latestBuild(evidence: GridEvidence[],head:string){return evidence.find(e=>e.kind==="BUILD"&&e.status==="PASS"&&e.head===head)||null;}

async function createContextSnapshot(session: WorkerSession, raw: RawConversationSnapshot, root: string, stateRoot?: string) {
  const f=await ensureRoot(root);
  const prior=await readLines<ContextSnapshot>(f.contexts);
  const sessionPrior=prior.filter(x=>x.sessionId===session.id);
  const revision=(sessionPrior.at(-1)?.revision||0)+1;
  const evidence=await listGridEvidence({taskId:session.taskId,limit:500,root:stateRoot});
  const evidenceSummary=await getGridEvidenceSummary(session.taskId,stateRoot);
  const stage=Math.max(1,Math.min(6,Number(session.developmentContext.workStageIndex)||1));
  const nextStage=stage<6?stage+1:null;
  const user=latestMessage(raw.messages,"USER"); const assistant=latestMessage(raw.messages,"ASSISTANT");
  const sourcePrompt=safeExcerpt(session.developmentContext.sourcePrompt,1800);
  const latestUserExcerpt=safeExcerpt(user?.text,1400); const latestAssistantExcerpt=safeExcerpt(assistant?.text,1800);
  const blockers=evidenceSummary.unresolvedBlockers.slice(0,20).map(x=>({kind:x.kind,severity:x.severity,status:x.status,summary:safeExcerpt(x.summary,500)}));
  const summary=[
    `Task: ${safeExcerpt(session.developmentContext.workItem,600)}`,
    `Állapot: ${stage}/6 · ${stageLabel(stage)}`,
    `Worker: ${session.workerCode}`,
    `Source: ${safeExcerpt(session.sourceProvenance.branch,300)} · ${session.sourceProvenance.head.slice(0,12)}`,
    latestUserExcerpt?`Utolsó felhasználói kontextus: ${latestUserExcerpt}`:"",
    latestAssistantExcerpt?`Utolsó AI állapot: ${latestAssistantExcerpt}`:"",
    blockers.length?`Blokkolók: ${blockers.map(x=>x.summary).join(" | ")}`:"Blokkolók: nincs rögzített HIGH/CRITICAL blocker.",
    nextStage?`Következő fázis: ${nextStage}/6 · ${stageLabel(nextStage)}`:"Következő fázis: lezárási/handoff kapu.",
  ].filter(Boolean).join("\n");
  const snapshot: ContextSnapshot={schema:CONTEXT_SNAPSHOT_SCHEMA,schemaVersion:1,id:`ctx-${session.taskId}-${Date.now()}-${randomUUID().slice(0,8)}`,revision,environment:"DEV",productionAccess:"DENY",sanitized:true,taskId:session.taskId,sessionId:session.id,workerCode:session.workerCode as RoutableWorkerCode,projectId:session.developmentContext.projectId,mainModule:session.developmentContext.mainModule,moduleName:session.developmentContext.moduleName,submoduleName:session.developmentContext.submoduleName||null,conversationId:raw.conversationId,rawSnapshotSha256:raw.snapshotSha256,stage,stageLabel:stageLabel(stage),sourceHead:session.sourceProvenance.head,branch:session.sourceProvenance.branch,worktree:session.sourceProvenance.worktree,sourcePrompt,latestUserExcerpt,latestAssistantExcerpt,evidenceCounts:evidenceSummary.counts,unresolvedBlockers:blockers,nextStage,nextStageLabel:nextStage?stageLabel(nextStage):null,summary,createdAt:new Date().toISOString()};
  await appendFile(f.contexts,`${JSON.stringify(snapshot)}\n`,{encoding:"utf8",mode:0o600});
  await atomicJson(path.join(f.latestDir,`${raw.conversationId}.context.json`),snapshot);
  return {snapshot,evidence};
}

async function canonicalAutoHandoff(session: WorkerSession, context: ContextSnapshot, evidence: GridEvidence[]) {
  const build=latestBuild(evidence,session.sourceProvenance.head);
  const tests=evidenceTests(evidence).filter(e=>e.head===session.sourceProvenance.head);
  const blockers=context.unresolvedBlockers.map(x=>x.summary).filter(Boolean);
  const changedFiles=evidenceChangedFiles(evidence.filter(e=>e.head===session.sourceProvenance.head));
  const ready=context.stage>=6&&Boolean(build)&&tests.length>0&&blockers.length===0;
  if(!ready) return {state:"DRAFT" as const,canonicalHandoffId:null,build,tests,changedFiles,blockers};
  const deterministicId=`handoff-auto-${safeId(session.taskId,120)}-${session.sourceProvenance.head.slice(0,12)}`;
  const existing=(await listDevelopmentHandoffs()).find(h=>h.id===deterministicId)||null;
  if(existing) return {state:"COMPLETED" as const,canonicalHandoffId:existing.id,build,tests,changedFiles,blockers};
  const testsSummary=tests.slice(0,20).map(t=>`${t.attributes.testName||t.summary}: ${t.status}`).join(" · ")||"PASS test evidence";
  const buildRelease=`FULL BUILD PASS${build?.attributes.buildId?` · BUILD_ID ${build.attributes.buildId}`:""}`;
  const body=[
    "# BENJADMIN Automatikus Handoff Pack",
    "",
    `Task: ${session.taskId}`,
    `Worker: ${session.workerCode}`,
    `Stage: ${context.stage}/6 · ${context.stageLabel}`,
    `Branch: ${session.sourceProvenance.branch}`,
    `Worktree: ${session.sourceProvenance.worktree}`,
    `HEAD: ${session.sourceProvenance.head}`,
    "",
    "## Context Snapshot",
    context.summary,
    "",
    "## Módosított fájlok",
    ...(changedFiles.length?changedFiles.map(f=>`- ${f}`):["- Nincs sanitizált FILE evidence."]),
    "",
    "## Tesztek",
    ...tests.slice(0,30).map(t=>`- ${t.attributes.testName||t.summary}: ${t.status}`),
    "",
    "## Build",
    buildRelease,
    "",
    "## Következő lépés",
    "A következő task a Central Core aktuális BenjAdmin utasításából induljon; ezt a handoffot és a legfrissebb Context Snapshotot folytonossági forrásként használja.",
    "",
    "DEV ONLY · PROD DENY",
  ].join("\n");
  const saved=await saveDevelopmentHandoff({id:deterministicId,schemaVersion:2,chatSessionId:context.conversationId,chatTitle:session.developmentContext.chatConversationTitle||context.conversationId,workerCode:session.workerCode,mainProject:"DIMPRO - DIMPROVER",project:session.developmentContext.projectId,module:session.developmentContext.moduleName,contextModule:session.developmentContext.submoduleName||"",developmentArea:session.developmentContext.workItem,fileAreaKey:session.developmentContext.moduleName,taskId:session.taskId,taskTitle:session.developmentContext.workItem,liveNextTaskId:"",liveNextTaskTitle:"",startedAt:session.startedAt,finishedAt:new Date().toISOString(),status:"COMPLETED",branch:session.sourceProvenance.branch,worktree:session.sourceProvenance.worktree,startCommit:session.sourceProvenance.baseHead||session.sourceProvenance.head,endCommit:session.sourceProvenance.head,testsSummary,buildRelease,tags:["automatic","central-core","conversation-memory"],summary:context.summary,body});
  const already=evidence.find(e=>e.kind==="HANDOFF"&&e.attributes.handoffId===saved.id&&e.head===session.sourceProvenance.head);
  if(!already) await appendGridEvidence({kind:"HANDOFF",status:"COMPLETED",severity:"INFO",source:"HANDOFF_STORE",taskId:session.taskId,projectId:session.developmentContext.projectId,workerCode:session.workerCode,sessionId:session.id,branch:session.sourceProvenance.branch,worktree:session.sourceProvenance.worktree,head:session.sourceProvenance.head,summary:`Automatikus Handoff Pack COMPLETED · ${saved.id}`,attributes:{handoffId:saved.id,handoffStatus:"COMPLETED"}});
  return {state:"COMPLETED" as const,canonicalHandoffId:saved.id,build,tests,changedFiles,blockers};
}

async function createHandoffPack(session: WorkerSession, context: ContextSnapshot, evidence: GridEvidence[], root: string) {
  const f=await ensureRoot(root);
  const result=await canonicalAutoHandoff(session,context,evidence);
  const state=result.state;
  const pack: AutomaticHandoffPack={schema:HANDOFF_PACK_SCHEMA,schemaVersion:1,id:`hp-${session.taskId}-${Date.now()}-${randomUUID().slice(0,8)}`,environment:"DEV",productionAccess:"DENY",taskId:session.taskId,sessionId:session.id,workerCode:session.workerCode as RoutableWorkerCode,conversationId:context.conversationId,contextSnapshotId:context.id,sourceHead:session.sourceProvenance.head,stage:context.stage,state,buildEvidenceId:result.build?.id||null,testEvidenceIds:result.tests.map(t=>t.id),changedFiles:result.changedFiles,blockers:result.blockers,nextStep:context.nextStage?`${context.nextStage}/6 · ${context.nextStageLabel}`:"Új task / lezárás",summary:context.summary,canonicalHandoffId:result.canonicalHandoffId,createdAt:new Date().toISOString()};
  await appendFile(f.handoffs,`${JSON.stringify(pack)}\n`,{encoding:"utf8",mode:0o600});
  await atomicJson(path.join(f.latestDir,`${context.conversationId}.handoff.json`),pack);
  return pack;
}

async function updateSessionMemoryPointers(session: WorkerSession, raw: RawConversationSnapshot, context: ContextSnapshot, handoff: AutomaticHandoffPack, stateRoot?: string) {
  const updated: WorkerSession={...session,developmentContext:{...session.developmentContext,rawTranscriptState:"CAPTURING",rawTranscriptSnapshotSha256:raw.snapshotSha256,rawTranscriptCapturedAt:raw.capturedAt,contextSnapshotId:context.id,contextRevision:context.revision,contextSnapshotSummary:context.summary,handoffPackId:handoff.id,handoffPackState:handoff.state,resolvedAt:new Date().toISOString()}};
  await upsertWorkerSession(updated,stateRoot);
  return updated;
}

export async function appendConversationMemorySnapshot(input: Record<string,unknown>, options: {memoryRoot?:string;stateRoot?:string} = {}) {
  const memoryRoot=options.memoryRoot||DEFAULT_CONVERSATION_MEMORY_ROOT;
  const {session,taskId,sessionId,workerCode,conversationId}=await currentSessionForInput(input,options.stateRoot);
  const messages=normalizeMessages(input.messages);
  if(!messages.length) throw Object.assign(new Error("A RAW transcript snapshot legalább egy üzenetet igényel."),{code:"DEVELOPER_GRID_RAW_MESSAGES_REQUIRED",status:400});
  const snapshotSha256=snapshotDigest(messages);
  const payloadBytes=Buffer.byteLength(JSON.stringify(messages));
  if(payloadBytes>MAX_RAW_SNAPSHOT_BYTES) throw Object.assign(new Error("A RAW transcript snapshot túl nagy."),{code:"DEVELOPER_GRID_RAW_SNAPSHOT_TOO_LARGE",status:413});
  const f=await ensureRoot(memoryRoot);
  const release=await acquire(memoryRoot);
  try{
    const rawFile=path.join(f.rawDir,`${conversationId}.jsonl`);
    const rows=await readLines<RawConversationSnapshot>(rawFile,4000);
    const previousChain=rows.at(-1)||null;
    const previousSession=reconstructRawSnapshot(rows,taskId,sessionId);
    if(previousSession?.snapshotSha256===snapshotSha256){
      const latestContext=await readLatestContext(conversationId,memoryRoot);
      const latestHandoff=await readLatestHandoffPack(conversationId,memoryRoot);
      return {deduplicated:true,raw:rawMetadata(previousSession),context:latestContext,handoff:latestHandoff,productionAccess:"DENY" as const};
    }
    const delta=deltaMessages(messages,previousSession);
    const previousChainSha256=previousChain?.chainSha256||null;
    const chainSha256=sha(`${previousChainSha256||"GENESIS"}\n${snapshotSha256}\n${taskId}\n${sessionId}\n${conversationId}\n${delta.length}`);
    const stored: RawConversationSnapshot={schema:RAW_CHAT_TRANSCRIPT_SCHEMA,schemaVersion:1,id:`raw-${taskId}-${Date.now()}-${randomUUID().slice(0,8)}`,environment:"DEV",productionAccess:"DENY",immutable:true,taskId,sessionId,workerCode,conversationId,conversationUrl:text(input.conversationUrl,1200),conversationTitle:text(input.conversationTitle,500),capturedAt:iso(input.capturedAt),messageCount:messages.length,deltaMessageCount:delta.length,storageMode:"DELTA",snapshotSha256,previousChainSha256,chainSha256,messages:delta};
    await appendFile(rawFile,`${JSON.stringify(stored)}\n`,{encoding:"utf8",mode:0o600});
    await chmod(rawFile,0o600).catch(()=>undefined);
    const raw: RawConversationSnapshot={...stored,messages};
    const {snapshot:context,evidence}=await createContextSnapshot(session,raw,memoryRoot,options.stateRoot);
    const handoff=await createHandoffPack(session,context,evidence,memoryRoot);
    await updateSessionMemoryPointers(session,raw,context,handoff,options.stateRoot);
    return {deduplicated:false,raw:rawMetadata(stored),context,handoff,productionAccess:"DENY" as const};
  } finally {await release();}
}

function rawMetadata(raw: RawConversationSnapshot){return {id:raw.id,schema:raw.schema,taskId:raw.taskId,sessionId:raw.sessionId,workerCode:raw.workerCode,conversationId:raw.conversationId,capturedAt:raw.capturedAt,messageCount:raw.messageCount,deltaMessageCount:raw.deltaMessageCount,storageMode:raw.storageMode,snapshotSha256:raw.snapshotSha256,chainSha256:raw.chainSha256,immutable:true};}
export async function readLatestContext(conversationId: string, root = DEFAULT_CONVERSATION_MEMORY_ROOT){try{return JSON.parse(await readFile(path.join((await ensureRoot(root)).latestDir,`${safeId(conversationId,180)}.context.json`),"utf8")) as ContextSnapshot;}catch{return null;}}
export async function readLatestHandoffPack(conversationId: string, root = DEFAULT_CONVERSATION_MEMORY_ROOT){try{return JSON.parse(await readFile(path.join((await ensureRoot(root)).latestDir,`${safeId(conversationId,180)}.handoff.json`),"utf8")) as AutomaticHandoffPack;}catch{return null;}}

export async function getConversationMemoryStatus(input: {taskId?:string;sessionId?:string;conversationId?:string;root?:string}={}) {
  const root=input.root||DEFAULT_CONVERSATION_MEMORY_ROOT; const f=await ensureRoot(root); const contexts=await readLines<ContextSnapshot>(f.contexts); const handoffs=await readLines<AutomaticHandoffPack>(f.handoffs);
  const taskId=text(input.taskId,220),sessionId=text(input.sessionId,240),conversationId=safeId(input.conversationId,180);
  const cf=contexts.filter(x=>(!taskId||x.taskId===taskId)&&(!sessionId||x.sessionId===sessionId)&&(!conversationId||x.conversationId===conversationId));
  const hf=handoffs.filter(x=>(!taskId||x.taskId===taskId)&&(!sessionId||x.sessionId===sessionId)&&(!conversationId||x.conversationId===conversationId));
  const context=cf.at(-1)||null; const handoff=hf.at(-1)||null;
  let raw=null as ReturnType<typeof rawMetadata>|null;
  if(context){const rawFile=path.join(f.rawDir,`${context.conversationId}.jsonl`);const rows=await readLines<RawConversationSnapshot>(rawFile,4000);const found=[...rows].reverse().find(x=>(!taskId||x.taskId===taskId)&&(!sessionId||x.sessionId===sessionId));if(found)raw=rawMetadata(found);}
  return {raw,context,handoff,productionAccess:"DENY" as const};
}

export async function findLatestContinuationContext(input:{projectId:string;moduleName:string;submoduleName?:string|null;excludeTaskId?:string|null;root?:string}){
  const f=await ensureRoot(input.root||DEFAULT_CONVERSATION_MEMORY_ROOT);const rows=await readLines<ContextSnapshot>(f.contexts,MAX_CONTEXT_ROWS);
  const project=text(input.projectId,180).toLowerCase(),moduleKey=text(input.moduleName,180).toLowerCase(),sub=text(input.submoduleName,180).toLowerCase();
  return [...rows].reverse().find(x=>x.taskId!==input.excludeTaskId&&x.projectId.toLowerCase()===project&&x.moduleName.toLowerCase()===moduleKey&&(!sub||!x.submoduleName||x.submoduleName.toLowerCase()===sub))||null;
}

export async function refreshDerivedConversationMemory(taskId:string, sessionId:string, options:{memoryRoot?:string;stateRoot?:string}={}){
  const state=await readGridState(options.stateRoot);const session=state.sessions.find(s=>s.taskId===taskId&&s.id===sessionId&&s.endedAt===null);if(!session||!session.developmentContext.chatConversationId)return null;
  const root=options.memoryRoot||DEFAULT_CONVERSATION_MEMORY_ROOT;const f=await ensureRoot(root);const rows=await readLines<RawConversationSnapshot>(path.join(f.rawDir,`${safeId(session.developmentContext.chatConversationId,180)}.jsonl`),4000);const raw=reconstructRawSnapshot(rows,taskId,sessionId);if(!raw)return null;
  const release=await acquire(root);try{const {snapshot:context,evidence}=await createContextSnapshot(session,raw,root,options.stateRoot);const handoff=await createHandoffPack(session,context,evidence,root);await updateSessionMemoryPointers(session,raw,context,handoff,options.stateRoot);return {raw:rawMetadata(raw),context,handoff,productionAccess:"DENY" as const};}finally{await release();}
}
