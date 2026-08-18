import { NextResponse } from "next/server";
import { CommerceContextError } from "../core/errors";
import { CommerceOrderError } from "./repository";
export function commerceOrderErrorResponse(error:unknown){if(error instanceof CommerceOrderError||error instanceof CommerceContextError)return NextResponse.json({ok:false,error:error.message,code:error.code},{status:error.status});console.error("[Commerce Order]",error);return NextResponse.json({ok:false,error:"A rendelési művelet váratlan hibával leállt.",code:"COMMERCE_ORDER_INTERNAL_ERROR"},{status:500});}
