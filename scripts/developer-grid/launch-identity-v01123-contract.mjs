import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
process.chdir(fileURLToPath(new URL("../../",import.meta.url)));
const require=createRequire(import.meta.url);
const {parseTaskLaunchDraftIdentity:parse,shouldReplaceStaleTaskLaunchDraft:replace}=require("../../desktop/benjadmin-developer-grid/src/task-launch/draft-recovery.cjs");
const {buildWorkerTaskPrompt:build}=require("../../desktop/benjadmin-developer-grid/src/task-launch/prompt-builder.cjs");
const taskId="dev-task-grid-"+ "a".repeat(20),sessionId="grid-work-"+taskId+"-outminai",proof="b".repeat(64);
const anchor="Az első válaszod pontosan tartalmazza ezt a blokkot:\n";
const ack=(task=taskId,session=sessionId,hash=proof)=>[anchor.trim(),"BOOT ACKNOWLEDGEMENT","Worker: OUTMINAI","Task: "+task,"Session: "+session,"Project/Module: project_dimprover / DIMPRO Drive","Branch: worker/outminai/task","Worktree: /srv/dimpro-dev/worktrees/task","Base HEAD: "+"c".repeat(40),"Source proof: "+hash,"Read/Write scope: module:DIMPRO Drive",""].join("\n");
const history=["TASK ID: old-task","SESSION ID: old-session","Task: DIMPRO Drive V0.9.67 – egy korábbi átadó címe","Source proof: "+"d".repeat(64),"Proof SHA-256: "+"d".repeat(64),""].join("\n");
const packet=(context="",tail=ack())=>["BENJADMIN_PROMPT_KIND: TASK_LAUNCH_V3","OutminAI, új BENJADMIN fejlesztési feladat érkezett.",context,"SESSION ID: "+sessionId,"Proof SHA-256: "+proof,tail].join("\n");
let tests=0;function check(label,fn){fn();console.log("PASS",++tests,label);}
check("historical Task title cannot replace the actual launch task ID",()=>{const x=parse(packet(history));assert.equal(x.taskId,taskId);assert.equal(x.sessionId,sessionId);assert.equal(x.sourceProofSha256,proof);assert.equal(x.identityState,"ACK_TEMPLATE");});
check("historical task/session/proof fields cannot authorize replacement of the current packet",()=>{const x=replace({draft:packet(history),taskId,sessionId,currentSourceProofSha256:proof});assert.equal(x.replace,false);assert.equal(x.reason,"current-proof");});
check("own stale ACK proof can be refreshed without using historical proof text",()=>{const x=replace({draft:packet(history,ack(taskId,sessionId,"e".repeat(64))),taskId,sessionId,currentSourceProofSha256:proof});assert.equal(x.replace,true);assert.equal(x.reason,"stale-source-proof");assert.equal(x.previousSourceProofSha256,"e".repeat(64));});
check("conflicting generated templates fail closed",()=>{const x=parse(packet("",ack()+ack("foreign-task","foreign-session")));assert.equal(x.taskId,"");assert.equal(x.identityState,"AMBIGUOUS_OR_INCOMPLETE_ACK_TEMPLATE");assert.equal(replace({draft:x.text,taskId,sessionId,currentSourceProofSha256:proof}).replace,false);});
check("malformed or human-title ACK fields fail closed",()=>{for(const tail of [ack("Task title with spaces"),ack().replace("Source proof: "+proof,"Source proof: missing"),ack().replace("Session: "+sessionId,"Session: ")] )assert.equal(parse(packet(history,tail)).taskId,"");});
check("an unframed historical BOOT block cannot override a generated current ACK template",()=>{const old=ack("old-task","old-session","d".repeat(64)).replace(anchor,"");assert.equal(parse(packet(old)).taskId,taskId);});
check("legacy minimal packets and human drafts retain their previous behavior",()=>{const x=parse(["BENJADMIN_PROMPT_KIND: TASK_LAUNCH_V3","Task: t1","Session: s1","Source proof: "+proof].join("\n"));assert.equal(x.taskId,"t1");assert.equal(parse("My unsent human message").kind,"OTHER");});
check("the actual prompt builder round-trips with contaminated historical continuation context",()=>{
 const task={id:taskId,title:"Új Drive próba",description:"Változatlan forrású DEV-próba",status:"READY",chatLaunchMode:"EXISTING_CHAT",projectId:"project_dimprover",scopeText:"module:DIMPRO Drive",branchName:"worker/outminai/"+taskId,worktreePath:"/srv/dimpro-dev/worktrees/task",sourceHead:"c".repeat(40),sessionId,sourceState:"VERIFIED",sourceExecutionProof:{state:"VERIFIED",authority:"CENTRAL_CORE",sha256:proof,handshakeStage:"READY",activeScopeLockCount:1,activeWorktreeLeaseCount:1,productionAccess:"DENY"},continuityPreviousTaskId:"old-task",continuityContextSummary:history};
 task.acceptanceText="DEV ONLY · PROD DENY";
 const x=parse(build({task,workerCode:"OUTMINAI",workerLabel:"OutminAI",presence:{mainModule:"BENJADMIN",moduleName:"DIMPRO Drive"}}));
 assert.equal(x.taskId,taskId);assert.equal(x.sessionId,sessionId);assert.equal(x.sourceProofSha256,proof);
});
console.log(JSON.stringify({ok:true,tests,scope:"authoritative launch identity with historical handoff contamination",liveMutation:false}));
