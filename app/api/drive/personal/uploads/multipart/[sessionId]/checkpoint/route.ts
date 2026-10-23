import {type NextRequest} from "next/server";
import {personalMultipartActor,personalMultipartError,personalMultipartOk} from "@/app/lib/content-core/personalMultipartApi";
import {personalMultipartCheckpoint} from "@/app/lib/content-core/personalMultipartService";
export const dynamic="force-dynamic";
export const runtime="nodejs";
type RouteContext={params:Promise<{sessionId:string}>};
export async function GET(request:NextRequest,context:RouteContext) {
  const access=await personalMultipartActor(request);
  if(!access.ok) return access.response;
  try {
    const {sessionId}=await context.params;
    return personalMultipartOk(await personalMultipartCheckpoint(access.actor.userId,sessionId));
  } catch(error) {return personalMultipartError(error);}
}
