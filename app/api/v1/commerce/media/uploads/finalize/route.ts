import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceMediaErrorResponse } from "@/app/lib/commerce/media/api";
import { finalizeCommerceMediaUpload } from "@/app/lib/commerce/media/uploadService";

export const dynamic="force-dynamic";
export const revalidate=0;

export async function POST(request: NextRequest) {
  try {
    const organizationId=request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;
    const context=await resolveCommerceContext(organizationId);
    const body=await request.json() as Record<string,unknown>;
    const token=request.headers.get("x-commerce-media-upload-token")?.trim()||String(body.token||"").trim();
    const data=await finalizeCommerceMediaUpload(context,token);
    return NextResponse.json({ok:true,data});
  } catch(error) { return commerceMediaErrorResponse(error); }
}
