import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LicenseStore } from "./types";

const licenseDataRoot = process.env.DIMPRO_LICENSE_DATA_ROOT?.trim() || path.join(process.cwd(), ".dimprover");
const licenseDataFile = path.join(licenseDataRoot, "data", "license-store.json");

const LICENSE_RANDOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function getEnvNumber(name: string, fallback: number) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function generateRandomLicenseSegment(length: number) {
  const bytes = randomBytes(length);
  let value = "";

  for (let index = 0; index < length; index += 1) {
    value += LICENSE_RANDOM_ALPHABET[bytes[index] % LICENSE_RANDOM_ALPHABET.length];
  }

  return value;
}

export function generateDimproLicenseKey(companyShortCode = "HAGE", months = 6) {
  const normalizedCompany = companyShortCode
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12) || "CLIENT";
  const groups = Array.from({ length: 4 }, () => generateRandomLicenseSegment(4));

  return `DIMPRO-${normalizedCompany}-${months}M-${groups.join("-")}`;
}

function getBootstrapLicenseKey() {
  const configured = process.env.DIMPRO_LICENSE_BOOTSTRAP_KEY?.trim();
  if (configured) return configured;

  return generateDimproLicenseKey(
    process.env.DIMPRO_LICENSE_BOOTSTRAP_COMPANY_CODE ?? "HAGE",
    getEnvNumber("DIMPRO_LICENSE_BOOTSTRAP_MONTHS", 6),
  );
}

function createInitialLicenseStore(): LicenseStore {
  const now = new Date();
  const startsAt = now.toISOString();
  const licenseMonths = getEnvNumber("DIMPRO_LICENSE_BOOTSTRAP_MONTHS", 6);
  const expiresAt = addMonths(now, licenseMonths).toISOString();

  return {
    licenses: [
      {
        id: "lic-hage-invest-001",
        licenseKey: getBootstrapLicenseKey(),
        companyId: "hage-invest",
        companyName: "HAGE-INVEST Kft.",
        status: "active",
        startsAt,
        expiresAt,
        maxDevices: getEnvNumber("DIMPRO_LICENSE_BOOTSTRAP_MAX_DEVICES", 17),
        enabledModules: ["hage_workspace", "tasks", "vacations"],
        createdAt: startsAt,
        updatedAt: startsAt,
      },
    ],
    devices: [],
  };
}

function isLicenseStore(value: unknown): value is LicenseStore {
  if (!value || typeof value !== "object") return false;
  const store = value as Partial<LicenseStore>;
  return Array.isArray(store.licenses) && Array.isArray(store.devices);
}

export async function readLicenseStore() {
  try {
    const raw = await readFile(licenseDataFile, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (isLicenseStore(parsed)) return parsed;
  } catch {
    // Első induláskor még nincs licenc-adattár; létrehozzuk az induló HAGE licencet.
  }

  const initialStore = createInitialLicenseStore();
  await writeLicenseStore(initialStore);
  return initialStore;
}

export async function writeLicenseStore(store: LicenseStore) {
  await mkdir(path.dirname(licenseDataFile), { recursive: true });
  await writeFile(licenseDataFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function getLicenseDataFilePath() {
  return licenseDataFile;
}
