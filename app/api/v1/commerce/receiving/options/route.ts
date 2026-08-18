import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceReceivingErrorResponse } from "@/app/lib/commerce/receiving/api";
import { listCommerceReceivingOptions } from "@/app/lib/commerce/receiving/repository";
export const dynamic="force-dynamic"; export const revalidate=0;
export async function GET(request:NextRequest){try{const organizationId=request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;const context=await resolveCommerceContext(organizationId);const data=await listCommerceReceivingOptions(context);return NextResponse.json({ok:true,data});}catch(error){return commerceReceivingErrorResponse(error);}}
