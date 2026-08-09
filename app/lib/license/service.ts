import { randomUUID } from "node:crypto";
import { signLicenseToken } from "./crypto";
import { readLicenseStore, writeLicenseStore } from "./store";
import type {
  ActivateLicenseRequest,
  CheckLicenseRequest,
  LicenseApiResponse,
  LicenseDeviceRecord,
  LicenseErrorResponse,
  LicenseRecord,
  LicenseState,
  LicenseStatus,
  LicenseTokenPayload,
} from "./types";

const DEFAULT_OFFLINE_GRACE_DAYS = 7;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRequiredString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length === value.length ? items : null;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getOfflineGraceDays() {
  const raw = Number(process.env.DIMPRO_LICENSE_OFFLINE_GRACE_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_OFFLINE_GRACE_DAYS;
}

function makeError(
  status: LicenseStatus,
  errorCode: string,
  message: string,
): LicenseErrorResponse {
  return { ok: false, status, errorCode, message, licenseState: null };
}

export function getHttpStatusForLicenseResponse(response: LicenseApiResponse) {
  if (response.ok) return 200;

  switch (response.status) {
    case "invalid":
      return 404;
    case "device_limit":
      return 409;
    case "blocked":
    case "archived":
      return 403;
    case "expired":
      return 402;
    case "pending":
      return 423;
    default:
      return 400;
  }
}

export function parseActivateLicenseRequest(
  value: unknown,
): ActivateLicenseRequest | LicenseErrorResponse {
  if (!isRecord(value)) {
    return makeError("invalid", "INVALID_REQUEST", "Érvénytelen aktiválási kérés.");
  }

  const licenseKey = asRequiredString(value.licenseKey);
  const machineIdHash = asRequiredString(value.machineIdHash);
  const appId = asRequiredString(value.appId);
  const appVersion = asRequiredString(value.appVersion);
  const requestedModules = asStringArray(value.requestedModules);

  if (!licenseKey || !machineIdHash || !appId || !appVersion || !requestedModules) {
    return makeError(
      "invalid",
      "MISSING_REQUIRED_FIELDS",
      "Hiányzó vagy hibás aktiválási mezők.",
    );
  }

  return { licenseKey, machineIdHash, appId, appVersion, requestedModules };
}

export function parseCheckLicenseRequest(
  value: unknown,
): CheckLicenseRequest | LicenseErrorResponse {
  if (!isRecord(value)) {
    return makeError("invalid", "INVALID_REQUEST", "Érvénytelen licencellenőrzési kérés.");
  }

  const licenseKey = asRequiredString(value.licenseKey);
  const machineIdHash = asRequiredString(value.machineIdHash);
  const appId = asRequiredString(value.appId);
  const appVersion = asRequiredString(value.appVersion);
  const currentToken =
    typeof value.currentToken === "string" && value.currentToken.trim().length > 0
      ? value.currentToken.trim()
      : undefined;

  if (!licenseKey || !machineIdHash || !appId || !appVersion) {
    return makeError(
      "invalid",
      "MISSING_REQUIRED_FIELDS",
      "Hiányzó vagy hibás licencellenőrzési mezők.",
    );
  }

  return { licenseKey, machineIdHash, appId, appVersion, currentToken };
}

function resolveLicenseStatus(license: LicenseRecord, now: Date): LicenseStatus {
  if (license.status === "blocked") return "blocked";
  if (license.status === "pending") return "pending";
  if (license.status === "expired") return "expired";
  if (license.status === "archived") return "archived";

  const startsAt = new Date(license.startsAt);
  const expiresAt = new Date(license.expiresAt);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    return "invalid";
  }
  if (startsAt.getTime() > now.getTime()) return "pending";
  if (expiresAt.getTime() <= now.getTime()) return "expired";

  return license.status === "trial" ? "trial" : "active";
}

function messageForStatus(status: LicenseStatus) {
  switch (status) {
    case "blocked":
      return makeError("blocked", "LICENSE_BLOCKED", "A licenc tiltott állapotban van.");
    case "expired":
      return makeError("expired", "LICENSE_EXPIRED", "A licenc lejárt.");
    case "pending":
      return makeError("pending", "LICENSE_PENDING", "A licenc jóváhagyásra vagy aktiválásra vár.");
    case "archived":
      return makeError("archived", "LICENSE_ARCHIVED", "A licenc archivált állapotban van.");
    case "device_limit":
      return makeError(
        "device_limit",
        "DEVICE_LIMIT_REACHED",
        "A licenchez tartozó engedélyezett gépszám betelt.",
      );
    default:
      return makeError("invalid", "LICENSE_INVALID", "A licenc nem érvényes.");
  }
}

