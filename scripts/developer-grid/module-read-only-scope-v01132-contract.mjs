import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
process.chdir(fileURLToPath(new URL('../..',import.meta.url)));
const require=createRequire(import.meta.url),ts=require('typescript');
const catalog=JSON.parse(fs.readFileSync('config/developer-grid-module-sources.json'));
const policy={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/lib/dev-center/ai-worker/scope-policy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,policy);
const bridge=ts.createSourceFile('execution-bridge.ts',fs.readFileSync('app/lib/developer-grid/execution-bridge.ts','utf8'),ts.ScriptTarget.Latest,true);
const declaration=bridge.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='buildScopePlan');
assert(declaration,'Use the actual production scope planner');
const all=['components/drive/driveBuildInfo.ts','app/lib/drive-core/issueAccess.ts','app/lib/drive-core/storageRepository.ts','app/lib/drive-core/secret.ts','app/lib/unrelated/file.ts'];
let requestedRoots=[];
const sandbox={moduleCatalog:catalog,normalizePath:p=>p,cleanRel:p=>p,classifyScopePath:policy.exports.classifyScopePath,
 analyzeTechnicalScope:async()=>({candidates:[]}),
 git:async(_root,args)=>{requestedRoots=args.slice(args.indexOf('--')+1);return {code:0,stdout:all.filter(p=>requestedRoots.some(r=>p===r||p.startsWith(r+'/'))).join('\0')};},
 DeveloperGridExecutionError:class extends Error{constructor(message,code){super(message);this.code=code;}}};
vm.createContext(sandbox);
vm.runInContext(ts.transpileModule(declaration.getText(bridge)+'\nglobalThis.plan=buildScopePlan;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
for(const moduleName of ['DIMPRO Drive','Drive']){
 const scope=await sandbox.plan({root:'/fixture',taskTitle:'Drive lint javítás',sourcePrompt:'Csak három jóváhagyott fájl',moduleName,projectId:'project_dimprover'});
 assert(scope.readablePaths.includes('app/lib/drive-core/issueAccess.ts'));
 assert(scope.readablePaths.includes('app/lib/drive-core/storageRepository.ts'));
 assert(!scope.readablePaths.includes('app/lib/drive-core/secret.ts'));
 assert(!scope.readablePaths.includes('app/lib/unrelated/file.ts'));
 assert(!scope.writablePaths.includes('app/lib/drive-core/issueAccess.ts'));
 assert(!scope.writablePaths.includes('app/lib/drive-core/storageRepository.ts'));
 assert(requestedRoots.includes('app/lib/drive-core'));
}
for(const input of [{moduleName:'DIMPRO Drive',projectId:'other'},{moduleName:'Other',projectId:'project_dimprover'}])
 await assert.rejects(()=>sandbox.plan({root:'/fixture',taskTitle:'Drive',sourcePrompt:'',...input}),e=>e.code==='EXECUTION_SCOPE_EMPTY');
const reviewed={exports:{},require:id=>id==='@/config/developer-grid-module-sources.json'?catalog:id==='@/app/lib/dev-center/ai-worker/scope-policy'?policy.exports:require(id)};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/lib/developer-grid/reviewed-write-scope.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,reviewed);
assert.throws(()=>reviewed.exports.normalizeReviewedWritePaths(['app/lib/drive-core/issueAccess.ts'],'project_dimprover','DIMPRO Drive'),e=>e.code==='WRITE_REVIEW_PATH_DENIED');
assert.equal(reviewed.exports.normalizeReviewedWritePaths(['app/lib/drive-core/storageRepository.ts'],'project_dimprover','DIMPRO Drive')[0],'app/lib/drive-core/storageRepository.ts');
const readDeclaration=bridge.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='readFileAction');
let bytes=Buffer.alloc(0);
const readSandbox={Buffer,MAX_READ_BYTES:256*1024,MAX_OUTPUT_BYTES:64*1024,cleanRel:p=>p,
 assertReadableScope:p=>assert.equal(p,'app/lib/drive-core/storageRepository.ts'),classifyScopePath:policy.exports.classifyScopePath,
 existingPath:async()=>({target:'/fixture/file'}),stat:async()=>({size:bytes.length,isFile:()=>true}),readFile:async()=>bytes,
 clampInt:(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Math.trunc(Number(v)))):fallback,
 output:s=>s.slice(0,64*1024),sha:b=>createHash('sha256').update(b).digest('hex'),DeveloperGridExecutionError:sandbox.DeveloperGridExecutionError};
vm.createContext(readSandbox);
vm.runInContext(ts.transpileModule(readDeclaration.getText(bridge)+'\nglobalThis.read=readFileAction;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,readSandbox);
for(const ending of ['\n','\r\n'])for(const bom of ['', '\ufeff']){
 bytes=Buffer.from(bom+Array.from({length:852},(_,i)=>`sor ${i+1}`).join(ending)+ending);
 const full=await readSandbox.read('/fixture',{}, {path:'app/lib/drive-core/storageRepository.ts',startLine:1,endLine:853});
 assert.equal(full.data.completeFile,true);assert(Buffer.from(full.data.rawContent).equals(bytes));assert.equal(full.data.fileSha256,readSandbox.sha(bytes));
 const partial=await readSandbox.read('/fixture',{}, {path:'app/lib/drive-core/storageRepository.ts',startLine:201,endLine:400});
 assert.equal(partial.data.completeFile,false);assert.equal(partial.data.rawContent,undefined);
}
bytes=Buffer.from(Array(2500).fill('x').join('\n'));
const bounded=await readSandbox.read('/fixture',{}, {path:'app/lib/drive-core/storageRepository.ts',startLine:1,endLine:99999});
assert.equal(bounded.data.endLine,2000);assert.equal(bounded.data.completeFile,false);
bytes=Buffer.alloc(256*1024+1,120);
await assert.rejects(()=>readSandbox.read('/fixture',{}, {path:'app/lib/drive-core/storageRepository.ts'}),e=>e.code==='EXECUTION_READ_TOO_LARGE');
console.log('Grid 0.1.133 read-only module scope PASS 18/18');
console.log('Grid 0.1.133 complete source read PASS 23/23');
