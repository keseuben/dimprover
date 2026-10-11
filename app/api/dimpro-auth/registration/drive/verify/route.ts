import { NextRequest, NextResponse, after } from "next/server";
import { resolveCentralDimproAuthEnvironmentFromHost } from "@/app/lib/dimpro-auth/client-config";
import { verifyDriveRegistration } from "@/app/lib/dimpro-auth/drive-registration";
import { deliverDriveRegistrationOperatorNotice } from "@/app/lib/dimpro-auth/drive-registration-operator";
import { recordAuthAuditEvent } from "@/app/lib/dimpro-auth/repository";
import { getDimproAuthRequestIp, getDimproAuthUserAgent, isValidDimproAuthEmail, newDimproAuthCorrelationId, normalizeDimproAuthEmail, validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";

export const dynamic="force-dynamic";
export const runtime="nodejs";

export async function POST(request: NextRequest){
  if(!resolveCentralDimproAuthEnvironmentFromHost(request.headers.get("host"))) return NextResponse.json({ok:false,error:"AUTH_HOST_NOT_ALLOWED"},{status:404,headers:{"cache-control":"no-store"}});
  const correlationId=newDimproAuthCorrelationId(request.headers);
  if(!validateSameOriginMutation(request.headers)) return NextResponse.json({ok:false,error:"AUTH_ORIGIN_DENIED",correlationId},{status:403,headers:{"cache-control":"no-store"}});
  const body=await request.json().catch(()=>null) as {registrationId?:unknown;email?:unknown;code?:unknown}|null;
  const registrationId=typeof body?.registrationId==="string"?body.registrationId.trim():"";
  const email=normalizeDimproAuthEmail(body?.email);
  const code=typeof body?.code==="string"?body.code.trim():"";
  if(!/^[0-9a-f-]{36}$/i.test(registrationId)||!isValidDimproAuthEmail(email)||!/^\d{6}$/.test(code)) return NextResponse.json({ok:false,error:"AUTH_DRIVE_REGISTRATION_VERIFY_INPUT_INVALID",correlationId},{status:400,headers:{"cache-control":"no-store"}});
  try{
    const result=await verifyDriveRegistration({registrationId,email,code,ip:getDimproAuthRequestIp(request.headers),userAgent:getDimproAuthUserAgent(request.headers),correlationId});
    await recordAuthAuditEvent({eventType:"DRIVE_REGISTRATION_EMAIL_VERIFIED",userId:result.userId,email,method:"EMAIL_OTP",result:"SUCCESS",ip:getDimproAuthRequestIp(request.headers),userAgent:getDimproAuthUserAgent(request.headers),correlationId,metadata:{registrationId:result.registrationId,status:result.status}});
    // A migration creates a durable, unique operator notice within the OTP transaction.
    // Delivery is additionally hard-disabled until explicit email configuration and release.
    after(async()=>{
      try{await deliverDriveRegistrationOperatorNotice(result.registrationId);}
      catch{console.error("AUTH_DRIVE_OPERATOR_NOTICE_DISPATCH_UNAVAILABLE",correlationId);}
    });
    return NextResponse.json({ok:true,status:result.status,message:"Az e-mail-cím igazolva. A Saját Drive aktiválása jogosultság/licenc jóváhagyás után történik.",correlationId},{headers:{"cache-control":"no-store"}});
  }catch(error){
    if(error instanceof DimproAuthError) return NextResponse.json({ok:false,error:error.code,message:error.publicMessage,correlationId},{status:error.status,headers:{"cache-control":"no-store"}});
    console.error("DIMPRO Drive registration verify hiba",correlationId,error instanceof Error?error.message:error);
    return NextResponse.json({ok:false,error:"AUTH_DRIVE_REGISTRATION_VERIFY_FAILED",message:"A regisztrációs kód ellenőrzése nem sikerült.",correlationId},{status:503,headers:{"cache-control":"no-store"}});
  }
}
