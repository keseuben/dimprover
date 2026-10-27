"server-only";
import {createHash} from "node:crypto";
export type SourceCheckpointPolicy={schemaVersion:1;authority:"TASK_START_APPROVAL";mode:"SCOPED_GIT";taskId:string;sessionId:string;workerCode:string;initialHead:string;sourcePromptSha256:string;paths:string[];sha256:string};
export type SourceCheckpointReceipt={schemaVersion:1;id:string;previousHead:string;head:string;reportSha256:string;previousProofSha256:string;proofSha256:string;files:{path:string;sha256:string;bytes:number}[];gitClean:true;completedAt:string};
export const checkpointHash=(value:unknown):string=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function makeSourceCheckpointPolicy(input:Omit<SourceCheckpointPolicy,"sha256"|"schemaVersion"|"authority"|"mode">):SourceCheckpointPolicy{
 const body={schemaVersion:1 as const,authority:"TASK_START_APPROVAL" as const,mode:"SCOPED_GIT" as const,...input};return {...body,sha256:checkpointHash(body)};
}
export function validSourceCheckpointPolicy(policy:SourceCheckpointPolicy,owner:{taskId:string;sessionId:string;workerCode:string;sourcePrompt:string;paths:string[]}){
 if(!policy)return false;const {sha256,...body}=policy;
 return /^[a-f0-9]{64}$/.test(sha256)&&checkpointHash(body)===sha256&&policy.schemaVersion===1&&policy.authority==="TASK_START_APPROVAL"&&policy.mode==="SCOPED_GIT"
 &&policy.taskId===owner.taskId&&policy.sessionId===owner.sessionId&&policy.workerCode===owner.workerCode&&/^[a-f0-9]{40}$/.test(policy.initialHead)
 &&policy.sourcePromptSha256===checkpointHash(owner.sourcePrompt)&&policy.paths.length>0&&JSON.stringify(policy.paths)===JSON.stringify(owner.paths);
}
