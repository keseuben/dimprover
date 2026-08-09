import { NextRequest, NextResponse } from "next/server";
import { appendLicenseAuditLog, getClientIp } from "@/app/lib/license/audit";
import { getRateLimitRetryAfterSeconds, checkLicenseRateLimit } from "@/app/lib/license/rate-limit";
import {
  checkLicense,
  getHttpStatusForLicenseResponse,
  parseCheckLicenseRequest,
} from "@/app/lib/license/service";
import type { LicenseErrorResponse } from "@/app/lib/license/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const CHECK_RATE_LIMIT = 120;

function rateLimitResponse(retryAfterSeconds: number) {
  const response: LicenseErrorResponse = {
    ok: false,
    status: "invalid",
    errorCode: "RATE_LIMITED",
    message: "Túl sok licencellenőrzési próbálkozás. Kérjük, próbálja újra később.",
    licenseState: null,
  };

  return NextResponse.json(response, {
    status: 429,
    headers: {
      "cache-control": "no-store",
      "retry-after": String(retryAfterSeconds),
    },
  });
}

export async function POST(request: NextRequest) {
  const ipAddress = getClientIp(request.headers);
  const rateLimit = checkLicenseRateLimit(
    `check:${ipAddress}`,
    CHECK_RATE_LIMIT,
    RATE_LIMIT_WINDOW_MS,
  );

  if (!rateLimit.allowed) {
    await appendLicenseAuditLog({
      action: "rate-limit",
      ipAddress,
      note: "check endpoint",
    });
    return rateLimitResponse(getRateLimitRetryAfterSeconds(rateLimit.resetAt));
  }

  const parsed = parseCheckLicenseRequest(await request.json().catch(() => null));

  if ("errorCode" in parsed) {
    await appendLicenseAuditLog({
      action: "check",
      ipAddress,
      response: parsed,
      note: "invalid request",
    });
    return NextResponse.json(parsed, {
      status: getHttpStatusForLicenseResponse(parsed),
      headers: { "cache-control": "no-store" },
    });
  }

  const response = await checkLicense(parsed);
  await appendLicenseAuditLog({
    action: "check",
    ipAddress,
    licenseKey: parsed.licenseKey,
    machineIdHash: parsed.machineIdHash,
    appId: parsed.appId,
    appVersion: parsed.appVersion,
    response,
  });

  return NextResponse.json(response, {
    status: getHttpStatusForLicenseResponse(response),
    headers: { "cache-control": "no-store" },
  });
}
