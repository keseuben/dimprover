import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),ts=require('typescript'),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const protocol=require(path.join(root,'desktop/benjadmin-developer-grid/src/workflow/execution-result-protocol.cjs'));
const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'grid-receipt-110-')),virtual='/srv/dimpro-dev/worktrees/test-grid110',audit=path.join(tmp,'audit');
const map=p=>String(p).startsWith(virtual)?path.join(tmp,'worktree',String(p).slice(virtual.length)):p;
const mapped={...fsp};for(const name of ['readFile','writeFile','appendFile','mkdir','stat','lstat','chmod'])mapped[name]=(...args)=>fsp[name](map(args[0]),...args.slice(1));mapped.rename=(a,b)=>fsp.rename(map(a),map(b));mapped.realpath=async p=>{await fsp.realpath(map(p));return p;};
const session={id:'session-a',taskId:'task-a',workerCode:'OUTMINAI',endedAt:null,developmentContext:{surfaceConversationId:'chat-a'}};
const state={sessions:[session]},task={id:'task-a',environment:'DEV',productionAccess:'DENY'};
const compiled=ts.transpileModule(fs.readFileSync(path.join(root,'app/lib/developer-grid/execution-bridge.ts'),'utf8')+'\nexport const test={readFileAction,writeFileAction,resultEnvelope,appendAudit,auditRows,assertPriorExecutionSettled};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const stubs={'node:fs/promises':mapped,'./state-store':{readGridState:async()=>state},'./work-start':{getDeveloperGridTaskById:async id=>id===task.id?task:null},'./task-operation-lock':{withDeveloperGridTaskOperation:async(_id,fn)=>fn()},'./module-source':{},'./reviewed-write-scope':{},'@/config/developer-grid-module-sources.json':{sources:[]},'@/app/lib/dev-center/engine-repository':{},'@/app/lib/dev-center/ai-worker/scope-analyzer':{},'@/app/lib/dev-center/ai-worker/scope-policy':{classifyScopePath:()=>({decision:'AUTO_APPROVED',riskLevel:'GREEN'})},'node:child_process':{execFile:(_file,_args,_opts,done)=>done(null,'','')}};
const context={exports:{},require:id=>Object.hasOwn(stubs,id)?stubs[id]:require(id),Buffer,console,process:{env:{BENJADMIN_DEVELOPER_GRID_EXECUTION_ROOT:audit}}};vm.createContext(context);vm.runInContext(compiled,context);
const server=context.exports,test=server.test,hash=b=>createHash('sha256').update(b).digest('hex');
let count=0;async function check(name,fn){await fn();console.log('PASS',++count,name);}
const rel='components/drive/driveBuildInfo.ts',scope={readablePaths:[rel],writablePaths:[rel],reviewedWritePaths:[],candidates:[]};
await fsp.mkdir(path.dirname(map(virtual+'/'+rel)),{recursive:true});
const original=Buffer.from('\ufeffexport const label = `V${version}`;\r\n// árvíztűrő\r\n');
await fsp.writeFile(map(virtual+'/'+rel),original);
await check('READ_FILE hashes actual disk bytes and exposes lossless complete BOM/CRLF content',async()=>{
  const r=await test.readFileAction(virtual,scope,{path:rel});assert.equal(r.data.fileSha256,hash(original));assert.equal(r.data.fileBytes,original.length);assert.equal(r.data.hasUtf8Bom,true);assert.equal(r.data.completeFile,true);assert(Buffer.from(r.data.rawContent).equals(original));
  const partial=await test.readFileAction(virtual,scope,{path:rel,startLine:2,endLine:2});assert.equal(partial.data.fileSha256,hash(original));assert.equal(partial.data.completeFile,false);assert.equal(partial.data.rawContent,undefined);
});
await check('actual atomic write/read/restore returns server byte hashes and exact original bytes',async()=>{
  const changed=Buffer.concat([original,Buffer.from('// temporary\n')]);
  const w=await test.writeFileAction(virtual,scope,{path:rel,content:changed.toString('utf8')});assert.equal(w.data.fileSha256,hash(changed));assert.equal(w.data.fileBytes,changed.length);
  const r=await test.readFileAction(virtual,scope,{path:rel});assert.equal(r.data.fileSha256,hash(changed));
  const restore=await test.writeFileAction(virtual,scope,{path:rel,content:original.toString('utf8')});assert.equal(restore.data.fileSha256,hash(original));assert((await fsp.readFile(map(virtual+'/'+rel))).equals(original));
});
await check('wrong content hash and stale file preconditions block before any disk write',async()=>{
  const before=await fsp.readFile(map(virtual+'/'+rel));
  await assert.rejects(()=>test.writeFileAction(virtual,scope,{path:rel,content:'broken',expectedContentSha256:hash(original)}),e=>e.code==='EXECUTION_WRITE_CONTENT_HASH_MISMATCH');
  await assert.rejects(()=>test.writeFileAction(virtual,scope,{path:rel,content:'changed',expectedFileSha256:'b'.repeat(64)}),e=>e.code==='EXECUTION_WRITE_PRECONDITION_FAILED');
  assert((await fsp.readFile(map(virtual+'/'+rel))).equals(before));
});
const identity={taskId:'task-a',sessionId:'session-a',workerCode:'OUTMINAI',requestId:'req-110',sourceProofSha256:'a'.repeat(64),action:'READ_FILE'},result={status:'PASS',code:'READ_OK',summary:'Sikeres.',data:{rawContent:original.toString('utf8'),fileSha256:hash(original)}};
const envelope=test.resultEnvelope({...identity,result});
await test.appendAudit(task.id,{...identity,event:'REQUEST',requestHash:'request-hash'});await test.appendAudit(task.id,{...identity,event:'RESULT',requestHash:'request-hash',result,protocolVersion:2});
const input={...identity,conversationId:'chat-a',resultId:envelope.resultId,resultSha256:envelope.resultSha256};
await check('server and desktop derive identical result IDs/digests from the full payload',()=>{assert.equal(protocol.canonical(envelope),protocol.canonical(protocol.makeEnvelope({...identity,execution:result})));});
await check('cross-task/session/worker/chat/proof/result ID/hash ACKs are rejected before receipt writes',async()=>{
  for(const k of ['taskId','sessionId','workerCode','conversationId','sourceProofSha256','resultId','resultSha256'])await assert.rejects(()=>server.recordDeveloperGridExecutionReceipt({...input,[k]:'WRONG',stage:'DELIVERED'}));
  assert.equal((await test.auditRows(task.id)).length,2);
});
await check('a worker ACK cannot precede delivered evidence; new execution waits for completion',async()=>{
  await assert.rejects(()=>server.recordDeveloperGridExecutionReceipt({...input,stage:'ACKNOWLEDGED',decision:'ACCEPTED'}),e=>e.code==='EXECUTION_DELIVERY_REQUIRED');
  await assert.rejects(()=>test.assertPriorExecutionSettled({taskId:task.id,sessionId:session.id,proofSha:identity.sourceProofSha256,requestId:'req-next'}),e=>e.code==='EXECUTION_PREVIOUS_ACK_REQUIRED');
});
await check('delivery, ACK and completed events are distinct and idempotent across retries',async()=>{
  await server.recordDeveloperGridExecutionReceipt({...input,stage:'DELIVERED'});await server.recordDeveloperGridExecutionReceipt({...input,stage:'DELIVERED'});
  const done=await server.recordDeveloperGridExecutionReceipt({...input,stage:'ACKNOWLEDGED',decision:'ACCEPTED'});assert.equal(done.workflowContinue,true);
  await server.recordDeveloperGridExecutionReceipt({...input,stage:'ACKNOWLEDGED',decision:'ACCEPTED'});
  const rows=await test.auditRows(task.id);for(const event of ['DELIVERED','ACKNOWLEDGED','COMPLETED'])assert.equal(rows.filter(r=>r.event===event).length,1);
  await test.assertPriorExecutionSettled({taskId:task.id,sessionId:session.id,proofSha:identity.sourceProofSha256,requestId:'req-next'});
  await assert.rejects(()=>server.recordDeveloperGridExecutionReceipt({...input,stage:'ACKNOWLEDGED',decision:'REJECTED'}),e=>e.code==='EXECUTION_ACK_CONFLICT');
});
await check('read-only outcome lookup recovers the original stored result without replaying an operation',async()=>{
  const found=await server.recordDeveloperGridExecutionReceipt({...identity,stage:'LOOKUP',conversationId:'chat-a'});assert.equal(found.resultEnvelope.resultId,envelope.resultId);assert.equal(found.replayed,true);
  await assert.rejects(()=>server.recordDeveloperGridExecutionReceipt({...identity,stage:'LOOKUP',conversationId:'chat-a',sourceProofSha256:'b'.repeat(64)}));
});
await check('an unresolved server REQUEST blocks a different request ID',async()=>{
  await test.appendAudit(task.id,{...identity,requestId:'req-uncertain',requestHash:'unknown',event:'REQUEST'});
  await assert.rejects(()=>test.assertPriorExecutionSettled({taskId:task.id,sessionId:session.id,proofSha:identity.sourceProofSha256,requestId:'new-id'}),e=>e.code==='EXECUTION_OUTCOME_UNCERTAIN');
});
await check('the receipt endpoint requires a paired device and exposes no anonymous mutation',async()=>{
  const route=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/dev/grid/execution-ack/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let called=0;const ctx={exports:{},require:id=>id==='next/server'?{NextResponse:{json:(body,options)=>({body,...options})}}:id.includes('chatgrid-device-auth')?{isChatGridDeviceAuthorized:async()=>false}:{recordDeveloperGridExecutionReceipt:async()=>{called++;},DeveloperGridExecutionError:Error}};vm.createContext(ctx);vm.runInContext(route,ctx);const denied=await ctx.exports.POST({headers:{}});assert.equal(denied.status,401);assert.equal(called,0);
});
console.log(JSON.stringify({ok:true,tests:count,scope:'real temporary byte I/O and Central Core receipt/audit gates',liveMutation:false,fixtureRoot:tmp}));
