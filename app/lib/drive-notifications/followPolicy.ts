import type { DigestItem } from "./digestCore";
import type { DigestFrequency } from "./scheduling";

export type FollowNotificationFlags = {
  documentId: string;
  notifyVersions: boolean;
  notifyRevisions: boolean;
  notifyApprovals: boolean;
  digestFrequency: DigestFrequency;
};

/**
 * The project/category digest frequency determines dispatch time.
 * Per-document frequency is retained as a future scheduler preference;
 * NONE is an effective opt-out immediately.
 */
export function filterFollowedDigestEvents(
  events: readonly DigestItem[],
  followedOnly: boolean,
  follows: readonly FollowNotificationFlags[],
): DigestItem[] {
  if (!followedOnly) return [...events];
  const indexed = new Map(follows.map((row) => [row.documentId,row]));
  return events.filter((event) => {
    const row=indexed.get(event.documentId);
    if (!row || row.digestFrequency==="NONE") return false;
    if (event.kind==="NEW_VERSION") return row.notifyVersions;
    if (event.kind==="NEW_REVISION") return row.notifyRevisions;
    if (event.kind==="NEW_DOCUMENT") return false;
    return row.notifyApprovals;
  });
}
