import * as file from "./dropPublicFileRepository";
import * as postgres from "./dropPublicPostgresRepository";
import type { DropPackageWorkflowRecord, DropPublicWorkflowType, DropSendCodeSafeRecord } from "./dropPublicTypes";
import {
  getDropSendEntitlementProfile,
  listDropSendEntitlementProfiles,
  normalizeDropSendEntitlementProfileInput,
  saveDropSendEntitlementProfile,
} from "./dropSendEntitlementProfileStore";
import {
  getDropPublicStoreStatus,
  migrateDropPublicFileStoreToPostgres,
  resolveDropPublicStore,
} from "./dropPublicStoreResolver";

export {
  DropPublicRepositoryError,
  formatDropPublicCode,
  getDropPublicDefaults,
  getDropPublicFileStateForMigration,
  getDropPublicFileStoreSummary,
  getDropPublicRequestContext,
  normalizeDropDownloadProtection,
  normalizeDropPublicCode,
} from "./dropPublicFileRepository";
export { getDropPublicStoreStatus, migrateDropPublicFileStoreToPostgres } from "./dropPublicStoreResolver";

async function isPostgresStore() { return (await resolveDropPublicStore()) === "postgresql"; }

async function attachSendEntitlement<T extends DropSendCodeSafeRecord>(record: T): Promise<T> {
  const entitlement = await getDropSendEntitlementProfile(record.id).catch(() => null);
  return { ...record, entitlement } as T;
}

async function attachSendEntitlements<T extends DropSendCodeSafeRecord>(records: T[]): Promise<T[]> {
  const profiles = await listDropSendEntitlementProfiles().catch(() => []);
  const byCodeId = new Map(profiles.map((profile) => [profile.sendCodeId, profile]));
  return records.map((record) => ({ ...record, entitlement: byCodeId.get(record.id) || null } as T));
}

export async function getDropPublicStateSafe() {
  const status = await getDropPublicStoreStatus();
  const state = status.activeStore === "postgresql"
    ? await postgres.getDropPublicPostgresStateSafe()
    : await file.getDropPublicStateSafe();
  return {
    ...state,
    store: {
      version: status.version,
      activeStore: status.activeStore,
      requestedMode: status.requestedMode,
      schemaReady: status.schemaReady,
      databaseActivated: status.databaseActivated,
      migrationRequired: status.migrationRequired,
      failClosed: status.failClosed,
      reason: status.reason,
      fileCounts: status.file.counts,
      postgresCounts: status.postgresCounts,
      sqlBootstrapPath: status.sqlBootstrapPath,
      multiInstanceReady: status.activeStore === "postgresql" && status.schemaReady,
    },
  };
}

