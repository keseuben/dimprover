import type { NextRequest } from "next/server";
import { DIMPRO_AUTH_SESSION_COOKIE } from "./security";

export function readDimproAuthSessionToken(request: NextRequest) {
  return request.cookies.get(DIMPRO_AUTH_SESSION_COOKIE)?.value?.trim() || "";
}
