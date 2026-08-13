import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync=promisify(execFile);
const REPOSITORY_PATH="/srv/dimpro-dev/repositories/dimprover.git";
const WORKTREE_ROOT="/srv/dimpro-dev/worktrees";

type WorkerCode="MFORGE"|"VGUARD";

export class ExternalWorkspaceError extends Error {
  code:string;
  status:number;
  details?:unknown;
  constructor(message:string,code:string,status=409,details?:unknown){super(message);this.code=code;this.status=status;this.details=details}
}

async function exists(target:string){try{await stat(target);return true}catch{return false}}
async function git(args:string[]){
 try{return (await execFileAsync("/usr/bin/git",args,{encoding:"utf8",timeout:15000,maxBuffer:2*1024*1024})).stdout.trim()}
 catch(error){const e=error as {stderr?:string;message?:string};throw new ExternalWorkspaceError("A DEV Git workspace művelet sikertelen.","AI_WORKER_GIT_WORKSPACE_ERROR",409,{detail:(e.stderr||e.message||"").slice(0,600)})}
}

export function validateExternalWorkspacePlan(input:{workerCode:string;branchName:string;worktreePath:string;baselineCommit:string}){
 const workerCode=input.workerCode.toUpperCase() as WorkerCode;
 if(workerCode!=="MFORGE"&&workerCode!=="VGUARD")throw new ExternalWorkspaceError("Ismeretlen külső AI worker.","AI_WORKER_WORKSPACE_WORKER_INVALID",400);
 const prefix=`worker/${workerCode.toLowerCase()}/`;
 if(!input.branchName.startsWith(prefix)||!/^worker\/(mforge|vguard)\/[a-z0-9-]+$/.test(input.branchName))throw new ExternalWorkspaceError("A worker branch neve nem felel meg a BENJADMIN policynek.","AI_WORKER_WORKSPACE_BRANCH_INVALID",400,{branchName:input.branchName});
 const expected=path.join(WORKTREE_ROOT,input.branchName.replaceAll("/","-"));
 const target=path.resolve(input.worktreePath);
 if(target!==expected)throw new ExternalWorkspaceError("A worktree útvonal nem a BENJADMIN által számított DEV útvonal.","AI_WORKER_WORKSPACE_PATH_INVALID",400,{target,expected});
 if(!/^[0-9a-f]{40}$/i.test(input.baselineCommit))throw new ExternalWorkspaceError("Érvénytelen trusted baseline commit.","AI_WORKER_BASELINE_COMMIT_INVALID",400);
 return{workerCode,branchName:input.branchName,worktreePath:target,baselineCommit:input.baselineCommit,repositoryPath:REPOSITORY_PATH};
}

export async function prepareExternalWorkspace(input:{workerCode:string;branchName:string;worktreePath:string;baselineCommit:string}){
 const plan=validateExternalWorkspacePlan(input);
 const liveBaseline=await git(["--git-dir",REPOSITORY_PATH,"rev-parse","--verify",plan.baselineCommit]);
 if(liveBaseline!==plan.baselineCommit)throw new ExternalWorkspaceError("A trusted baseline commit nem érhető el a DEV repositoryban.","AI_WORKER_BASELINE_COMMIT_NOT_FOUND",409);
 let branchExists=false;try{await execFileAsync("/usr/bin/git",["--git-dir",REPOSITORY_PATH,"show-ref","--verify","--quiet",`refs/heads/${plan.branchName}`],{timeout:5000});branchExists=true}catch{}
 if(branchExists)throw new ExternalWorkspaceError("A tervezett worker branch már létezik.","AI_WORKER_WORKSPACE_BRANCH_EXISTS",409,{branchName:plan.branchName});
 if(await exists(plan.worktreePath))throw new ExternalWorkspaceError("A tervezett worker worktree útvonal már létezik.","AI_WORKER_WORKSPACE_PATH_EXISTS",409,{worktreePath:plan.worktreePath});
 await git(["--git-dir",REPOSITORY_PATH,"worktree","add","-b",plan.branchName,plan.worktreePath,plan.baselineCommit]);
 const [branch,commit]=await Promise.all([
  git(["-C",plan.worktreePath,"branch","--show-current"]),
  git(["-C",plan.worktreePath,"rev-parse","HEAD"]),
 ]);
 if(branch!==plan.branchName||commit!==plan.baselineCommit){
  await removeExternalWorkspace(plan).catch(()=>undefined);
  throw new ExternalWorkspaceError("A létrehozott worker worktree verifikációja sikertelen.","AI_WORKER_WORKSPACE_VERIFY_FAILED",409,{branch,commit});
 }
 return{ok:true as const,...plan,branch,commit};
}

export async function removeExternalWorkspace(input:{workerCode:string;branchName:string;worktreePath:string;baselineCommit:string}){
 const plan=validateExternalWorkspacePlan(input);
 if(await exists(plan.worktreePath))await git(["--git-dir",REPOSITORY_PATH,"worktree","remove","--force",plan.worktreePath]);
 try{await execFileAsync("/usr/bin/git",["--git-dir",REPOSITORY_PATH,"show-ref","--verify","--quiet",`refs/heads/${plan.branchName}`],{timeout:5000});await git(["--git-dir",REPOSITORY_PATH,"branch","-D",plan.branchName])}catch{}
 await git(["--git-dir",REPOSITORY_PATH,"worktree","prune"]);
 return{ok:true as const,branchName:plan.branchName,worktreePath:plan.worktreePath};
}
