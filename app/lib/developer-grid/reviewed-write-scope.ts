"server-only";
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
