import { timingSafeEqual } from "node:crypto";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function isDevCenterAuthorized(headers: Headers, allowReporter = false) {
  if (await isLicenseAdminAuthorized(headers)) return true;
  if (!allowReporter) return false;

  const configured = process.env.DIMPRO_DEV_REPORTER_KEY?.trim();
  if (!configured) return false;

  const direct = headers.get("x-dimpro-dev-reporter-key")?.trim();
  const authorization = headers.get("authorization")?.trim();
  const bearer = authorization?.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const supplied = direct || bearer;
  return Boolean(supplied && safeEqual(supplied, configured));
}
