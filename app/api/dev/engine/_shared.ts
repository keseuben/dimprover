import { NextResponse } from "next/server";
import { DevCenterEngineError } from "@/app/lib/dev-center/engine-repository";
import { DevCenterOrchestrationError } from "@/app/lib/dev-center/orchestration-repository";
import { PartnerIsolationPolicyError } from "@/app/lib/dev-center/partner-isolation";

export function engineUnauthorized() {
  return NextResponse.json({ ok: false, error: "Nincs BENJADMIN Development Center jogosultság." }, { status: 401 });
}

export function engineErrorResponse(error: unknown) {
  if (error instanceof DevCenterEngineError || error instanceof DevCenterOrchestrationError || error instanceof PartnerIsolationPolicyError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code, details: error.details },
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Ismeretlen BENJADMIN engine hiba." },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}
