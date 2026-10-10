import type { DriveChangeEvent } from "@/app/lib/drive-core/types";
import type { DigestPagePlan } from "./producerPlanning";
import { planDigestJournalPage } from "./producerPlanning";
import type { DigestCategory } from "./digestCore";
import type { FollowNotificationFlags } from "./followPolicy";
import type { DigestFrequency } from "./scheduling";

export type JournalPage = { changes: DriveChangeEvent[]; hasMore: boolean };
export type JournalRegisterStatus =
  | {status:"ADVANCED";cursorTo:number}
  | {status:"RESERVED";deliveryId:string}
  | {status:"SLOT_ALREADY_RESERVED"|"CURSOR_CHANGED"|"OUTSTANDING_DELIVERY"|"CONSENT_REVOKED"};

export type ProducerScope = {
  projectId: string; userId: string; category: DigestCategory;
  digestFrequency: DigestFrequency; slot: string; cursorFrom: number;
  visibleDocumentIds: ReadonlySet<string>;
  approvalDocumentIds: ReadonlySet<string>;
  followedOnly: boolean; follows: readonly FollowNotificationFlags[];
};

export type ProducerIteration =
  | {status:"EMPTY";cursor:number;pages:number}
  | {status:"QUEUED";deliveryId:string;cursorFrom:number;cursorTo:number;pages:number}
  | {status:"BLOCKED";reason:string;cursor:number;pages:number}
  | {status:"BUDGET_EXHAUSTED";cursor:number;pages:number};

export async function prepareDigestJournalBatch(input: {
  scope: ProducerScope;
  read: (afterCursor:number)=>Promise<JournalPage>;
  commit: (plan:DigestPagePlan)=>Promise<JournalRegisterStatus>;
  maxPages?: number;
}):Promise<ProducerIteration>{
  const limit=Math.min(8,Math.max(1,Math.trunc(input.maxPages??4)));
  if(!Number.isSafeInteger(input.scope.cursorFrom)||input.scope.cursorFrom<0)throw Error("INVALID_INITIAL_CURSOR");
  let cursor=input.scope.cursorFrom;
  for(let index=0;index<limit;index++){
    const page=await input.read(cursor);
    const plan=planDigestJournalPage({
      projectId:input.scope.projectId,category:input.scope.category,
      recipientId:input.scope.userId,cursorFrom:cursor,
      journalPage:page.changes,hasMore:page.hasMore,
      visibleDocumentIds:input.scope.visibleDocumentIds,
      approvalDocumentIds:input.scope.approvalDocumentIds,
      followedOnly:input.scope.followedOnly,follows:input.scope.follows,
    });
    if(plan.action==="EMPTY"){
      // Inconsistent source must not silently mark a gap as processed.
      if(plan.hasMore)throw Error("JOURNAL_EMPTY_PAGE_WITH_HAS_MORE");
      return {status:"EMPTY",cursor,pages:index+1};
    }
    const result=await input.commit(plan);
    if(result.status==="RESERVED"){
      if(plan.action!=="RESERVE")throw Error("JOURNAL_REGISTER_UNEXPECTED_RESERVATION");
      return {status:"QUEUED",deliveryId:result.deliveryId,
        cursorFrom:plan.cursorFrom,cursorTo:plan.cursorTo,pages:index+1};
    }
    if(result.status!=="ADVANCED"){
      return {status:"BLOCKED",reason:result.status,cursor,pages:index+1};
    }
    if(plan.action!=="ADVANCE" || result.cursorTo!==plan.cursorTo)throw Error("JOURNAL_REGISTER_UNEXPECTED_ADVANCE");
    cursor=plan.cursorTo;
    if(!plan.hasMore)return {status:"EMPTY",cursor,pages:index+1};
  }
  return {status:"BUDGET_EXHAUSTED",cursor,pages:limit};
}
