import { NextRequest, NextResponse, after } from "next/server";
import { resolveCentralDimproAuthEnvironmentFromHost } from "@/app/lib/dimpro-auth/client-config";
import { beginDriveRegistration } from "@/app/lib/dimpro-auth/drive-registration";
import { sendDimproDriveRegistrationOtpEmail } from "@/app/lib/dimpro-auth/email";
import { getDimproAuthConfig } from "@/app/lib/dimpro-auth/config";
import { recordAuthAuditEvent } from "@/app/lib/dimpro-auth/repository";
import { createDimproAuthOtpCode, getDimproAuthRequestIp, getDimproAuthUserAgent, isValidDimproAuthEmail, newDimproAuthCorrelationId, normalizeDimproAuthEmail, validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";

export const dynamic="force-dynamic";
export const runtime="nodejs";

export async function POST(request: NextRequest){
  if(!resolveCentralDimproAuthEnvironmentFromHost(request.headers.get("host"))) return NextResponse.json({ok:false,error:"AUTH_HOST_NOT_ALLOWED"},{status:404,headers:{"cache-control":"no-store"}});
  const correlationId=newDimproAuthCorrelationId(request.headers);
  if(!validateSameOriginMutation(request.headers)) return NextResponse.json({ok:false,error:"AUTH_ORIGIN_DENIED",correlationId},{status:403,headers:{"cache-control":"no-store"}});
  const body=await request.json().catch(()=>null) as {email?:unknown;displayName?:unknown;organizationName?:unknown}|null;
  const email=normalizeDimproAuthEmail(body?.email);
  const displayName=typeof body?.displayName==="string"?body.displayName.trim().slice(0,160):"";
  const organizationName=typeof body?.organizationName==="string"?body.organizationName.trim().slice(0,160):"";
  if(!isValidDimproAuthEmail(email)||displayName.length<2) return NextResponse.json({ok:false,error:"AUTH_DRIVE_REGISTRATION_INPUT_INVALID",message:"Érvényes e-mail-cím és név szükséges.",correlationId},{status:400,headers:{"cache-control":"no-store"}});
  try{
    const code=createDimproAuthOtpCode();
    const result=await beginDriveRegistration({email,displayName,organizationName,code,ip:getDimproAuthRequestIp(request.headers),userAgent:getDimproAuthUserAgent(request.headers),correlationId});
    const delivery={email,displayName,code,expiresMinutes:Math.ceil(getDimproAuthConfig().otpTtlSeconds/60)};
    after(async()=>{
      try{
        await sendDimproDriveRegistrationOtpEmail(delivery);
        await recordAuthAuditEvent({eventType:"DRIVE_REGISTRATION_OTP_DELIVERY",userId:result.userId,email,method:"EMAIL_OTP",result:"SUCCESS",ip:getDimproAuthRequestIp(request.headers),userAgent:getDimproAuthUserAgent(request.headers),correlationId,metadata:{registrationId:result.registrationId}}).catch(()=>undefined);
      }catch(error){
        await recordAuthAuditEvent({eventType:"DRIVE_REGISTRATION_OTP_DELIVERY",userId:result.userId,email,method:"EMAIL_OTP",result:"FAILURE",ip:getDimproAuthRequestIp(request.headers),userAgent:getDimproAuthUserAgent(request.headers),correlationId,metadata:{registrationId:result.registrationId,errorClass:error instanceof Error?error.name:"UnknownError"}}).catch(()=>undefined);
      }
    });
    await recordAuthAuditEvent({eventType:"DRIVE_REGISTRATION_REQUEST",userId:result.userId,email,method:"SELF_SERVICE",result:"PENDING_EMAIL",ip:getDimproAuthRequestIp(request.headers),userAgent:getDimproAuthUserAgent(request.headers),correlationId,metadata:{registrationId:result.registrationId,organizationName:organizationName||null}});
    return NextResponse.json({ok:true,registrationId:result.registrationId,status:"PENDING_EMAIL",message:"A regisztrációs kódot elküldtük az e-mail-címre.",correlationId},{headers:{"cache-control":"no-store"}});
  }catch(error){
    if(error instanceof DimproAuthError) return NextResponse.json({ok:false,error:error.code,message:error.publicMessage,correlationId},{status:error.status,headers:{"cache-control":"no-store"}});
    console.error("DIMPRO Drive registration request hiba",correlationId,error instanceof Error?error.message:error);
    return NextResponse.json({ok:false,error:"AUTH_DRIVE_REGISTRATION_UNAVAILABLE",message:"A Saját Drive regisztráció jelenleg nem indítható.",correlationId},{status:503,headers:{"cache-control":"no-store"}});
  }
}
