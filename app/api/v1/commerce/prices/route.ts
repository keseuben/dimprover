import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commercePricingErrorResponse } from "@/app/lib/commerce/pricing/api";
import { listCommercePrices, setCommerceActivePrice } from "@/app/lib/commerce/pricing/repository";
export const dynamic="force-dynamic";
export const revalidate=0;
function organizationId(request:NextRequest){return request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;}
export async function GET(request:NextRequest){
  try{const context=await resolveCommerceContext(organizationId(request));const data=await listCommercePrices(context,{variantId:request.nextUrl.searchParams.get("variantId"),currency:request.nextUrl.searchParams.get("currency")||undefined,limit:Number(request.nextUrl.searchParams.get("limit")||25)});return NextResponse.json({ok:true,data});}
  catch(error){return commercePricingErrorResponse(error);}
}
export async function POST(request:NextRequest){
  try{const context=await resolveCommerceContext(organizationId(request));const body=await request.json() as Record<string,unknown>;const data=await setCommerceActivePrice(context,body);return NextResponse.json({ok:true,data},{status:201});}
  catch(error){return commercePricingErrorResponse(error);}
}
