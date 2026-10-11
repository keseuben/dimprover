import assert from "node:assert/strict";
import {transferHttpUploadWithRetry} from "../../app/lib/transfer-core/uploadHttp.ts";
const attempts=[];
class FakeXHR{
 upload={onprogress:null};status=0;withCredentials=false;headers=[];
 open(method,url){this.method=method;this.url=url;}
 setRequestHeader(k,v){this.headers.push([k,v]);}
 send(file){
  attempts.push(this);
  queueMicrotask(()=>{
   if (this.aborted) return;
   this.upload.onprogress?.({lengthComputable:true,loaded:file.size/2,total:file.size});
   this.status=this.url.includes("forbidden")?403:this.url.includes("flaky")&&attempts.length===1?503:200;
   this.onload?.();
  });
 }
 abort(){this.aborted=true;this.onabort?.();}
}
globalThis.XMLHttpRequest=FakeXHR;
const file={size:100};const loaded=[];const retries=[];
await transferHttpUploadWithRetry({
 url:"/flaky",method:"PUT",headers:{},file,sameOrigin:true,
 signal:new AbortController().signal,maxAttempts:3,
 onProgress:bytes=>loaded.push(bytes),
 onRetry:(attempt,delay)=>retries.push({attempt,delay}),
});
assert.equal(attempts.length,2);
assert.deepEqual(loaded,[50,0,50,100]);
assert.deepEqual(retries,[{attempt:1,delay:600}]);
attempts.length=0;
await assert.rejects(()=>transferHttpUploadWithRetry({
 url:"/forbidden",method:"PUT",headers:{},file,sameOrigin:true,
 signal:new AbortController().signal,onProgress:()=>{},maxAttempts:4,
}),/HTTP 403/);
assert.equal(attempts.length,1,"auth errors are not silently retried");
attempts.length=0;
const stopped=new AbortController();stopped.abort();
await assert.rejects(()=>transferHttpUploadWithRetry({
 url:"/flaky",method:"PUT",headers:{},file,sameOrigin:true,
 signal:stopped.signal,onProgress:()=>{},
}),/AbortError/);
assert.equal(attempts.length,0);
console.log("DIMPRO Transfer Center V0.9.51 bounded full-PUT retry PASS");