function createLicenseState(
  license: LicenseRecord,
  device: LicenseDeviceRecord,
  status: "active" | "trial",
): LicenseState {
  return {
    licenseKey: license.licenseKey,
    companyId: license.companyId,
    companyName: license.companyName,
    machineIdHash: device.machineIdHash,
    activatedAt: device.firstActivatedAt,
    expiresAt: license.expiresAt,
    lastOnlineCheckAt: device.lastOnlineCheckAt,
    offlineGraceUntil: device.offlineGraceUntil,
    enabledModules: license.enabledModules,
    maxDevices: license.maxDevices,
    status,
  };
}

async function createSignedResponse(
  request: Pick<CheckLicenseRequest, "appId" | "appVersion" | "machineIdHash">,
  license: LicenseRecord,
  device: LicenseDeviceRecord,
  status: "active" | "trial",
): Promise<LicenseApiResponse> {
  const issuedAt = new Date().toISOString();
  const licenseState = createLicenseState(license, device, status);
  const tokenPayload: LicenseTokenPayload = {
    licenseKey: license.licenseKey,
    companyId: license.companyId,
    machineIdHash: request.machineIdHash,
    appId: request.appId,
    appVersion: request.appVersion,
    enabledModules: license.enabledModules,
    status,
    issuedAt,
    expiresAt: license.expiresAt,
    offlineGraceUntil: device.offlineGraceUntil,
  };

  return {
    ok: true,
    status,
    token: await signLicenseToken(tokenPayload),
    licenseState,
  };
}

async function activateOrCheckLicense(
  request: ActivateLicenseRequest | CheckLicenseRequest,
) {
  const store = await readLicenseStore();
  const now = new Date();
  const nowIso = now.toISOString();
  const offlineGraceUntil = addDays(now, getOfflineGraceDays()).toISOString();

  const licenseIndex = store.licenses.findIndex(
    (item) => item.licenseKey === request.licenseKey,
  );
  if (licenseIndex === -1) {
    return makeError("invalid", "LICENSE_NOT_FOUND", "A megadott licenckulcs nem található.");
  }

  const license = store.licenses[licenseIndex];
  const resolvedStatus = resolveLicenseStatus(license, now);
  if (resolvedStatus !== "active" && resolvedStatus !== "trial") {
    return messageForStatus(resolvedStatus);
  }

  let deviceIndex = store.devices.findIndex(
    (item) =>
      item.licenseId === license.id &&
      item.machineIdHash === request.machineIdHash &&
      item.appId === request.appId,
  );

  if (deviceIndex !== -1 && store.devices[deviceIndex].status === "blocked") {
    return makeError(
      "blocked",
      "DEVICE_BLOCKED",
      "Ez a gép tiltott állapotban van ehhez a licenchez.",
    );
  }

  if (deviceIndex === -1) {
    const activeDeviceCount = store.devices.filter(
      (item) => item.licenseId === license.id && item.status === "active",
    ).length;

    if (activeDeviceCount >= license.maxDevices) {
      return messageForStatus("device_limit");
    }

    store.devices.push({
      id: `dev-${randomUUID()}`,
      licenseId: license.id,
      machineIdHash: request.machineIdHash,
      appId: request.appId,
      firstActivatedAt: nowIso,
      lastOnlineCheckAt: nowIso,
      offlineGraceUntil,
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    deviceIndex = store.devices.length - 1;
  } else {
    store.devices[deviceIndex] = {
      ...store.devices[deviceIndex],
      lastOnlineCheckAt: nowIso,
      offlineGraceUntil,
      updatedAt: nowIso,
    };
  }

  store.licenses[licenseIndex] = {
    ...license,
    status: resolvedStatus,
    updatedAt: nowIso,
  };

  await writeLicenseStore(store);

  return createSignedResponse(
    request,
    store.licenses[licenseIndex],
    store.devices[deviceIndex],
    resolvedStatus,
  );
}

export async function activateLicense(request: ActivateLicenseRequest) {
  return activateOrCheckLicense(request);
}

export async function checkLicense(request: CheckLicenseRequest) {
  return activateOrCheckLicense(request);
}
