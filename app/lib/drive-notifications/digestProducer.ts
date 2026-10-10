import "server-only";
import { authQuery } from "@/app/lib/dimpro-auth/db";
import { getProjectAccess } from "@/app/lib/project-core/store";
import { listDriveTreeForAccess, listDriveChanges } from "@/app/lib/drive-core/store";
import { listDriveDocumentFollows } from "@/app/lib/drive-core/followRepository";
import { getDatabaseClient } from "@/app/lib/drive-core/databaseRepository";
import type { DigestCategory } from "./digestCore";
import type { DigestFrequency, IsWorkingDay } from "./scheduling";
import { latestDueDigestSlot } from "./scheduling";
import { prepareDigestJournalBatch, type JournalRegisterStatus } from "./producerFlow";
import { clipJournalAtScheduledTime } from "./journalWindow";

type User = { id: string; email_normalized: string; status: string; login_enabled: boolean; email_verified_at: string|null };
type Pref = {
  project_id:string;user_id:string;category:DigestCategory;enabled:boolean;
  digest_frequency:DigestFrequency;followed_only:boolean;
  last_success_sequence:number|string;
};

export type DigestProducerResult =
  | {status:"DISABLED"|"NOT_DUE"|"NO_CONSENT"|"NO_ACTIVE_ACCESS"}
  | {status:"EMPTY"|"BUDGET_EXHAUSTED";cursor:number;pages:number}
  | {status:"BLOCKED";reason:string;cursor:number;pages:number}
  | {status:"QUEUED";deliveryId:string;cursorFrom:number;cursorTo:number;pages:number};

/** Code-review release latch: this module never modifies a DB until separately authorized. */
const PRODUCER_RELEASED: boolean = false;

export async function produceDigestForControlledWorker(input:{
  projectId:string;userId:string;category:DigestCategory;at:Date;
  isWorkingDay?:IsWorkingDay;
}):Promise<DigestProducerResult>{
  if(!PRODUCER_RELEASED || process.env.DIMPRO_DRIVE_DIGEST_QUEUE_ENABLED!=="true"
     || process.env.DIMPRO_DRIVE_DIGEST_EXECUTION_ENV!=="DEV"){
    return {status:"DISABLED"};
  }
  const database=getDatabaseClient();
  const {data:preferences,error:pError}=await database.from("drive_core_notification_preferences")
    .select("project_id,user_id,category,enabled,digest_frequency,followed_only,last_success_sequence")
    .eq("project_id",input.projectId).eq("user_id",input.userId).eq("category",input.category)
    .maybeSingle();
  if(pError)throw Error("DRIVE_DIGEST_PREFERENCES_UNAVAILABLE");
  const preference=preferences as Pref|null;
  if(!preference?.enabled || preference.digest_frequency==="NONE")return {status:"NO_CONSENT"};
  const due=latestDueDigestSlot(preference.digest_frequency,input.at,input.isWorkingDay);
  if(!due)return {status:"NOT_DUE"};
  const row=await authQuery<User>(`SELECT id::text,email_normalized,status,login_enabled,
    email_verified_at::text FROM public.auth_users WHERE id::text=$1`,[input.userId]);
  const user=row.rows[0];
  if(!user || user.status!=="ACTIVE" || !user.login_enabled || !user.email_verified_at){
    return {status:"NO_ACTIVE_ACCESS"};
  }
  const access=await getProjectAccess(input.projectId,[user.id,user.email_normalized]);
  if(!access || !access.permissions.includes("document.read")
    || (access.membership.userId.toLowerCase()!==user.id.toLowerCase()
      && access.membership.userId.toLowerCase()!==user.email_normalized.toLowerCase()
      && access.membership.email?.toLowerCase()!==user.email_normalized.toLowerCase())){
    return {status:"NO_ACTIVE_ACCESS"};
  }
  const tree=await listDriveTreeForAccess(input.projectId,access);
  const visibleIds=new Set(tree.documents.map((doc)=>doc.id));
  const followRows=preference.followed_only
    ? await listDriveDocumentFollows(input.projectId,input.userId):[];

  const result=await prepareDigestJournalBatch({
    scope:{
      projectId:input.projectId,userId:input.userId,category:input.category,
      digestFrequency:preference.digest_frequency,slot:due.slot,
      cursorFrom:Number(preference.last_success_sequence),
      visibleDocumentIds:visibleIds,
      approvalDocumentIds:access.permissions.includes("document.approve")?visibleIds:new Set(),
      followedOnly:preference.followed_only,
      follows:followRows,
    },
    read:async (cursor)=>{
      const page=await listDriveChanges(input.projectId,cursor,250);
      return clipJournalAtScheduledTime({
        rows:page.changes,hasMore:page.hasMore,scheduledAt:due.scheduledAt,
      });
    },
    commit:async (plan)=>{
      const {data,error}=await database.rpc("drive_digest_register_journal_page",{
        p_project_id:input.projectId,p_user_id:input.userId,
        p_category:input.category,p_frequency:preference.digest_frequency,
        p_slot:due.slot,p_cursor_from:plan.cursorFrom,p_cursor_to:plan.cursorTo,
        p_event_ids:plan.eventIds,
      });
      if(error)throw Error("DRIVE_DIGEST_CURSOR_COMMIT_UNAVAILABLE");
      if(!data || typeof data!=="object" || !("status" in data))throw Error("DRIVE_DIGEST_CURSOR_INVALID_ACK");
      return data as JournalRegisterStatus;
    },
  });
  return result;
}
