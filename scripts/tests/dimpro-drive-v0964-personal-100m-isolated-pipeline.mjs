import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import {
  S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand,
} from "@aws-sdk/client-s3";
import { checkedPersonalStreamChunks, PersonalStreamBodyError }
  from "../../app/lib/content-core/personalStreamGuard.ts";

if (process.env.DIMPRO_PRODUCTION_ACCESS !== "DENY"
    || process.env.DIMPRO_DRIVE_V0964_SANDBOX_ONLY !== "true") {
  throw new Error("DRIVE_V0964_SANDBOX_ONLY_REQUIRED");
}
const { getClamdHealth, scanAsyncIterableWithClamd } = await import(
  pathToFileURL(resolve("app/lib/drop/worker/clamdInstream.ts")).href,
);
const MiB = 1024 * 1024;
const maxBytes = 100 * MiB;
const config={
  enabled:true,scannerMode:"clamd-instream",
  clamdSocket:"/var/run/clamav/clamd.ctl",
  scanTimeoutMs:180_000,maxScanBytes:maxBytes,
  workerId:"drive-v0964-local-only",secret:"local-no-real-token",
  claimLimit:1,leaseSeconds:1200,retrySeconds:300,
  signedDownloadTtlSeconds:180,reportDeletionGateEnabled:true,
};
assert.equal((await getClamdHealth(config)).ping,"PONG");

const directory=await mkdtemp(join(tmpdir(),"dimpro-v0964-local-only-"));
const staging=join(directory,"staged.bin");
const bucket="dimpro-isolated-loopback-only";
const key="_dimpro_e2e/personal/synthetic-v0964/" + randomUUID() + ".bin";
const persisted=join(directory,"object.bin");
let storedBytes=0;
let objectReady=false;
let server;
let client;
try {
  const buffer=Buffer.alloc(MiB,0x41);
  const expected=createHash("sha256");
  const input=(async function*(){
    for(let i=0;i<100;i++){
      expected.update(buffer);
      yield buffer;
    }
  })();
  // Exercise the production bounded stream validator and disk staging code.
  await pipeline(
    Readable.from(checkedPersonalStreamChunks(input,maxBytes,maxBytes)),
    createWriteStream(staging,{flags:"wx",mode:0o600}),
  );
  assert.equal((await stat(staging)).size,maxBytes);
  const signedExpected=expected.digest("hex");
  const scanned=await scanAsyncIterableWithClamd(createReadStream(staging),maxBytes,config);
  assert.equal(scanned.status,"clean");
  assert.equal(scanned.bytesScanned,maxBytes);
  assert.equal(scanned.sha256,signedExpected);
  console.log("STAGING_AND_REAL_CLAMD_100_MIB_SHA256_PASS");

  // Check the same scanner rejects the harmless EICAR reference pattern
  // before an object could be sent to the loopback S3 server.
  const harmlessMarker = Buffer.from([
    "X5O!P%@AP", String.raw`[4\PZX54(P^)7CC)7}`,
    "$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
  ].join(""), "ascii");
  const infectedPath = join(directory,"eicar-memory-reference.txt");
  await writeFile(infectedPath,harmlessMarker,{flag:"wx",mode:0o600});
  const rejected=await scanAsyncIterableWithClamd(
    createReadStream(infectedPath),harmlessMarker.length,config,
  );
  assert.equal(rejected.status,"infected");
  assert.equal(objectReady,false);
  console.log("REAL_CLAMD_HARMLESS_EICAR_BLOCK_BEFORE_S3_PASS");

  server=createServer(async(req,res)=>{
    const route = new URL(req.url,"http://127.0.0.1").pathname;
    if(route!=="/"+bucket+"/"+key){
      res.writeHead(404);res.end();return;
    }
    try{
      if(req.method==="PUT"){
        await pipeline(req,createWriteStream(persisted,{flags:"wx",mode:0o600}));
        storedBytes=(await stat(persisted)).size;
        objectReady=true;
        res.writeHead(200,{"etag":'"'+createHash("md5").update(key).digest("hex")+'"'});
        res.end();return;
      }
      if (!objectReady) {res.writeHead(404);res.end();return;}
      if(req.method==="HEAD"){
        res.writeHead(200,{"content-length":storedBytes,"content-type":"application/octet-stream"});
        res.end();return;
      }
      if(req.method==="GET"){
        res.writeHead(200,{"content-length":storedBytes,"content-type":"application/octet-stream"});
        await pipeline(createReadStream(persisted),res);
        return;
      }
      res.writeHead(405);res.end();
    }catch{
      if(!res.headersSent)res.writeHead(500);
      res.end();
    }
  });
  await new Promise((done,fail)=>{
    server.once("error",fail);
    server.listen(0,"127.0.0.1",done);
  });
  const address=server.address();
  assert.ok(address && typeof address!=="string" && address.address==="127.0.0.1");
  client=new S3Client({
    endpoint:"http://127.0.0.1:"+address.port,
    region:"local-test-1",forcePathStyle:true,
    credentials:{accessKeyId:"FAKE_LOCAL_ONLY",secretAccessKey:"FAKE_LOCAL_ONLY"},
    requestChecksumCalculation:"WHEN_REQUIRED",
    responseChecksumValidation:"WHEN_REQUIRED",maxAttempts:1,
  });
  await client.send(new PutObjectCommand({
    Bucket:bucket,Key:key,Body:createReadStream(staging),
    ContentLength:maxBytes,ContentType:"application/octet-stream",
    Metadata:{"dimpro-sha256":signedExpected},
  }));
  assert.ok(objectReady);
  const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
  assert.equal(Number(head.ContentLength),maxBytes);
  const read=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  const digest=createHash("sha256");
  let received=0;
  for await(const chunk of read.Body){digest.update(chunk);received+=chunk.length;}
  assert.equal(received,maxBytes);
  assert.equal(digest.digest("hex"),signedExpected);
  console.log("LOCAL_S3_PUT_HEAD_GET_FULL_HASH_100_MIB_PASS");

  // Negative cases do not access S3 and cannot create a CLEAN object.
  for(const [declared,actual,code] of [
    [MiB,2*MiB,"PERSONAL_UPLOAD_STREAM_OVERFLOW"],
    [2*MiB,MiB,"PERSONAL_UPLOAD_STREAM_LENGTH_MISMATCH"],
    [maxBytes+1,0,"PERSONAL_UPLOAD_STREAM_SIZE_INVALID"],
  ]){
    let caught;
    try {
      const data=(async function*(){if(actual)yield Buffer.alloc(actual,0x41);})();
      for await(const chunk of checkedPersonalStreamChunks(data,declared,maxBytes)){
        assert.ok(chunk.byteLength > 0);
      }
    }catch(e){caught=e;}
    assert.ok(caught instanceof PersonalStreamBodyError);
    assert.equal(caught.code,code);
  }
  console.log("OVERFLOW_UNDERRUN_LIMIT_FAIL_CLOSED_PASS");
  console.log("DIMPRO Drive V0.9.64 isolated 100 MiB guarded staging → real ClamAV → localhost S3 SDK → full SHA-256 PASS (no real S3 or DB)");
}finally{
  client?.destroy();
  if(server?.listening) await new Promise(resolve=>server.close(resolve));
  // Only the unique temporary folder created above is owned by this test.
  await rm(directory,{recursive:true,force:true});
}
