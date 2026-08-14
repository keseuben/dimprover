import { NextResponse } from "next/server";
import { WindowsBridgePairingError } from "./windows-bridge-pairing";

export function windowsBridgeApiError(error: unknown) {
  if (error instanceof WindowsBridgePairingError) return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ ok: false, code: "WINDOWS_BRIDGE_INTERNAL_ERROR", error: error instanceof Error ? error.message : "Windows Bridge hiba." }, { status: 500, headers: { "cache-control": "no-store" } });
}

export function bearerToken(headers: Headers) {
  const authorization = headers.get("authorization")?.trim() || "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}
