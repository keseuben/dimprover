import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceMediaErrorResponse } from "@/app/lib/commerce/media/api";
import { initiateCommerceMediaUpload } from "@/app/lib/commerce/media/uploadService";

export const dynamic="force-dynamic";
export const revalidate=0;

export async function POST(request: NextRequest) {
  try {
    const organizationId=request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;
    const context=await resolveCommerceContext(organizationId);
    const body=await request.json() as Record<string,unknown>;
    const data=await initiateCommerceMediaUpload(context,body);
    return NextResponse.json({ok:true,data},{status:201});
  } catch(error) { return commerceMediaErrorResponse(error); }
}
