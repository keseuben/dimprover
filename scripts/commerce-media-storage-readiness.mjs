#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function text(name){return process.env[name]?.trim()||"";}
const commerce={endpoint:text("DIMPRO_COMMERCE_S3_ENDPOINT"),bucket:text("DIMPRO_COMMERCE_S3_BUCKET"),access:text("DIMPRO_COMMERCE_S3_ACCESS_KEY_ID"),secret:text("DIMPRO_COMMERCE_S3_SECRET_ACCESS_KEY"),region:text("DIMPRO_COMMERCE_S3_REGION")};
const useCommerce=Boolean(commerce.endpoint&&commerce.bucket&&commerce.access&&commerce.secret);
const endpoint=useCommerce?commerce.endpoint:text("DIMPRO_DRIVE_S3_ENDPOINT");
const bucket=useCommerce?commerce.bucket:text("DIMPRO_DRIVE_S3_BUCKET");
const accessKeyId=useCommerce?commerce.access:text("DIMPRO_DRIVE_S3_ACCESS_KEY_ID");
const secretAccessKey=useCommerce?commerce.secret:text("DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY");
const region=(useCommerce?commerce.region:text("DIMPRO_DRIVE_S3_REGION"))||"auto";
if(!endpoint||!bucket||!accessKeyId||!secretAccessKey){console.error("FAIL COMMERCE_MEDIA_STORAGE_NOT_CONFIGURED");process.exit(2);}
const client=new S3Client({endpoint,region,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}});
const key=`commerce/readiness/${new Date().toISOString().slice(0,10)}/${randomUUID()}.txt`;
const body=Buffer.from("DIMPRO Commerce Media readiness\n","utf8");
try{
  await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentLength:body.length,ContentType:"text/plain",Metadata:{"dimpro-component":"commerce-media-readiness"}}));
  const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
  if(Number(head.ContentLength||0)!==body.length)throw new Error("READINESS_SIZE_MISMATCH");
  console.log("PASS 01 Commerce media object PUT");
  console.log("PASS 02 Commerce media object HEAD size verification");
  console.log(`PASS 03 storage credential mode ${useCommerce?"COMMERCE":"DRIVE_FALLBACK"}`);
}finally{
  try{await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));console.log("PASS 04 readiness object cleanup");}catch{console.error("WARN readiness object cleanup failed");}
}
console.log("RESULT 4/4 PASS");
