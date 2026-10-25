"server-only";
import {createHash} from "node:crypto";
import type {SourceExecutionProof} from "./types";
import catalog from "@/config/developer-grid-module-sources.json";
import {classifyScopePath} from "@/app/lib/dev-center/ai-worker/scope-policy";
export type ReviewedWriteApproval={authority:"MANUAL_REPLACEMENT_PLAN";taskId:string;sessionId:string;workerCode:string;head:string;proofSha256:string;planSha256:string;paths:string[]};
export function normalizeReviewedWritePaths(raw:unknown,projectId:string,moduleName:string):string[]{
 const paths=Array.isArray(raw)?raw:[];
 if(paths.length>32)throw Object.assign(new Error("Legfeljebb 32 fájl hagyható jóvá."),{code:"WRITE_REVIEW_PATH_LIMIT",status:400});
 const key=(v:string)=>v.normalize("NFKC").trim().toLocaleLowerCase("hu-HU");
 const source=catalog.sources.find(s=>s.projectId===projectId&&s.modules.some(n=>key(n)===key(moduleName)));
 return [...new Set(paths.map(value=>{
  const rel=String(value||"").trim();
  if(!rel||rel.includes("\\")||rel.startsWith("/")||rel.split("/").some(p=>!p||[".","..",".git","node_modules",".next"].includes(p))||!source?.readRoots.some(root=>rel.startsWith(root+"/"))||classifyScopePath(rel).decision==="DENIED")
   throw Object.assign(new Error(`Nem jóváhagyható modulútvonal: ${rel}`),{code:"WRITE_REVIEW_PATH_DENIED",status:403});
  return rel;
 }))].sort();
}
export function boundReviewedWritePaths(raw:ReviewedWriteApproval|null|undefined,identity:{taskId:string;sessionId:string;workerCode:string;head:string;proofSha256:string}):string[]{
 if(!raw||raw.authority!=="MANUAL_REPLACEMENT_PLAN"||!/^[0-9a-f]{64}$/.test(raw.planSha256))return [];
 if(raw.taskId!==identity.taskId||raw.sessionId!==identity.sessionId||raw.workerCode!==identity.workerCode||raw.head!==identity.head||raw.proofSha256!==identity.proofSha256)return [];
 return Array.isArray(raw.paths)?raw.paths:[];
}

// Only a Central Core recovery of the identical source identity can renew this grant.
export function renewReviewedWriteApproval(raw:ReviewedWriteApproval|null|undefined,owner:{taskId:string;sessionId:string;workerCode:string},previous:SourceExecutionProof|null|undefined,fresh:SourceExecutionProof):ReviewedWriteApproval|null {
 if(!previous)return null;
 for(const proof of [previous,fresh]){
  const {sha256,...body}=proof;
  if(!/^[0-9a-f]{64}$/.test(sha256)||createHash("sha256").update(JSON.stringify(body)).digest("hex")!==sha256
    ||proof.state!=="VERIFIED"||proof.authority!=="CENTRAL_CORE"||proof.handshakeStage!=="READY"||proof.productionAccess!=="DENY"
    ||proof.activeScopeLockCount<1||proof.activeWorktreeLeaseCount<1)return null;
 }
 if(previous.repository!==fresh.repository||previous.worktree!==fresh.worktree||previous.branch!==fresh.branch||previous.head!==fresh.head)return null;
 const paths=boundReviewedWritePaths(raw,{...owner,head:previous.head,proofSha256:previous.sha256});
 if(!paths.length)return null;
 return {...raw!,paths:[...paths],proofSha256:fresh.sha256};
}
