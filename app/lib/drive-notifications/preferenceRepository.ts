import "server-only";
import { getDatabaseClient } from "@/app/lib/drive-core/databaseRepository";
import { DriveCoreRepositoryError } from "@/app/lib/drive-core/errors";
import type { DigestCategory } from "./digestCore";
import type { DigestFrequency } from "./scheduling";

type DbRow = {
  project_id: string; user_id: string; category: DigestCategory; enabled: boolean;
  digest_frequency: DigestFrequency; followed_only: boolean; updated_at: string;
};
export type DriveDigestPreference = {
  category: DigestCategory; enabled: boolean; digestFrequency: DigestFrequency;
  followedOnly: boolean; updatedAt?: string;
};
export const DEFAULT_DIGEST_PREFERENCES: DriveDigestPreference[] = [
  { category:"DOCUMENT_CHANGES",enabled:false,digestFrequency:"DAILY",followedOnly:false },
  { category:"APPROVAL_DECISIONS",enabled:false,digestFrequency:"DAILY",followedOnly:false },
];

function fail(error: unknown): never {
  const code=(error as {code?:string} | null)?.code;
  const schemaMissing=code==="PGRST205" || code==="42P01";
  throw new DriveCoreRepositoryError(
    schemaMissing ? "Az értesítési beállítások adatbázissémája még nincs aktiválva." : "Az értesítési beállítások adatbázishibája.",
    schemaMissing ? "DRIVE_NOTIFICATION_SCHEMA_NOT_READY" : "DRIVE_NOTIFICATION_DB_ERROR",
    schemaMissing ? 503 : 500,
  );
}
function fromRow(row:DbRow): DriveDigestPreference {
  return {category:row.category,enabled:row.enabled,digestFrequency:row.digest_frequency,
    followedOnly:row.followed_only,updatedAt:row.updated_at};
}
export async function listDriveDigestPreferences(projectId:string,userId:string) {
  const {data,error}=await getDatabaseClient().from("drive_core_notification_preferences")
    .select("project_id,user_id,category,enabled,digest_frequency,followed_only,updated_at")
    .eq("project_id",projectId).eq("user_id",userId);
  if(error) fail(error);
  const rows=((data||[]) as DbRow[]).map(fromRow);
  return DEFAULT_DIGEST_PREFERENCES.map((fallback)=>rows.find((row)=>row.category===fallback.category) || fallback);
}
export async function updateDriveDigestPreference(projectId:string,userId:string,input:DriveDigestPreference) {
  const {error}=await getDatabaseClient().from("drive_core_notification_preferences").upsert({
    project_id:projectId,user_id:userId,category:input.category,enabled:input.enabled,
    digest_frequency:input.digestFrequency,followed_only:input.followedOnly,
    updated_at:new Date().toISOString(),
  },{onConflict:"project_id,user_id,category"});
  if(error) fail(error);
}
