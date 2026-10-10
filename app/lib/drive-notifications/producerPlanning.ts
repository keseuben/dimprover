import type { DriveChangeEvent } from "@/app/lib/drive-core/types";
import type { DigestCategory, DigestItem } from "./digestCore";
import { buildRecipientDigest } from "./digestCore";
import { filterFollowedDigestEvents, type FollowNotificationFlags } from "./followPolicy";

/**
 * A digest page is deliberately bounded by journal rows, not by "interesting" events.
 * An eligible send holds the cursor pending SMTP acceptance. Empty pages may advance
 * without sending (via the transactionally guarded DB RPC, never by client mutation).
 */
export type DigestPagePlan = {
  cursorFrom: number;
  cursorTo: number;
  eventIds: string[];
  eligibleItems: DigestItem[];
  journalRows: number;
  hasMore: boolean;
  action: "EMPTY" | "ADVANCE" | "RESERVE";
};

export function planDigestJournalPage(input: {
  projectId: string;
  category: DigestCategory;
  cursorFrom: number;
  journalPage: readonly DriveChangeEvent[];
  hasMore: boolean;
  visibleDocumentIds: ReadonlySet<string>;
  approvalDocumentIds: ReadonlySet<string>;
  follows: readonly FollowNotificationFlags[];
  followedOnly: boolean;
  recipientId: string;
}): DigestPagePlan {
  if (!Number.isSafeInteger(input.cursorFrom) || input.cursorFrom < 0
    || input.journalPage.length > 250) throw new Error("DIGEST_PAGE_RANGE_INVALID");
  let previous = input.cursorFrom;
  const seen = new Set<string>();
  for (const event of input.journalPage) {
    if (event.projectId !== input.projectId || !Number.isSafeInteger(event.sequence)
      || event.sequence <= previous || !event.id || seen.has(event.id)) {
      throw new Error("DIGEST_PAGE_ORDER_OR_PROJECT_INVALID");
    }
    seen.add(event.id);
    previous = event.sequence;
  }
  const eligible = buildRecipientDigest(input.journalPage, {
    userId: input.recipientId,
    projectId: input.projectId,
    visibleDocumentIds: input.visibleDocumentIds,
    approvalDocumentIds: input.approvalDocumentIds,
    enabledCategories: new Set([input.category]),
  });
  const filtered = filterFollowedDigestEvents(eligible, input.followedOnly, input.follows);
  const cursorTo = input.journalPage.length ? previous : input.cursorFrom;
  return {
    cursorFrom: input.cursorFrom, cursorTo,
    eventIds: filtered.map((item) => item.eventId),
    eligibleItems: filtered,
    journalRows: input.journalPage.length,
    hasMore: input.hasMore,
    action: !input.journalPage.length ? "EMPTY" : filtered.length ? "RESERVE" : "ADVANCE",
  };
}
