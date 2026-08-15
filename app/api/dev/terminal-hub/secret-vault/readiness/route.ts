import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getSecretVaultReadiness } from "@/app/lib/dev-center/terminal-hub/secret-vault";
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function GET(request:NextRequest){if(!(await isDevCenterAuthorized(request.headers,false)))return NextResponse.json({ok:false,error:"Nincs BENJADMIN Secret Vault jogosultság."},{status:401});return NextResponse.json({ok:true,readiness:getSecretVaultReadiness()},{headers:{"cache-control":"no-store"}});}
