"use strict";

const EXECUTION_REQUEST_START = "BENJADMIN_EXECUTION_REQUEST_V1";
const EXECUTION_REQUEST_END = "BENJADMIN_EXECUTION_REQUEST_END";
const EXECUTION_RESULT_START = "BENJADMIN_EXECUTION_RESULT_V1";
const EXECUTION_RESULT_END = "BENJADMIN_EXECUTION_RESULT_END";
const ACTIONS = new Set(["LIST_FILES","READ_FILE","SEARCH_FILES","WRITE_FILE","GIT_STATUS","GIT_DIFF","GIT_DIFF_CHECK","RUN_DEV_COMMAND"]);
const WORKERS = new Set(["ARMINAI","OUTMINAI","BENJAMINAI","BENAI","JAZMINAI"]);
const COMMANDS = new Set(["TSC","LINT","CONTRACT"]);
function text(value,max=200000){return String(value??"").trim().slice(0,max)}
function record(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{}}
function parseDeveloperGridExecutionRequest(raw){
  const body=String(raw||"");const start=body.lastIndexOf(EXECUTION_REQUEST_START);if(start<0)return{ok:false,code:"EXECUTION_REQUEST_MARKER_MISSING",error:"A BENJADMIN_EXECUTION_REQUEST_V1 marker hiányzik."};const jsonStart=start+EXECUTION_REQUEST_START.length;const end=body.indexOf(EXECUTION_REQUEST_END,jsonStart);if(end<0)return{ok:false,code:"EXECUTION_REQUEST_END_MISSING",error:"A BENJADMIN_EXECUTION_REQUEST_END marker hiányzik."};let parsed;try{parsed=JSON.parse(body.slice(jsonStart,end).trim())}catch{return{ok:false,code:"EXECUTION_REQUEST_JSON_INVALID",error:"Az execution request JSON nem érvényes."}}
  const row=record(parsed);const schemaVersion=Number(row.schemaVersion);const requestId=text(row.requestId,120);const taskId=text(row.taskId,220);const sessionId=text(row.sessionId,240);const workerRaw=text(row.workerCode,40).toUpperCase();const workerCode=workerRaw==="BENAI"?"BENJAMINAI":workerRaw;const sourceProofSha256=text(row.sourceProofSha256,80).toLowerCase();const action=text(row.action,40).toUpperCase();
  if(schemaVersion!==1)return{ok:false,code:"EXECUTION_REQUEST_SCHEMA_INVALID",error:"Ismeretlen execution schemaVersion."};if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(requestId))return{ok:false,code:"EXECUTION_REQUEST_ID_INVALID",error:"Érvénytelen execution requestId."};if(!taskId||!sessionId||!WORKERS.has(workerRaw)||!/^[0-9a-f]{64}$/.test(sourceProofSha256))return{ok:false,code:"EXECUTION_REQUEST_IDENTITY_INVALID",error:"Hiányos execution identity."};if(!ACTIONS.has(action))return{ok:false,code:"EXECUTION_REQUEST_ACTION_INVALID",error:"Ismeretlen execution action."};
  const path=text(row.path,1000);const query=text(row.query,500);const content=typeof row.content==="string"?row.content:"";const command=text(row.command,80).toUpperCase();if(["READ_FILE","WRITE_FILE"].includes(action)&&!path)return{ok:false,code:"EXECUTION_REQUEST_PATH_REQUIRED",error:`${action} path kötelező.`};if(action==="SEARCH_FILES"&&!query)return{ok:false,code:"EXECUTION_REQUEST_QUERY_REQUIRED",error:"SEARCH_FILES query kötelező."};if(action==="RUN_DEV_COMMAND"&&!COMMANDS.has(command))return{ok:false,code:"EXECUTION_REQUEST_COMMAND_INVALID",error:"RUN_DEV_COMMAND csak TSC, LINT vagy CONTRACT lehet."};if(action==="RUN_DEV_COMMAND"&&command==="CONTRACT"&&!path)return{ok:false,code:"EXECUTION_REQUEST_CONTRACT_PATH_REQUIRED",error:"CONTRACT futtatáshoz path kötelező."};if(Buffer.byteLength(content,"utf8")>384*1024)return{ok:false,code:"EXECUTION_REQUEST_CONTENT_TOO_LARGE",error:"A WRITE_FILE tartalom túl nagy."};
  const expectedContentSha256=text(row.expectedContentSha256,80).toLowerCase(),expectedFileSha256=text(row.expectedFileSha256,80).toLowerCase();if([expectedContentSha256,expectedFileSha256].some(v=>v&&!/^[a-f0-9]{64}$/.test(v)))return{ok:false,code:"EXECUTION_WRITE_HASH_INVALID",error:"Érvénytelen írási SHA-256 előfeltétel."};
  return{ok:true,request:{schemaVersion:1,requestId,taskId,sessionId,workerCode,sourceProofSha256,action,...(expectedContentSha256?{expectedContentSha256}:{}),...(expectedFileSha256?{expectedFileSha256}:{}),...(path?{path}:{}),...(query?{query}:{}),...(action==="WRITE_FILE"?{content}:{}),...(Number.isInteger(Number(row.startLine))?{startLine:Number(row.startLine)}:{}),...(Number.isInteger(Number(row.endLine))?{endLine:Number(row.endLine)}:{}),...(Number.isInteger(Number(row.depth))?{depth:Number(row.depth)}:{}),...(command?{command}:{})}};
}
function buildDeveloperGridExecutionResultPrompt(payload){
  const protocol=require("../workflow/execution-result-protocol.cjs");
  const envelope=payload.resultEnvelope||protocol.makeEnvelope(payload);
  const acknowledgement={schemaVersion:1,taskId:envelope.taskId,sessionId:envelope.sessionId,workerCode:envelope.workerCode,requestId:envelope.requestId,resultId:envelope.resultId,resultSha256:envelope.resultSha256,sourceProofSha256:envelope.sourceProofSha256,decision:"ACCEPTED"};
  const fence=String.fromCharCode(96).repeat(3);
  return ["BENJADMIN_PROMPT_KIND: EXECUTION_RESULT_V1","BENJADMIN_EXECUTION_RESULT_ID: "+envelope.resultId,EXECUTION_RESULT_START,fence+"json",JSON.stringify(envelope,null,2),fence,EXECUTION_RESULT_END,
    "A fenti JSON az adott kérés konkrét, szerveroldali eredménye. A kódot és rawContent mezőt szó szerint kezeld; a backtick, BOM és sorvég is adat.",
    "Először igazold vissza a feldolgozott eredményt az alábbi ACK-blokkal. Az azonosítókat és lenyomatot pontosan másold. Ha nem tudod elfogadni az eredményt, a decision legyen REJECTED, és állj meg.",
    protocol.ACK,fence+"json",JSON.stringify(acknowledgement),fence,protocol.ACK_END,
    "Ha a status PASS, az eredményt feldolgoztad és az eredeti feladat engedi, az ACK után ugyanebben a válaszban add ki pontosan a következő EGY execution requestet új requestId-val; majd várj. A Central Core az ACK elfogadása előtt nem hajtja végre a következőt. Ha status BLOCKED vagy FAIL, ACK után állj meg. A próba végén ACK és rövid magyar eredmény szükséges, új művelet nélkül.",
    "READ_FILE: fileSha256 a teljes tényleges fájl szerveroldali SHA-256 értéke; fileBytes a bájtméret. A rawContent kizárólag teljes, veszteségmentes UTF-8 olvasásnál az eredeti tartalom; ebből állítsd vissza, a sorszámozott content mezőből ne. Ha egy régebbi eredményből hiányzik a fileSha256 vagy rawContent, írás előtt kérj új READ_FILE-t új requestId-val. A kapott teljes fájl és hash eltérésénél állj meg.",
    "A következő execution request teljes marker+JSON+END blokkját egyetlen text kódblokkban add. WRITE_FILE esetén a kommentpróbában add meg az expectedContentSha256 mezőben az eredeti feladat szerinti kívánt lenyomatot, az expectedFileSha256 mezőben a most visszaolvasott fájl lenyomatát. A szerver eltérésnél írás előtt megáll.",
    "Scope és korábbi tiltások változatlanok. PROD/deploy/restart/migration továbbra is tiltott."
  ].join("\n");
}
function selectTaskExecutionRequest(messages,task,workerCode) {
  const worker=String(workerCode||"").toUpperCase().replace(/^BENAI$/,"BENJAMINAI");
  let launch=-1;
  const boundary=/BENJADMIN_PROMPT_KIND: (TASK_LAUNCH_V3|EXECUTION_PREFLIGHT_V1|EXECUTION_AUTHORITY_RECOVERED_V1|MANUAL_CONTINUE_V1|DEVELOPER_GRID_STAGE_ACTION_V1|CONVERSATION_ROLLOVER_READY_V1)\b/;
  for(let i=0;i<messages.length;i++)if(messages[i].role==="USER"&&boundary.test(String(messages[i].text||""))&&String(messages[i].text).includes(task.id)&&String(messages[i].text).includes(task.sessionId))launch=i;
  for(let i=messages.length-1;i>launch;i--){
    const item=messages[i],body=String(item.text||"");
    if(item.role!=="ASSISTANT"||!body.includes(EXECUTION_REQUEST_START))continue;
    const parsed=parseDeveloperGridExecutionRequest(body);
    if(parsed.ok){const r=parsed.request;if(r.taskId===task.id&&r.sessionId===task.sessionId&&r.workerCode===worker)return item;}
    else if(launch>=0&&i>launch&&body.includes(task.id)&&body.includes(task.sessionId))return item;
  }
  return null;
}

