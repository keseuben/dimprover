import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function resolveProjectRoot() {
  const cwd = process.cwd();
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;
  if (cwd.endsWith(standaloneSuffix)) return cwd.slice(0, -standaloneSuffix.length);
  return cwd;
}

const projectRoot = process.env.DIMPRO_PROJECT_ROOT ?? resolveProjectRoot();

const adminKeyFile = path.join(
  projectRoot,
  ".dimprover",
  "license",
  "admin-key.txt",
);

function createAdminKey() {
  return `DIMPRO-LICENSE-ADMIN-${randomBytes(24).toString("base64url")}`;
}

async function readOrCreateLocalAdminKey() {
  try {
    const existing = (await readFile(adminKeyFile, "utf8")).trim();
    if (existing.length >= 20) return existing;
  } catch {
    // Első admin felület használatkor még nincs helyi admin kulcs.
  }

  const nextKey = createAdminKey();
  await mkdir(path.dirname(adminKeyFile), { recursive: true });
  await writeFile(adminKeyFile, `${nextKey}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(adminKeyFile, 0o600).catch(() => undefined);
  return nextKey;
}

export async function getLicenseAdminKey() {
  const envKey = process.env.DIMPRO_LICENSE_ADMIN_KEY?.trim();
  if (envKey && envKey.length >= 20) return envKey;
  return readOrCreateLocalAdminKey();
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function isLicenseAdminAuthorized(headers: Headers) {
  const expectedKey = await getLicenseAdminKey();
  const directKey = headers.get("x-dimpro-license-admin-key")?.trim();
  const authHeader = headers.get("authorization")?.trim();
  const bearerKey = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : undefined;
  const receivedKey = directKey || bearerKey;

  if (!receivedKey) return false;
  return constantTimeEqual(receivedKey, expectedKey);
}

export function getLicenseAdminKeyFilePath() {
  return adminKeyFile;
}