export async function createDropSendCode(input: Record<string, unknown>, actor: string) {
  const created = (await isPostgresStore()) ? await postgres.createDropSendCode(input, actor) : await file.createDropSendCode(input, actor);
  const entitlementRequested = Boolean(input.licenseId || input.userFullName || input.userEmail);
  if (!entitlementRequested) return created;
  try {
    const profile = await normalizeDropSendEntitlementProfileInput(created.record.id, input);
    await saveDropSendEntitlementProfile(profile);
    return { ...created, record: { ...created.record, entitlement: profile } };
  } catch (error) {
    await ((await isPostgresStore())
      ? postgres.setDropSendCodeStatus(created.record.id, "revoked")
      : file.setDropSendCodeStatus(created.record.id, "revoked")).catch(() => undefined);
    throw error;
  }
}
export async function listDropSendCodes() {
  const records = (await isPostgresStore()) ? await postgres.listDropSendCodes() : await file.listDropSendCodes();
  return attachSendEntitlements(records);
}
export async function getDropSendCodeById(id: string) {
  const record = (await isPostgresStore()) ? await postgres.getDropSendCodeById(id) : await file.getDropSendCodeById(id);
  return attachSendEntitlement(record);
}
export async function setDropSendCodeStatus(id: string, status: "active" | "revoked") {
  return (await isPostgresStore()) ? postgres.setDropSendCodeStatus(id, status) : file.setDropSendCodeStatus(id, status);
}
export async function verifyDropSendCode(rawCode: unknown) {
  const record = (await isPostgresStore()) ? await postgres.verifyDropSendCode(rawCode) : await file.verifyDropSendCode(rawCode);
  return attachSendEntitlement(record);
}
export async function createDropSubmissionGate(input: Record<string, unknown>, actor: string) {
  return (await isPostgresStore()) ? postgres.createDropSubmissionGate(input, actor) : file.createDropSubmissionGate(input, actor);
}
export async function listDropSubmissionGates() {
  return (await isPostgresStore()) ? postgres.listDropSubmissionGates() : file.listDropSubmissionGates();
}
export async function getDropSubmissionGateBySlug(slug: string) {
  return (await isPostgresStore()) ? postgres.getDropSubmissionGateBySlug(slug) : file.getDropSubmissionGateBySlug(slug);
}
export async function getDropSubmissionGateById(id: string) {
  return (await isPostgresStore()) ? postgres.getDropSubmissionGateById(id) : file.getDropSubmissionGateById(id);
}
export async function setDropSubmissionGateStatus(id: string, status: "active" | "revoked") {
  return (await isPostgresStore()) ? postgres.setDropSubmissionGateStatus(id, status) : file.setDropSubmissionGateStatus(id, status);
}
export async function createDropPublicSession(input: {
  workflowType: DropPublicWorkflowType;
  sendCodeId?: string | null;
  dimproSendEntitlementId?: string | null;
  gateId?: string | null;
  headers: Headers;
}) {
  return (await isPostgresStore()) ? postgres.createDropPublicSession(input) : file.createDropPublicSession(input);
}
export async function resolveDropPublicSession(rawToken: string, headers: Headers, expected?: DropPublicWorkflowType, allowBoundContextRebind = false) {
  return (await isPostgresStore())
    ? postgres.resolveDropPublicSession(rawToken, headers, expected, allowBoundContextRebind)
    : file.resolveDropPublicSession(rawToken, headers, expected, allowBoundContextRebind);
}
export async function bindDropPublicSessionPackage(rawToken: string, packageId: string, reservedBytes: number) {
  return (await isPostgresStore()) ? postgres.bindDropPublicSessionPackage(rawToken, packageId, reservedBytes) : file.bindDropPublicSessionPackage(rawToken, packageId, reservedBytes);
}
export async function saveDropPackageWorkflow(input: Omit<DropPackageWorkflowRecord, "createdAt" | "updatedAt">) {
  return (await isPostgresStore()) ? postgres.saveDropPackageWorkflow(input) : file.saveDropPackageWorkflow(input);
}
export async function getDropPackageWorkflow(packageId: string) {
  return (await isPostgresStore()) ? postgres.getDropPackageWorkflow(packageId) : file.getDropPackageWorkflow(packageId);
}
export async function updateDropPackageWorkflow(packageId: string, patch: Partial<DropPackageWorkflowRecord>) {
  return (await isPostgresStore()) ? postgres.updateDropPackageWorkflow(packageId, patch) : file.updateDropPackageWorkflow(packageId, patch);
}
export async function claimDropPackageFinalization(packageId: string) {
  return (await isPostgresStore()) ? postgres.claimDropPackageFinalization(packageId) : file.claimDropPackageFinalization(packageId);
}

export async function recordDropIdentityAccountingAtomic(packageId: string, metadata: Record<string, unknown> = {}) {
  if (!(await isPostgresStore())) {
    throw Object.assign(new Error("A központi DIMPRO Send-elszámolás PostgreSQL workflow-tárat igényel."), { code: "DROP_IDENTITY_ACCOUNTING_POSTGRES_REQUIRED", status: 503 });
  }
  return postgres.recordDropIdentityAccountingAtomic(packageId, metadata);
}

export async function runDropPublicStoreMigration() {
  return migrateDropPublicFileStoreToPostgres();
}
