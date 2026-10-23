/**
 * DIMPRO Drive personal pilot isolation V0.9.63.
 *
 * A read-only release gate: config labels, DEV hostname or an .env flag alone
 * cannot prove a bucket/database is separate from production. Evidence must
 * come from an independently approved inventory (never the running env).
 *
 * This function authorizes no writes. Human-controlled DEV pilot activation,
 * S3/DB permissions and E2E remain separate gates.
 */
export type PersonalPilotEnvironment = {
  productionAccess: string | undefined;
  authEnvironment: string | undefined;
  personalUploadEnabled: string | undefined;
  storageMode: string | undefined;
  storageEndpoint: string | undefined;
  storageBucket: string | undefined;
  storageRegion: string | undefined;
  storageAccessKeyPresent: boolean;
  storageSecretKeyPresent: boolean;
  databaseUrl: string | undefined;
  databaseServiceKeyPresent: boolean;
  maxUploadMiB: number | undefined;
};

export type PersonalPilotIndependentEvidence = {
  approvalId: string;
  independentlyVerified: boolean;
  approvedDevStorageEndpoint: string;
  approvedDevBucket: string;
  approvedDevDatabaseUrl: string;
  productionStorageBucket: string;
  productionDatabaseUrl: string;
  dedicatedSyntheticTestUser: boolean;
  approvedSyntheticObjectPrefix: string;
};

export type PersonalPilotIsolationFinding =
  | "PROD_ACCESS_NOT_DENIED" | "AUTH_NOT_DEV" | "PERSONAL_UPLOAD_NOT_ENABLED"
  | "S3_NOT_ACTIVE" | "S3_CONNECTION_INCOMPLETE"
  | "DB_CONNECTION_INCOMPLETE" | "UPLOAD_CAP_UNSAFE"
  | "INDEPENDENT_EVIDENCE_MISSING" | "APPROVAL_NOT_VERIFIED"
  | "PRODUCTION_STORAGE_NOT_SEPARATED" | "PRODUCTION_DATABASE_NOT_SEPARATED"
  | "STORAGE_NOT_ATTESTED" | "DATABASE_NOT_ATTESTED"
  | "SYNTHETIC_IDENTITY_MISSING" | "SYNTHETIC_PREFIX_INVALID";

function normalizedHttpsUrl(raw: string | undefined) {
  try {
    const parsed = new URL(raw || "");
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username
      || parsed.password || parsed.search || parsed.hash) return null;
    return parsed.href.replace(/\/$/, "");
  } catch { return null; }
}

function present(value: string | undefined) {
  return Boolean(value && value.trim());
}

export function assessPersonalPilotIsolation(
  env: PersonalPilotEnvironment,
  evidence: PersonalPilotIndependentEvidence | null,
): { eligibleForIsolatedE2E: boolean; findings: PersonalPilotIsolationFinding[] } {
  const findings: PersonalPilotIsolationFinding[] = [];
  const reject = (code: PersonalPilotIsolationFinding) => {
    if (!findings.includes(code)) findings.push(code);
  };
  if (env.productionAccess !== "DENY") reject("PROD_ACCESS_NOT_DENIED");
  if (env.authEnvironment !== "DEV") reject("AUTH_NOT_DEV");
  if (env.personalUploadEnabled !== "true") reject("PERSONAL_UPLOAD_NOT_ENABLED");
  if (env.storageMode !== "active") reject("S3_NOT_ACTIVE");
  const s3Endpoint = normalizedHttpsUrl(env.storageEndpoint);
  const databaseUrl = normalizedHttpsUrl(env.databaseUrl);
  if (!s3Endpoint || !present(env.storageBucket) || !present(env.storageRegion)
    || !env.storageAccessKeyPresent || !env.storageSecretKeyPresent) {
    reject("S3_CONNECTION_INCOMPLETE");
  }
  if (!databaseUrl || !env.databaseServiceKeyPresent) reject("DB_CONNECTION_INCOMPLETE");
  if (!Number.isSafeInteger(env.maxUploadMiB)
    || (env.maxUploadMiB ?? 0) < 100 || (env.maxUploadMiB ?? 0) > 100) {
    reject("UPLOAD_CAP_UNSAFE");
  }
  if (!evidence) {
    reject("INDEPENDENT_EVIDENCE_MISSING");
    return { eligibleForIsolatedE2E: false, findings };
  }
  if (!evidence.independentlyVerified || !/^DEV-(QA|PILOT)-[A-Z0-9-]{12,120}$/.test(evidence.approvalId)) {
    reject("APPROVAL_NOT_VERIFIED");
  }
  const expectedEndpoint = normalizedHttpsUrl(evidence.approvedDevStorageEndpoint);
  const expectedDb = normalizedHttpsUrl(evidence.approvedDevDatabaseUrl);
  const prodDb = normalizedHttpsUrl(evidence.productionDatabaseUrl);
  if (!present(evidence.productionStorageBucket)
    || evidence.productionStorageBucket === env.storageBucket
    || evidence.approvedDevBucket === evidence.productionStorageBucket) {
    reject("PRODUCTION_STORAGE_NOT_SEPARATED");
  }
  if (!prodDb || !databaseUrl || databaseUrl === prodDb
    || expectedDb === prodDb) {
    reject("PRODUCTION_DATABASE_NOT_SEPARATED");
  }
  if (!expectedEndpoint || !s3Endpoint || expectedEndpoint !== s3Endpoint
    || evidence.approvedDevBucket !== env.storageBucket) {
    reject("STORAGE_NOT_ATTESTED");
  }
  if (!expectedDb || !databaseUrl || expectedDb !== databaseUrl) {
    reject("DATABASE_NOT_ATTESTED");
  }
  if (!evidence.dedicatedSyntheticTestUser) reject("SYNTHETIC_IDENTITY_MISSING");
  if (!/^_dimpro_e2e\/personal\/[a-z0-9][a-z0-9-]{7,62}\/$/.test(evidence.approvedSyntheticObjectPrefix)) {
    reject("SYNTHETIC_PREFIX_INVALID");
  }
  return { eligibleForIsolatedE2E: findings.length === 0, findings };
}
