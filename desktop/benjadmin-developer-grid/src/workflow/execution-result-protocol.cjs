"use strict";
const {createHash}=require("node:crypto");
const START="BENJADMIN_EXECUTION_RESULT_V1",END="BENJADMIN_EXECUTION_RESULT_END";
const ACK="BENJADMIN_EXECUTION_RESULT_ACK_V1",ACK_END="BENJADMIN_EXECUTION_RESULT_ACK_END";
const worker=value=>String(value||"").toUpperCase()==="BENAI"?"BENJAMINAI":String(value||"").toUpperCase();
function canonical(value){if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";return "{"+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";}
const digest=value=>createHash("sha256").update(canonical(value)).digest("hex");
function bodyFor(payload,identity={}){
  const e=payload.execution||{};
  return {schemaVersion:2,taskId:String(payload.taskId||identity.taskId||""),sessionId:String(payload.sessionId||identity.sessionId||""),workerCode:worker(payload.workerCode||identity.workerCode),requestId:String(payload.requestId||identity.requestId||""),sourceProofSha256:String(payload.sourceProofSha256||identity.sourceProofSha256||""),action:String(payload.action||identity.action||"").toUpperCase(),status:String(e.status||"FAIL").toUpperCase(),code:String(e.code||""),summary:String(e.summary||""),data:e.data&&typeof e.data==="object"&&!Array.isArray(e.data)?e.data:{},productionAccess:"DENY"};
}
function makeEnvelope(payload,identity={}){const body=bodyFor(payload,identity),resultSha256=digest(body);return {...body,resultId:"res-"+resultSha256,resultSha256};}
function verifyEnvelope(row){if(!row||row.schemaVersion!==2||!row.taskId||!row.sessionId||!row.requestId||!row.workerCode||!/^[a-f0-9]{64}$/.test(row.sourceProofSha256||"")||row.productionAccess!=="DENY")return false;const {resultId,resultSha256,...body}=row;return resultSha256===digest(body)&&resultId==="res-"+resultSha256;}
// Parse the whole fenced result; never equate a marker or ID with delivery.
function parseBlock(text,start,end){
  const source=String(text||""),lines=source.split(/\r?\n/),starts=lines.flatMap((line,i)=>line.trim()===start?[i]:[]),ends=lines.flatMap((line,i)=>line.trim()===end?[i]:[]);
  if(starts.length!==1||ends.length!==1||ends[0]<=starts[0])return null;
  let block=lines.slice(starts[0]+1,ends[0]).join("\n").trim();
  block=block.replace(/^```json\s*/i,"").replace(/\s*```$/,"").trim();
  block=block.replace(/^(?:json\s*)?(?:(?:Copy code|Kód másolása|Másolás)\s*)?(?=\{)/i,"");
  try{const row=JSON.parse(block);return row&&typeof row==="object"&&!Array.isArray(row)?row:null;}catch{return null;}
}
const parseResult=text=>parseBlock(text,START,END);
const parseAck=text=>parseBlock(text,ACK,ACK_END);
function ackMatches(ack,envelope){return Boolean(ack&&ack.schemaVersion===1&&["ACCEPTED","REJECTED"].includes(ack.decision)&&["taskId","sessionId","requestId","resultId","resultSha256","sourceProofSha256"].every(k=>ack[k]===envelope[k])&&worker(ack.workerCode)===envelope.workerCode);}
module.exports={START,END,ACK,ACK_END,worker,canonical,digest,bodyFor,makeEnvelope,verifyEnvelope,parseResult,parseAck,ackMatches};
