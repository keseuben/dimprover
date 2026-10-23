import { type NextRequest, NextResponse } from "next/server";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const noCache = { "cache-control": "private, no-store" };
export type PersonalMultipartActor = { userId: string };

export async function personalMultipartActor(request: NextRequest, mutate = false):
  Promise<{ ok: true; actor: PersonalMultipartActor } | {ok:false; response:NextResponse}> {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return {ok:false, response: access.response};
  if (mutate) {
    try {
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");
      if (!origin || !host) throw new Error("No Origin");
      const url = new URL(origin);
      if (url.protocol !== "https:" || url.host !== host) throw new Error("Origin mismatch");
    } catch {
      return {ok:false, response: NextResponse.json({
        ok:false, code:"PERSONAL_MULTIPART_ORIGIN_INVALID",
      }, {status:403,headers:noCache})};
    }
  }
  return {ok:true,actor:{userId:access.contentUserId}};
}

export async function personalMultipartJson(request: NextRequest, maxBytes = 4096) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d{1,7}$/.test(declared) || Number(declared) > maxBytes)) {
    throw new DimproIdentityError("A multipart kérés túl hosszú.",
      "PERSONAL_MULTIPART_JSON_TOO_LARGE",413);
  }
  const type = request.headers.get("content-type");
  if (!type?.toLowerCase().startsWith("application/json")) {
    throw new DimproIdentityError("Csak JSON kérés fogadható.",
      "PERSONAL_MULTIPART_JSON_REQUIRED",415);
  }
  if (!request.body) {
    throw new DimproIdentityError("A JSON kérés üres.", "PERSONAL_MULTIPART_JSON_INVALID",400);
  }
  // Bound the *actual* bytes; absent/forged Content-Length must not permit an
  // unbounded request.text() allocation on server-side API workers.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let seen = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += value.byteLength;
      if (seen > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new DimproIdentityError("A multipart kérés túl hosszú.",
          "PERSONAL_MULTIPART_JSON_TOO_LARGE",413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const content = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)),seen).toString("utf8");
  try {return JSON.parse(content) as unknown;}
  catch {throw new DimproIdentityError("Érvénytelen JSON.",
    "PERSONAL_MULTIPART_JSON_INVALID",400);}
}

export function personalMultipartError(error: unknown) {
  const known = error instanceof DimproIdentityError;
  return NextResponse.json({ok:false,code:known?error.code:"PERSONAL_MULTIPART_UNAVAILABLE",
    error:known?error.message:"A Saját Drive multipart művelete nem hajtható végre."},
  {status:known?error.status:503,headers:noCache});
}
export function personalMultipartOk(result: Record<string,unknown>, status = 200) {
  return NextResponse.json(result,{status,headers:noCache});
}
export function multipartPartNumber(text: string) {
  const part = Number(text);
  if (!/^\d{1,5}$/.test(text) || !Number.isInteger(part) || part < 1 || part > 10000) {
    throw new DimproIdentityError("Érvénytelen fájlrész-azonosító.",
      "PERSONAL_MULTIPART_PART_INVALID",400);
  }
  return part;
}
