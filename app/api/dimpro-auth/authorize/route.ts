import { NextRequest, NextResponse } from "next/server";
import { createAuthorizationRequest, getAuthSessionByToken, issueAuthorizationCodeFromRequest } from "@/app/lib/dimpro-auth/repository";
import { createAuthorizationCode } from "@/app/lib/dimpro-auth/sso";
import { DIMPRO_AUTH_SESSION_COOKIE, getDimproAuthRequestIp, getDimproAuthUserAgent, newDimproAuthCorrelationId } from "@/app/lib/dimpro-auth/security";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isCentralAuthHost(hostValue: string | null) {
  const host = (hostValue || "").toLowerCase().replace(/:\d+$/, "");
  return host === "auth.dev.dimpro.hu" || host === "auth.dimpro.hu" || host === "localhost" || host === "127.0.0.1";
}

function validState(value: string) {
  return /^[A-Za-z0-9_-]{32,200}$/.test(value);
}
function validPkceChallenge(value: string) {
  return /^[A-Za-z0-9_-]{43,128}$/.test(value);
}
function validRequestId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!isCentralAuthHost(request.headers.get("host"))) {
    return NextResponse.json({ ok: false, error: "AUTH_HOST_NOT_ALLOWED", correlationId }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  try {
    let requestId = request.nextUrl.searchParams.get("request_id")?.trim() || "";
    if (!requestId) {
      const clientId = request.nextUrl.searchParams.get("client_id")?.trim() || "";
      const redirectUri = request.nextUrl.searchParams.get("redirect_uri")?.trim() || "";
      const responseType = request.nextUrl.searchParams.get("response_type")?.trim() || "";
      const state = request.nextUrl.searchParams.get("state")?.trim() || "";
      const codeChallenge = request.nextUrl.searchParams.get("code_challenge")?.trim() || "";
      const method = request.nextUrl.searchParams.get("code_challenge_method")?.trim() || "";
      if (responseType !== "code" || !validState(state) || !validPkceChallenge(codeChallenge) || method !== "S256") {
        throw new DimproAuthError("Invalid authorization request parameters.", "AUTH_SSO_REQUEST_INVALID", 400, "A belépési kérés paraméterei érvénytelenek.");
      }
      const created = await createAuthorizationRequest({
        clientId,
        redirectUri,
        state,
        codeChallenge,
        ip: getDimproAuthRequestIp(request.headers),
        userAgent: getDimproAuthUserAgent(request.headers),
      });
      requestId = created.requestId;
    } else if (!validRequestId(requestId)) {
      throw new DimproAuthError("Invalid authorization request id.", "AUTH_SSO_REQUEST_INVALID", 400, "A belépési kérés érvénytelen.");
    }

    const authToken = request.cookies.get(DIMPRO_AUTH_SESSION_COOKIE)?.value?.trim() || "";
    const session = authToken ? await getAuthSessionByToken(authToken, true) : null;
    if (!session) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("ar", requestId);
      return NextResponse.redirect(loginUrl);
    }

    const rawCode = createAuthorizationCode();
    const issued = await issueAuthorizationCodeFromRequest({ requestId, authSession: session, rawCode, correlationId });
    const callback = new URL(issued.redirectUri);
    callback.searchParams.set("code", rawCode);
    callback.searchParams.set("state", issued.state);
    return NextResponse.redirect(callback);
  } catch (error) {
    const status = error instanceof DimproAuthError ? error.status : 503;
    const message = error instanceof DimproAuthError ? error.publicMessage : "A központi belépési szolgáltatás jelenleg nem érhető el.";
    return NextResponse.json({ ok: false, error: message, correlationId }, { status, headers: { "cache-control": "no-store" } });
  }
}
