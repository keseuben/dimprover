"server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, link, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DEFAULT_DEVELOPER_GRID_STATE_ROOT, readGridState } from "./state-store";
import { readBuildRunStore } from "./build-run-store";
import { evaluateDeveloperGridReviewGate } from "./review-gate";
import { verifyCurrentSourceExecutionState } from "./source-provenance";
import { devDeliveryIdentity, sameDevDeliveryIdentity, type DevDeliveryRecord } from "./dev-delivery-policy";

const ROOT = path.join(DEFAULT_DEVELOPER_GRID_STATE_ROOT, "dev-deliveries");
function fail(code: string, message: string): never { throw Object.assign(new Error(message), { code, status:409 }); }
function idFor(taskId: string, sessionId: string) { return `dev-delivery-${createHash("sha256").update(JSON.stringify([taskId,sessionId])).digest("hex").slice(0,32)}`; }
async function readRecord(id: string): Promise<DevDeliveryRecord | null> {
  try { return JSON.parse(await readFile(path.join(ROOT, `${id}.json`), "utf8")); }
  catch(error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
// link() publishes a complete JSON document atomically and never replaces prior approval/proof.
async function immutable(file: string, value: unknown) {
  await mkdir(ROOT, {recursive:true,mode:0o700});
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value,null,2)+"\n", {mode:0o600,flag:"wx"});
  try { await link(temp,file); return true; }
  catch(error) { if((error as NodeJS.ErrnoException).code === "EEXIST")return false;throw error; }
  finally { await unlink(temp); }
}
export async function getDeveloperGridDevDelivery(taskId: string, sessionId: string): Promise<DevDeliveryRecord | null> {
  if (!taskId || !sessionId) return null;
  const record=await readRecord(idFor(taskId,sessionId));
  if(record && (record.taskId!==taskId || record.sessionId!==sessionId || record.environment!=="DEV" || record.productionAccess!=="DENY")) fail("DEV_DELIVERY_IDENTITY_CONFLICT","A tárolt kihelyezés azonosítói eltérnek.");
  return record?{...record,paused:existsSync(path.join(ROOT,`${record.id}.paused`))}:null;
}
async function authorized(input: Record<string,unknown>) {
  const state=await readGridState();
  const session=state.sessions.find(s=>s.taskId===input.taskId&&s.id===input.sessionId&&s.endedAt===null);
  if(!session)fail("DEV_DELIVERY_SESSION_REQUIRED","Aktív task és munkamenet szükséges.");
  const identity=devDeliveryIdentity(session,(await readBuildRunStore()).runs);
  await verifyCurrentSourceExecutionState(session.sourceProvenance,{requireClean:true});
  const gate=await evaluateDeveloperGridReviewGate({taskId:session.taskId,target:"CLOSURE"});
  if(!gate.ready)fail("DEV_DELIVERY_CLOSURE_GATE_BLOCKED","A teszt-, review-, build- és átadási feltételek még nem teljesültek.");
  return {session,identity};
}
function dispatch(id: string) {
  const roots=[process.env.DIMPRO_DEVELOPER_GRID_SOURCE_WORKTREE,process.cwd()].filter(Boolean) as string[];
  const script=roots.map(root=>path.join(root,"scripts/developer-grid/dev-delivery-job.sh")).find(existsSync);
  if(!script)fail("DEV_DELIVERY_JOB_MISSING","A központi DEV-kihelyező nincs telepítve.");
  const child=spawn("bash",[script,id],{cwd:path.resolve(script,"../../.."),detached:true,stdio:"ignore",env:{...process.env,DIMPRO_PRODUCTION_ACCESS:"DENY"}});
  child.on("error",()=>undefined);child.unref();
}
export async function advanceDeveloperGridDevDelivery(input: Record<string,unknown>) {
  const {identity}=await authorized(input);
  const id=idFor(identity.taskId,identity.sessionId),now=new Date().toISOString();
  const initial: DevDeliveryRecord={...identity,schemaVersion:1,id,target:"DRIVE_DEV",environment:"DEV",productionAccess:"DENY",status:"APPROVED",approvedAt:now,updatedAt:now,code:null,browserVerification:null};
  await immutable(path.join(ROOT,`${id}.json`),initial);
  const record=await readRecord(id);
  if(!record || !sameDevDeliveryIdentity(record,identity))fail("DEV_DELIVERY_APPROVAL_MISMATCH","A feladat korábbi kihelyezési jóváhagyása más buildhez tartozik. Új buildhez új fejlesztési kör szükséges.");
  if(!["PASS_ASSISTED","ROLLED_BACK","BLOCKED"].includes(record.status))dispatch(id);
  return record;
}
export async function recordDeveloperGridDevBrowserCheck(input: Record<string,unknown>) {
  const identity=input.result==="FAIL"
    ? await (async()=>{const state=await readGridState();const s=state.sessions.find(s=>s.taskId===input.taskId&&s.id===input.sessionId&&s.endedAt===null);if(!s)fail("DEV_DELIVERY_SESSION_REQUIRED","Aktív munkamenet szükséges.");const r=await getDeveloperGridDevDelivery(s.taskId,s.id);if(!r)fail("DEV_BROWSER_CHECK_NOT_PENDING","Nincs visszaállítható kihelyezés.");return {taskId:r.taskId,sessionId:r.sessionId,workerCode:r.workerCode,sourceCommit:r.sourceCommit,sourceBranch:r.sourceBranch,buildRunId:r.buildRunId,buildId:r.buildId,artifactSha256:r.artifactSha256};})()
    : (await authorized(input)).identity;
  const record=await getDeveloperGridDevDelivery(identity.taskId,identity.sessionId);
  if(!record || !sameDevDeliveryIdentity(record,identity) || record.status!=="PUBLIC_PENDING_BROWSER")fail("DEV_BROWSER_CHECK_NOT_PENDING","Ehhez a buildhez most nem vár böngészős ellenőrzés.");
  // A paired operator must confirm the exact currently displayed build, not a stale UI snapshot.
  for(const key of ["id","sourceCommit","buildId","artifactSha256"] as const)if(input[key]!==record[key])fail("DEV_BROWSER_CHECK_IDENTITY_MISMATCH","A böngészős ellenőrzés másik kiadáshoz tartozik.");
  const result=String(input.result||""),note=String(input.note||"").trim();
  if(result==="PASS"&&Date.now()>Date.parse(String(record.browserDeadlineAt||"")))fail("DEV_BROWSER_CHECK_EXPIRED","A böngészős ellenőrzés ideje lejárt; a korábbi verzió visszaállítása szükséges.");
  if(!["PASS","FAIL"].includes(result) || note.length<12 || note.length>1000 || !record.publicHttp)fail("DEV_BROWSER_CHECK_OBSERVATION_REQUIRED","Írd le a bejelentkezett DEV-felületen ténylegesen ellenőrzött verziót és működést.");
  const proof={taskId:record.taskId,sessionId:record.sessionId,workerCode:record.workerCode,sourceCommit:record.sourceCommit,sourceBranch:record.sourceBranch,buildRunId:record.buildRunId,buildId:record.buildId,artifactSha256:record.artifactSha256,id:record.id,result,note,observedAt:new Date().toISOString(),authority:"PAIRED_OPERATOR"};
  const published=await immutable(path.join(ROOT,`${record.id}.browser.json`),proof);
  if(!published)fail("DEV_BROWSER_CHECK_ALREADY_RECORDED","Ehhez a kiadáshoz a böngészős döntést már rögzítették.");
  dispatch(record.id);
  return {accepted:true,id:record.id,status:"BROWSER_CHECK_RECORDED",productionAccess:"DENY"};
}

export async function pauseDeveloperGridDevDelivery(input: Record<string,unknown>) {
  const state=await readGridState();
  const session=state.sessions.find(s=>s.taskId===input.taskId&&s.id===input.sessionId&&s.endedAt===null);
  if(!session)fail("DEV_DELIVERY_SESSION_REQUIRED","Aktív munkamenet szükséges.");
  const record=await getDeveloperGridDevDelivery(session.taskId,session.id);
  if(!record)return null;
  const file=path.join(ROOT,`${record.id}.paused`);
  if(input.action==="PAUSE")await immutable(file,{pausedAt:new Date().toISOString()});
  else {try{await unlink(file);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}}
  return {...record,paused:input.action==="PAUSE"};
}
