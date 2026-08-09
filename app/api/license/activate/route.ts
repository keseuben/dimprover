import { NextRequest, NextResponse } from "next/server";
import { appendLicenseAuditLog, getClientIp } from "@/app/lib/license/audit";
import { getRateLimitRetryAfterSeconds, checkLicenseRateLimit } from "@/app/lib/license/rate-limit";
import {
  activateLicense,
  getHttpStatusForLicenseResponse,
  parseActivateLicenseRequest,
} from "@/app/lib/license/service";
import type { LicenseErrorResponse } from "@/app/lib/license/types";
import { readLicenseStore } from "@/app/lib/license/store";
import { sendLicenseActivationEmails } from "@/app/lib/license/activation-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const ACTIVATE_RATE_LIMIT = 20;

function rateLimitResponse(retryAfterSeconds: number) {
  const response: LicenseErrorResponse = {
    ok: false,
    status: "invalid",
    errorCode: "RATE_LIMITED",
    message: "Túl sok licencaktiválási próbálkozás. Kérjük, próbálja újra később.",
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
    `activate:${ipAddress}`,
    ACTIVATE_RATE_LIMIT,
    RATE_LIMIT_WINDOW_MS,
  );

  if (!rateLimit.allowed) {
    await appendLicenseAuditLog({
      action: "rate-limit",
      ipAddress,
      note: "activate endpoint",
    });
    return rateLimitResponse(getRateLimitRetryAfterSeconds(rateLimit.resetAt));
  }

  const parsed = parseActivateLicenseRequest(
    await request.json().catch(() => null),
  );

  if ("errorCode" in parsed) {
    await appendLicenseAuditLog({
      action: "activate",
      ipAddress,
      response: parsed,
      note: "invalid request",
    });
    return NextResponse.json(parsed, {
      status: getHttpStatusForLicenseResponse(parsed),
      headers: { "cache-control": "no-store" },
    });
  }

  const beforeStore = await readLicenseStore();
  const existingLicense = beforeStore.licenses.find(
    (license) => license.licenseKey === parsed.licenseKey,
  );
  const alreadyActivated = existingLicense
    ? beforeStore.devices.some(
        (device) =>
          device.licenseId === existingLicense.id &&
          device.machineIdHash === parsed.machineIdHash &&
          device.appId === parsed.appId,
      )
    : false;

  const response = await activateLicense(parsed);
  await appendLicenseAuditLog({
    action: "activate",
    ipAddress,
    licenseKey: parsed.licenseKey,
    machineIdHash: parsed.machineIdHash,
    appId: parsed.appId,
    appVersion: parsed.appVersion,
    response,
  });

  if (response.ok && !alreadyActivated) {
    try {
      const afterStore = await readLicenseStore();
      const activatedLicense = afterStore.licenses.find(
        (license) => license.licenseKey === parsed.licenseKey,
      );
      const activatedDevice = activatedLicense
        ? afterStore.devices.find(
            (device) =>
              device.licenseId === activatedLicense.id &&
              device.machineIdHash === parsed.machineIdHash &&
              device.appId === parsed.appId,
          )
        : undefined;

      if (activatedLicense && activatedDevice) {
        const activeDeviceCount = afterStore.devices.filter(
          (device) =>
            device.licenseId === activatedLicense.id &&
            device.status === "active",
        ).length;
        await sendLicenseActivationEmails({
          license: activatedLicense,
          device: activatedDevice,
          request: parsed,
          activeDeviceCount,
          ipAddress,
        });
      }
    } catch (error) {
      console.error("DIMPRO licencaktiválási e-mail küldési hiba", error);
    }
  }

  return NextResponse.json(response, {
    status: getHttpStatusForLicenseResponse(response),
    headers: { "cache-control": "no-store" },
  });
}
