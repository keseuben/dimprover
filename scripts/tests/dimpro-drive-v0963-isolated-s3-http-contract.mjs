import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  S3Client, PutObjectCommand, GetObjectCommand,
  HeadObjectCommand, DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Isolated loopback S3 protocol test. In-memory objects, fake credentials,
 * random OS-assigned port and no outside service. There is no real S3 bucket,
 * external DB, authenticated browser or application API call here.
 */
const bucket = "dimpro-isolated-dev-only";
const key = "_dimpro_e2e/personal/synthetic-20261023/" + randomUUID() + ".pdf";
const objects = new Map();
const reads = [];
const http = createServer(async (request,response) => {
  const pathname = new URL(request.url,"http://localhost").pathname;
  if (pathname !== `/${bucket}/${key}`) {
    response.writeHead(404); response.end("Not Found");return;
  }
  const method = request.method;
  if (method === "PUT") {
    const chunks=[];
    let size=0;
    for await(const chunk of request) {
      chunks.push(chunk);
      size += chunk.length;
    }
    const body = Buffer.concat(chunks,size);
    objects.set(key,body);
    response.writeHead(200,{"etag":'"'+createHash("md5").update(body).digest("hex")+'"'});
    response.end();return;
  }
  if(method==="HEAD"){
    const body=objects.get(key);
    if(!body){response.writeHead(404);response.end();return;}
    response.writeHead(200,{
      "content-length":body.length,"content-type":"application/pdf",
      "etag":'"'+createHash("md5").update(body).digest("hex")+'"',
    });
    response.end();return;
  }
  if(method==="GET"){
    const body=objects.get(key);
    if(!body){response.writeHead(404);response.end();return;}
    reads.push(key);
    response.writeHead(200,{
      "content-length":body.length,"content-type":"application/pdf",
      "etag":'"'+createHash("md5").update(body).digest("hex")+'"',
    });
    response.end(body);return;
  }
  if(method==="DELETE"){
    objects.delete(key);
    response.writeHead(204);response.end();return;
  }
  response.writeHead(405);response.end();
});
await new Promise((resolve,reject)=>{
  http.once("error",reject);
  http.listen(0,"127.0.0.1",resolve);
});
const address=http.address();
assert.ok(typeof address==="object" && address.address==="127.0.0.1");
const client=new S3Client({
  endpoint:`http://127.0.0.1:${address.port}`,region:"eu-test-1",
  forcePathStyle:true,
  credentials:{accessKeyId:"FAKEDEVONLY",secretAccessKey:"FAKE-NOT-A-REAL-KEY"},
  requestChecksumCalculation:"WHEN_REQUIRED",
  responseChecksumValidation:"WHEN_REQUIRED",
  maxAttempts:1,
});
try{
  const MiB=1024*1024;
  const total=17*MiB;
  const chunk=Buffer.alloc(MiB,0x41);
  const expected=createHash("sha256");
  const source=Readable.from((async function*(){
    for(let i=0;i<17;i++){expected.update(chunk);yield chunk;}
  })());
  await client.send(new PutObjectCommand({
    Bucket:bucket,Key:key,Body:source,ContentLength:total,
    ContentType:"application/pdf",
  }));
  const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
  assert.equal(Number(head.ContentLength),total);
  const read=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  const sha=createHash("sha256");
  let bytes=0;
  for await(const data of read.Body){sha.update(data);bytes+=data.length;}
  assert.equal(bytes,total);
  assert.equal(sha.digest("hex"),expected.digest("hex"));
  assert.equal(reads.length,1);
  await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
  assert.equal(objects.has(key),false);
  console.log("DIMPRO Drive V0.9.63 isolated loopback S3 SDK 17 MiB PUT/HEAD/GET SHA-256/DELETE PASS; no real infrastructure");
}finally{
  client.destroy();
  await new Promise(resolve=>http.close(resolve));
}
