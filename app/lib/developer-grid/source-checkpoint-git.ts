"server-only";
import {createHash,randomUUID} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdir,readFile,writeFile,rename,open,lstat,realpath} from "node:fs/promises";
import path from "node:path";

const run=promisify(execFile),sha=(b:string|Buffer)=>createHash("sha256").update(b).digest("hex");
function fail(code:string,message:string):never{throw Object.assign(new Error(message),{code,status:409});}
export type CheckpointIdentity={taskId:string;sessionId:string;workerCode:string;repository:string;worktree:string;branch:string;head:string;reportSha256:string;approvalSha256:string;paths:string[]};
type FileState={path:string;sha256:string;bytes:number;mode:string;blob?:string};
type Intent={schemaVersion:1;id:string;identity:CheckpointIdentity;files:FileState[];originalIndexSha256:string;preparedIndexSha256?:string;tree?:string;commit?:string;phase:string;createdAt:string};
type Options={gitBin?:string;journalRoot?:string;validateContent?:(file:string,bytes:Buffer)=>void;beforeCommit?:()=>Promise<void>;afterPhase?:(phase:string)=>void|Promise<void>};

// No worktree file is rewritten. Git objects and a private index are prepared
// first; update-ref is compare-and-swap. The original index is retained, and a
// durable intent lets a retry finish the same commit after any interrupted step.
export async function createScopedSourceCheckpoint(identity:CheckpointIdentity,options:Options={}){
 for(const id of [identity.taskId,identity.sessionId,identity.workerCode])if(!/^[A-Za-z0-9._-]{1,240}$/.test(id))fail("CHECKPOINT_IDENTITY_INVALID","Érvénytelen Git-mentési azonosság.");
 if(!/^[a-f0-9]{40}$/.test(identity.head)||[identity.reportSha256,identity.approvalSha256].some(h=>!/^[a-f0-9]{64}$/.test(h)))fail("CHECKPOINT_IDENTITY_INVALID","Hiányos Git-mentési lenyomat.");
 if(!identity.paths.length||identity.paths.length>32||new Set(identity.paths).size!==identity.paths.length)fail("CHECKPOINT_PATHS_INVALID","Pontos, egyedi fájlkör szükséges a Git-mentéshez.");
 for(const p of identity.paths)if(p.length>512||/[\x00-\x1f:]/.test(p)||p.startsWith("/")||p.includes("\\")||p.split("/").some(x=>!x||[".","..",".git","node_modules",".next"].includes(x)))fail("CHECKPOINT_PATH_DENIED","Érvénytelen Git-mentési fájlkör.");
 const gitBin=options.gitBin||"/usr/bin/git";
 const env={...process.env,GIT_LITERAL_PATHSPECS:"1",GIT_OPTIONAL_LOCKS:"0",GIT_TERMINAL_PROMPT:"0",GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:process.platform==="win32"?"NUL":"/dev/null"};
 const git=async(args:string[],extra:Record<string,string>={})=>(await run(gitBin,["-C",identity.worktree,...args],{env:{...env,...extra},encoding:"utf8",maxBuffer:4*1024*1024,timeout:20000})).stdout;
 const gitInput=async(args:string[],input:Buffer|string,extra:Record<string,string>={})=>{
  return await new Promise<string>((resolve,reject)=>{const child=execFile(gitBin,["-C",identity.worktree,...args],{env:{...env,...extra},encoding:"utf8",maxBuffer:4*1024*1024,timeout:20000},(error,stdout)=>error?reject(error):resolve(stdout));child.stdin!.end(input);});
 };
 const top=(await git(["rev-parse","--show-toplevel"])).trim(),common=(await git(["rev-parse","--git-common-dir"])).trim();
 if(await realpath(top)!==await realpath(identity.worktree)||await realpath(path.resolve(identity.worktree,common))!==await realpath(identity.repository)||(await git(["branch","--show-current"])).trim()!==identity.branch)fail("CHECKPOINT_SOURCE_MISMATCH","A Git-mentés repository/worktree/branch kötése eltér.");
 const indexPath=path.resolve(identity.worktree,(await git(["rev-parse","--git-path","index"])).trim());
 if(!(indexPath.startsWith((await realpath(identity.repository))+path.sep))|| (await lstat(indexPath)).isSymbolicLink())fail("CHECKPOINT_INDEX_DENIED","A Git-index nem a kijelölt repositoryhoz tartozik.");
 const root=options.journalRoot||path.join(process.env.BENJADMIN_DEVELOPER_GRID_EXECUTION_ROOT?.trim()||"/srv/dimpro-dev/coordination/developer-grid/execution","source-checkpoints");
 await mkdir(root,{recursive:true,mode:0o700});
 const id=sha(JSON.stringify(identity)),intentFile=path.join(root,id+".json"),prepared=path.join(root,id+".prepared-index"),backup=path.join(root,id+".original-index"),indexLock=indexPath+".lock";
 let intent:Intent|null=null;
 try{intent=JSON.parse(await readFile(intentFile,"utf8"));}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")fail("CHECKPOINT_JOURNAL_INVALID","A Git-mentési napló nem olvasható.");}
 if(intent&&(intent.id!==id||JSON.stringify(intent.identity)!==JSON.stringify(identity)))fail("CHECKPOINT_JOURNAL_MISMATCH","A Git-mentési napló azonossága eltér.");
 const save=async(phase:string)=>{intent!.phase=phase;const tmp=intentFile+"."+randomUUID()+".tmp";const fd=await open(tmp,"wx",0o600);try{await fd.writeFile(JSON.stringify(intent));await fd.sync();}finally{await fd.close();}await rename(tmp,intentFile);await options.afterPhase?.(phase);};
 const fileState=async(p:string):Promise<FileState>=>{
  const absolute=path.join(identity.worktree,p),stat=await lstat(absolute);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>384*1024||await realpath(absolute)!==absolute)fail("CHECKPOINT_FILE_DENIED","Csak kis méretű, valódi task-forrásfájl menthető Gitbe.");
  const bytes=await readFile(absolute);if(bytes.includes(0)||!Buffer.from(bytes.toString("utf8"),"utf8").equals(bytes))fail("CHECKPOINT_ENCODING_DENIED","A Git-mentéshez veszteségmentes UTF-8 fájl szükséges.");
  options.validateContent?.(p,bytes);
  const tracked=(await git(["ls-files","--stage","--",p])).trim();
  const mode=tracked?tracked.split(/\s+/)[0]:"100644";
  if(!["100644","100755"].includes(mode))fail("CHECKPOINT_FILE_MODE_DENIED","Nem támogatott Git-fájltípus.");
  return {path:p,sha256:sha(bytes),bytes:bytes.length,mode};
 };
 const verifyFiles=async()=>{for(const f of intent!.files){const now=await fileState(f.path);if(now.sha256!==f.sha256||now.mode!==f.mode)fail("CHECKPOINT_CONTENT_CHANGED","A forrás a Git-mentési terv óta megváltozott.");}};
 const actualHead=async()=>(await git(["rev-parse","HEAD"])).trim();
 if(!intent){
  if(await actualHead()!==identity.head)fail("CHECKPOINT_HEAD_CHANGED","A Git HEAD megváltozott; friss forrásigazolás szükséges.");
  if((await git(["diff","--cached","--name-only","HEAD"])).trim())fail("CHECKPOINT_INDEX_DIRTY","Előre staged változás mellett központi Git-mentés nem indul.");
  const status=(await git(["status","--porcelain=v1","-z","--untracked-files=all"])).split("\0").filter(Boolean);
  if(!status.length)return {changed:false as const,head:identity.head,gitClean:true as const};
  const files:FileState[]=[];
  for(const row of status){if(![" M","??"].includes(row.slice(0,2)))fail("CHECKPOINT_CHANGE_KIND_DENIED","Törlés, átnevezés vagy staged változás külön kezelést igényel.");const p=row.slice(3);if(!identity.paths.includes(p))fail("CHECKPOINT_SCOPE_DENIED","A munkakönyvtárban a jóváhagyott fájlkörön kívüli változás van.");files.push(await fileState(p));}
  files.sort((a,b)=>a.path.localeCompare(b.path));
  const index=await readFile(indexPath);try{await writeFile(backup,index,{flag:"wx",mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST"||!(await readFile(backup)).equals(index))throw e;}
  intent={schemaVersion:1,id,identity,files,originalIndexSha256:sha(index),phase:"PREPARED",createdAt:new Date().toISOString()};await save("PREPARED");
 }
 await verifyFiles();
 const indexEnv={GIT_INDEX_FILE:prepared};
 if(!intent.commit){
  if(await actualHead()!==identity.head)fail("CHECKPOINT_HEAD_CHANGED","A Git HEAD a mentés előtt megváltozott.");
  await git(["read-tree",identity.head],indexEnv);
  for(const f of intent.files){const blob=(await gitInput(["hash-object","-w","--stdin"],await readFile(path.join(identity.worktree,f.path)))).trim();f.blob=blob;await git(["update-index","--add","--cacheinfo",f.mode,blob,f.path],indexEnv);}
  intent.tree=(await git(["write-tree"],indexEnv)).trim();intent.preparedIndexSha256=sha(await readFile(prepared));
  const author={GIT_AUTHOR_NAME:"DIMPRO BENJADMIN",GIT_AUTHOR_EMAIL:"benjadmin@dimpro.local",GIT_COMMITTER_NAME:"DIMPRO BENJADMIN",GIT_COMMITTER_EMAIL:"benjadmin@dimpro.local"};
  intent.commit=(await gitInput(["commit-tree",intent.tree,"-p",identity.head],`BENJADMIN DEV checkpoint ${identity.taskId}\n\nCheckpoint: ${id}\n`,author)).trim();await save("COMMIT_CREATED");
 }
 const head=await actualHead();if(head!==identity.head&&head!==intent.commit)fail("CHECKPOINT_HEAD_CHANGED","Másik Git-commit előrehaladása miatt a mentés megállt.");
 if((await git(["rev-parse",intent.commit+"^1"])).trim()!==identity.head||(await git(["rev-parse",intent.commit+"^{tree}"])).trim()!==intent.tree)fail("CHECKPOINT_COMMIT_MISMATCH","A mentési commit tartalma eltér a naplótól.");
 await git(["-c","core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol","diff","--check",identity.head,intent.commit]);
 // Git may refresh index stat data after completion. Validate its tree and the
 // worktree instead of treating a harmless index refresh as a second commit.
 if(head===intent.commit && !(await git(["diff","--cached","--name-only","HEAD"])).trim() && !(await git(["status","--porcelain=v1","--untracked-files=all"])).trim()){
  if(intent.phase!=="COMPLETED")await save("COMPLETED");
  return {changed:true as const,id,previousHead:identity.head,head:intent.commit,tree:intent.tree!,files:intent.files.map(({path,sha256,bytes})=>({path,sha256,bytes})),gitClean:true as const,reportSha256:identity.reportSha256};
 }
 const preparedBytes=await readFile(prepared);if(sha(preparedBytes)!==intent.preparedIndexSha256)fail("CHECKPOINT_INDEX_MISMATCH","Az előkészített Git-index megváltozott.");
 let indexBytes=await readFile(indexPath),indexMatchesPrepared=sha(indexBytes)===intent.preparedIndexSha256;
 if(!indexMatchesPrepared&&sha(indexBytes)!==intent.originalIndexSha256)fail("CHECKPOINT_INDEX_CHANGED","A Git-indexet másik művelet módosította.");
 if(!indexMatchesPrepared||head===identity.head){
  let fd;
  try{fd=await open(indexLock,"wx",0o600);}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;if(!Buffer.from(await readFile(indexLock)).equals(preparedBytes))fail("CHECKPOINT_INDEX_LOCKED","Másik Git-művelet használja az indexet.");}
  if(fd){try{await fd.writeFile(preparedBytes);await fd.sync();}finally{await fd.close();}}
  try{
  await verifyFiles();
  await options.beforeCommit?.();
  if(head===identity.head){await git(["update-ref","refs/heads/"+identity.branch,intent.commit,identity.head]);await save("REF_UPDATED");}
  await rename(indexLock,indexPath);await save("INDEX_UPDATED");
  }catch(error){
   // Retain an interrupted pre-commit lock as evidence without blocking Git.
   // A post-CAS lock must stay in place for the journalled recovery.
   if(await actualHead()===identity.head){try{if((await readFile(indexLock)).equals(preparedBytes))await rename(indexLock,path.join(root,id+".aborted-index."+randomUUID()));}catch{}}
   throw error;
  }
 }
 if(await actualHead()!==intent.commit)fail("CHECKPOINT_HEAD_CHANGED","A mentési HEAD nem igazolható.");
 await verifyFiles();
 if((await git(["status","--porcelain=v1","--untracked-files=all"])).trim())fail("CHECKPOINT_WORKTREE_NOT_CLEAN","A Git-mentés utáni munkakönyvtár nem tiszta.");
 await git(["diff","--check"]);
 if(intent.phase!=="COMPLETED")await save("COMPLETED");
 return {changed:true as const,id,previousHead:identity.head,head:intent.commit,tree:intent.tree!,files:intent.files.map(({path,sha256,bytes})=>({path,sha256,bytes})),gitClean:true as const,reportSha256:identity.reportSha256};
}
