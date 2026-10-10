import type { DriveChangeEvent } from "@/app/lib/drive-core/types";

export type ClippedJournalPage = {changes:DriveChangeEvent[];hasMore:boolean;deferredRows:number};

/** A historical scheduled slot must not swallow events created after its actual due time.
 * Keep the source sequence order intact and stop at the first future row.
 */
export function clipJournalAtScheduledTime(input:{
  rows:readonly DriveChangeEvent[];
  hasMore:boolean;
  scheduledAt:Date;
}):ClippedJournalPage{
  const cutoff=input.scheduledAt.getTime();
  if(!Number.isFinite(cutoff))throw Error("DIGEST_INVALID_SCHEDULED_CUTOFF");
  let count=0;
  for(const event of input.rows){
    const created=Date.parse(event.createdAt);
    if(!Number.isFinite(created))throw Error("DIGEST_JOURNAL_TIME_INVALID");
    if(created>cutoff)break;
    count++;
  }
  const rows=input.rows.slice(0,count);
  return {changes:[...rows],hasMore:count===input.rows.length && input.hasMore,
    deferredRows:input.rows.length-count};
}
