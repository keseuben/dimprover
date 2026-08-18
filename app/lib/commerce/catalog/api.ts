import { NextResponse } from "next/server";
import { CommerceContextError } from "../core/errors";
import { CommerceCatalogError } from "./repository";
export function commerceCatalogErrorResponse(error:unknown){
  if(error instanceof CommerceCatalogError||error instanceof CommerceContextError)return NextResponse.json({ok:false,error:error.message,code:error.code},{status:error.status});
  return NextResponse.json({ok:false,error:"A Commerce törzsadat művelet váratlan hibával leállt.",code:"COMMERCE_CATALOG_UNEXPECTED"},{status:500});
}
