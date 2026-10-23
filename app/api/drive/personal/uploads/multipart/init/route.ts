import { type NextRequest } from "next/server";
import {personalMultipartActor,personalMultipartError,personalMultipartJson,personalMultipartOk} from "@/app/lib/content-core/personalMultipartApi";
import {initPersonalMultipartSession,validatePersonalMultipartInitBody} from "@/app/lib/content-core/personalMultipartService";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest) {
  const access=await personalMultipartActor(request,true);
  if(!access.ok) return access.response;
  try {
    const data=validatePersonalMultipartInitBody(await personalMultipartJson(request));
    return personalMultipartOk(await initPersonalMultipartSession({ownerUserId:access.actor.userId,data}),201);
  } catch(error) {return personalMultipartError(error);}
}
