import assert from "node:assert/strict";
import { dispatchClaimedDigest } from "../../app/lib/drive-notifications/dispatchFlow.ts";
const ticket={id:"d1",projectId:"project",userId:"u1",category:"DOCUMENT_CHANGES",
  eventIds:["event1"],digestFrequency:"DAILY",cursorFrom:0,cursorTo:12,attemptCount:1};
const message={to:"user@example.com",emailHash:"a".repeat(64),subject:"S",text:"T",html:"<p>T</p>",
  xlsx:Buffer.from("example"),eventIds:["event1"]};
function make(decorate={}){
 const calls=[];
 const deps={
   claim:async()=>{calls.push("claim");return {token:"token",ticket};},
   prepare:async()=>{calls.push("prepare");return {status:"READY",message};},
   send:async()=>{calls.push("send");return {messageId:"smtp-accepted"};},
   confirm:async()=>{calls.push("confirm");return true;},
   finish:async(_id,_token,state)=>{calls.push(state);return true;},
   ...decorate,
 };
 return {deps,calls};
}
{
 const d=make({claim:async()=>null});
 assert.equal((await dispatchClaimedDigest("d1",d.deps)).status,"NOT_CLAIMED");
 assert.deepEqual(d.calls,[]);
}
{
 const d=make({prepare:async()=>({status:"SUPPRESSED",reason:"RIGHTS_REVOKED"})});
 assert.equal((await dispatchClaimedDigest("d1",d.deps)).status,"SUPPRESSED");
 assert.ok(!d.calls.includes("send"));
 assert.ok(d.calls.includes("SUPPRESSED"));
}
{
 const d=make({prepare:async()=>{throw Error("db unavailable");}});
 assert.equal((await dispatchClaimedDigest("d1",d.deps)).status,"FAILED_BEFORE_SMTP");
 assert.deepEqual(d.calls,["claim","FAILED"]);
}
{
 const d=make();
 assert.equal((await dispatchClaimedDigest("d1",d.deps)).status,"SMTP_ACCEPTED");
 assert.deepEqual(d.calls,["claim","prepare","send","confirm"]);
}
{
 const d=make({send:async()=>{throw Error("socket lost");}});
 assert.equal((await dispatchClaimedDigest("d1",d.deps)).status,"SMTP_AMBIGUOUS");
 assert.ok(d.calls.includes("AMBIGUOUS"));
 assert.ok(!d.calls.includes("FAILED"));
}
{
 const d=make({send:async()=>({messageId:""})});
 assert.equal((await dispatchClaimedDigest("d1",d.deps)).status,"SMTP_AMBIGUOUS");
 assert.ok(d.calls.includes("AMBIGUOUS"));
}
{
 const d=make({confirm:async()=>false});
 assert.equal((await dispatchClaimedDigest("d1",d.deps)).status,"SMTP_AMBIGUOUS");
 assert.ok(d.calls.includes("AMBIGUOUS"));
}
{
 const d=make({confirm:async()=>{throw Error("ack lost");}});
 assert.equal((await dispatchClaimedDigest("d1",d.deps)).status,"SMTP_AMBIGUOUS");
 assert.ok(d.calls.includes("AMBIGUOUS"));
}
console.log("DRIVE NOTIFICATION DISPATCH CONTRACT 8/8 PASS");
