import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceMediaErrorResponse } from "@/app/lib/commerce/media/api";
import { uploadCommerceMediaVariant } from "@/app/lib/commerce/media/uploadService";

export const dynamic="force-dynamic";
export const revalidate=0;
type RouteContext={params:Promise<{assetId:string;kind:string}>};

export async function PUT(request: NextRequest, routeContext: RouteContext) {
  try {
    const {assetId,kind}=await routeContext.params;
    const organizationId=request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;
    const context=await resolveCommerceContext(organizationId);
    const token=request.headers.get("x-commerce-media-upload-token")?.trim()||"";
    const data=await uploadCommerceMediaVariant({
      context,assetId,kind,token,
      contentType:request.headers.get("content-type")?.trim()||"application/octet-stream",
      contentLength:Number(request.headers.get("content-length")||0),
      body:request.body,
    });
    return NextResponse.json({ok:true,data});
  } catch(error) { return commerceMediaErrorResponse(error); }
}
