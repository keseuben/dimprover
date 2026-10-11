import assert from "node:assert/strict";
import {transferHttpUpload} from "../../app/lib/transfer-core/uploadHttp.ts";
const recorded=[];
class FakeXHR {
  upload={onprogress:null};
  status=0;
  withCredentials=false;
  headers=[];
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(k,v){this.headers.push([k,v]);}
  send(file){
    recorded.push(this);
    queueMicrotask(()=>{
      if(this.aborted)return;
      this.upload.onprogress?.({lengthComputable:true,loaded:Math.floor(file.size/2),total:file.size});
      this.status=this.url.includes("error")?500:204;
      this.onload?.();
    });
  }
  abort(){this.aborted=true;this.onabort?.();}
}
globalThis.XMLHttpRequest=FakeXHR;
const file={size:100};
const controller=new AbortController();
const loaded=[];
await transferHttpUpload({
  url:"https://storage.example.test/put",method:"PUT",headers:{"content-type":"application/pdf"},
  file,sameOrigin:false,signal:controller.signal,onProgress:x=>loaded.push(x),
});
assert.deepEqual(loaded,[50,100]);
assert.equal(recorded[0].withCredentials,false);
assert.deepEqual(recorded[0].headers,[["content-type","application/pdf"]]);
const internal=new AbortController();
await transferHttpUpload({
  url:"/api/drive/browser-upload",method:"PUT",headers:{},file,
  sameOrigin:true,signal:internal.signal,onProgress:()=>{},
});
assert.equal(recorded[1].withCredentials,true);
await assert.rejects(()=>transferHttpUpload({
  url:"/error",method:"PUT",headers:{},file,sameOrigin:true,
  signal:new AbortController().signal,onProgress:()=>{},
}),/HTTP 500/);
const cancelled=new AbortController();cancelled.abort();
await assert.rejects(()=>transferHttpUpload({
  url:"/test",method:"PUT",headers:{},file,sameOrigin:true,
  signal:cancelled.signal,onProgress:()=>{},
}),/AbortError/);
const during=new AbortController();
const pending=transferHttpUpload({
  url:"/slow",method:"PUT",headers:{},file,sameOrigin:true,
  signal:during.signal,onProgress:()=>{},
});
during.abort();
await assert.rejects(()=>pending,/AbortError/);
assert.equal(recorded.at(-1).aborted,true);
console.log("DIMPRO Transfer Center V0.9.50 XHR real-byte transport PASS");
