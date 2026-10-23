import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Execute the actual TypeScript transport (not a rewritten mock) with its
// Next.js @/ path alias resolved only for this isolated Node/XHR test.
const source=readFileSync("app/lib/transfer-core/personalFormUpload.ts","utf8");
const code=ts.transpileModule(source,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
}).outputText.replaceAll("@/app/lib/content-core/personalUploadPolicy",
  pathToFileURL(resolve("app/lib/content-core/personalUploadPolicy.ts")).href);
const { uploadPersonalFormWithProgress, PersonalUploadHttpError } =
  await import("data:text/javascript,"+encodeURIComponent(code));

const requests=[];
let nextResponse={status:201,body:JSON.stringify({ok:true,saved:true,scanStatus:"CLEAN",placedInFolder:true})};
class FakeXHR {
  upload={onprogress:null};
  status=0;
  responseText="";
  withCredentials=false;
  headers=[];
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(key,value){this.headers.push([key,value]);}
  send(body){
    this.body=body;
    requests.push(this);
    const result=nextResponse;
    queueMicrotask(()=>{
      if(this.aborted)return;
      if(result.kind==="hang") return;
      const source=body instanceof FormData?body.get("file"):body;
      this.upload.onprogress?.({lengthComputable:true,loaded:source.size,total:source.size});
      if(result.kind==="network"){this.onerror?.();return;}
      this.status=result.status;
      this.responseText=result.body;
      this.onload?.();
    });
  }
  abort(){this.aborted=true;this.onabort?.();}
}
globalThis.XMLHttpRequest=FakeXHR;
const small=new File([Buffer.alloc(1024)],"Fotó 01.jpg",{type:"image/jpeg"});
const big=new File([Buffer.alloc(17*1024*1024)],"Műszaki #10.ifc",{type:"application/octet-stream"});
const requestId="19999999-9999-4999-a999-999999999999";
const input=file=>({
  file,folderId:"29888888-8888-4888-a888-888888888888",
  requestId,signal:new AbortController().signal,
  onProgress:()=>{},onNetworkSent:()=>{},
});
const observed={progress:[],sent:0};
const result=await uploadPersonalFormWithProgress({
  ...input(small),
  onProgress:n=>observed.progress.push(n),
  onNetworkSent:()=>observed.sent++,
});
assert.equal(result.saved,true);
assert.equal(observed.sent,1);
assert.equal(observed.progress.at(-1),small.size);
assert.equal(requests[0].method,"POST");
assert.equal(requests[0].url,"/api/drive/personal/uploads");
assert.equal(requests[0].body instanceof FormData,true);
assert.equal(requests[0].body.get("requestId"),requestId);
assert.equal(requests[0].body.get("file").name,small.name);
assert.equal(requests[0].withCredentials,true);

nextResponse={status:201,body:JSON.stringify({ok:true,saved:true,scanStatus:"CLEAN"})};
await uploadPersonalFormWithProgress(input(big));
const streamed=requests.at(-1);
assert.equal(streamed.url,"/api/drive/personal/uploads/stream");
assert.equal(streamed.body,big);
assert.equal(streamed.withCredentials,true);
assert.ok(streamed.headers.some(([k,v])=>k==="x-dimpro-request-id"&&v===requestId));
assert.ok(streamed.headers.some(([k,v])=>k==="x-dimpro-file-name"&&v===encodeURIComponent(big.name)));
assert.ok(streamed.headers.some(([k,v])=>k==="content-type"&&v==="application/octet-stream"));

for(const {status,code,uncertain} of [
  {status:409,code:"PERSONAL_UPLOAD_IDEMPOTENCY_CONFLICT",uncertain:false},
  {status:413,code:"PERSONAL_UPLOAD_FILE_TOO_LARGE",uncertain:false},
  {status:422,code:"PERSONAL_UPLOAD_INFECTED",uncertain:false},
  {status:503,code:"PERSONAL_UPLOAD_SAFETY_NOT_READY",uncertain:true},
  {status:502,code:"PERSONAL_STREAM_UPLOAD_FAILED",uncertain:true},
]) {
  nextResponse={status,body:JSON.stringify({ok:false,code})};
  await assert.rejects(()=>uploadPersonalFormWithProgress(input(big)),err=>{
    assert.ok(err instanceof PersonalUploadHttpError);
    assert.equal(err.status,status);
    assert.equal(err.uncertain,uncertain);
    assert.match(err.message,new RegExp(code));
    return true;
  });
}
nextResponse={kind:"network"};
await assert.rejects(()=>uploadPersonalFormWithProgress(input(small)),
  err=>err instanceof PersonalUploadHttpError&&err.uncertain===true&&err.status===0);
nextResponse={status:502,body:"upstream timed out"};
await assert.rejects(()=>uploadPersonalFormWithProgress(input(big)),
  err=>err instanceof PersonalUploadHttpError&&err.uncertain===true);
nextResponse={kind:"hang"};
const controller=new AbortController();
const pending=uploadPersonalFormWithProgress({...input(small),signal:controller.signal});
controller.abort();
await assert.rejects(()=>pending,err=>err instanceof PersonalUploadHttpError&&err.status===0);
assert.equal(requests.at(-1).aborted,true);

const preCancelled=new AbortController();
preCancelled.abort();
const count=requests.length;
await assert.rejects(()=>uploadPersonalFormWithProgress({...input(big),signal:preCancelled.signal}),
  err=>err instanceof PersonalUploadHttpError&&err.uncertain===false);
assert.equal(requests.length,count);

console.log("DIMPRO Drive V0.9.62 personal XMLHttpRequest buffered/streamed, CSRF headers, 201/409/413/422/502/503, network and abort PASS");
