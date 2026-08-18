import { NextResponse } from "next/server";
import { CommerceContextError } from "../core/errors";
import { CommercePricingError } from "./repository";
export function commercePricingErrorResponse(error:unknown){
  if(error instanceof CommercePricingError||error instanceof CommerceContextError)return NextResponse.json({ok:false,error:error.message,code:error.code},{status:error.status});
  return NextResponse.json({ok:false,error:"A Commerce Pricing művelet váratlan hibával leállt.",code:"COMMERCE_PRICING_UNEXPECTED"},{status:500});
}