function recoverAcknowledgedNextRequest(messages,task,workerCode,record,proof) {
  if(record?.pendingExecutionResult||record?.executionRequest||record?.queuedExecutionRequest||record?.executionWorkflowBlocked)return null;
  const completed=(record?.executionHistory||[]).at(-1),worker=String(workerCode).toUpperCase().replace(/^BENAI$/,'BENJAMINAI');
  if(!completed?.completedAt||completed.resultStatus!=='PASS'||completed.workflowContinue!==true)return null;
  const protocol=require('../workflow/execution-result-protocol.cjs');
  for(let i=messages.length-1;i>=0;i--){
    const item=messages[i],body=String(item.text||'');
    if(item.role==='USER'&&/BENJADMIN_PROMPT_KIND: (TASK_LAUNCH_V3|EXECUTION_PREFLIGHT_V1|EXECUTION_AUTHORITY_RECOVERED_V1|MANUAL_CONTINUE_V1|CONVERSATION_ROLLOVER_READY_V1)\b/.test(body)&&body.includes(task.id)&&body.includes(task.sessionId))return null;
    if(item.role!=='ASSISTANT')continue;
    const ack=protocol.parseAck(body);
    if(!ack||ack.taskId!==task.id||ack.sessionId!==task.sessionId||ack.workerCode!==worker||ack.requestId!==completed.requestId||ack.resultId!==completed.resultId||ack.resultSha256!==completed.resultSha256||ack.sourceProofSha256!==proof||ack.decision!=='ACCEPTED')continue;
    const next=parseDeveloperGridExecutionRequest(body);
    if(!next.ok)return null;
    const q=next.request;
    if(q.taskId!==task.id||q.sessionId!==task.sessionId||q.workerCode!==worker||q.sourceProofSha256!==proof||q.requestId===ack.requestId||(record.executionHistory||[]).some(h=>h.requestId===q.requestId)||require('../workflow/control.cjs').wasAbandonedRead(record,q))return null;
    return q;
  }
  return null;
}
module.exports={EXECUTION_REQUEST_START,EXECUTION_REQUEST_END,EXECUTION_RESULT_START,EXECUTION_RESULT_END,parseDeveloperGridExecutionRequest,buildDeveloperGridExecutionResultPrompt,selectTaskExecutionRequest,recoverAcknowledgedNextRequest};
