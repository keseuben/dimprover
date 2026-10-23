import {type NextRequest} from "next/server";
import {personalMultipartActor,personalMultipartError,personalMultipartJson,personalMultipartOk,multipartPartNumber} from "@/app/lib/content-core/personalMultipartApi";
import {personalMultipartPartUrl,personalMultipartConfirmPart} from "@/app/lib/content-core/personalMultipartService";
export const dynamic="force-dynamic";
export const runtime="nodejs";
type RouteContext={params:Promise<{sessionId:string;partNumber:string}>};
export async function POST(request:NextRequest,context:RouteContext) {
  const access=await personalMultipartActor(request,true);
  if(!access.ok) return access.response;
  try {
    const {sessionId,partNumber:raw}=await context.params;
    return personalMultipartOk(await personalMultipartPartUrl(access.actor.userId,sessionId,multipartPartNumber(raw)));
  } catch(error) {return personalMultipartError(error);}
}
export async function PATCH(request:NextRequest,context:RouteContext) {
  const access=await personalMultipartActor(request,true);
  if(!access.ok) return access.response;
  try {
    const {sessionId,partNumber:raw}=await context.params;
    const body=await personalMultipartJson(request,1024);
    const data=body && typeof body==="object" && !Array.isArray(body)
      ? body as Record<string,unknown> : {};
    return personalMultipartOk(await personalMultipartConfirmPart({
      ownerUserId:access.actor.userId,sessionId,partNumber:multipartPartNumber(raw),
      etag:data.etag,sha256:data.sha256,
    }));
  } catch(error) {return personalMultipartError(error);}
}
