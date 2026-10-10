import { latestDueDigestSlot, type DigestFrequency, type IsWorkingDay } from "./scheduling";
import type { DigestCategory } from "./digestCore";

export type DigestSchedulerSubscription = {
  projectId: string;
  userId: string;
  category: DigestCategory;
  enabled: boolean;
  frequency: DigestFrequency;
};

export type DigestScheduledCandidate = {
  projectId: string;
  userId: string;
  category: DigestCategory;
  scheduledSlot: string;
  scheduledAt: string;
  latenessMinutes: number;
};

export type DigestSchedulerPlan = {
  candidates: DigestScheduledCandidate[];
  examined: number;
  disabled: number;
  notDue: number;
  duplicates: number;
  truncated: boolean;
};

/** Pure planning only. No DB write, no SMTP send, no access to recipient content.
 * One iteration is bounded to keep catch-up tasks out of a run-away job.
 * The delivery producer MUST independently verify all active account, ACL and opt-in rules.
 */
export function planDigestScheduler(input: {
  subscriptions: readonly DigestSchedulerSubscription[];
  now: Date;
  isWorkingDay?: IsWorkingDay;
  maxCandidates?: number;
}): DigestSchedulerPlan {
  if (!Number.isFinite(input.now.getTime())) throw new Error("DIGEST_SCHEDULER_INVALID_NOW");
  const limit = input.maxCandidates ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("DIGEST_SCHEDULER_INVALID_BATCH_LIMIT");
  }
  // Fail closed on incomplete, unbounded cursors, or a potentially inconsistent fetch.
  if (input.subscriptions.length > 2000) throw new Error("DIGEST_SCHEDULER_PAGE_TOO_LARGE");
  let disabled = 0, notDue = 0, duplicates = 0;
  const keys = new Set<string>();
  const candidates: DigestScheduledCandidate[] = [];
  let truncated = false;
  for (const subscription of input.subscriptions) {
    if (!subscription.projectId || !subscription.userId
      || !["DOCUMENT_CHANGES", "APPROVAL_DECISIONS"].includes(subscription.category)) {
      throw new Error("DIGEST_SCHEDULER_INVALID_SUBSCRIPTION");
    }
    if (!subscription.enabled || subscription.frequency === "NONE") {
      disabled++;
      continue;
    }
    const due = latestDueDigestSlot(subscription.frequency, input.now, input.isWorkingDay);
    if (!due) { notDue++; continue; }
    const key = [subscription.projectId, subscription.userId, subscription.category, due.slot].join("\u0000");
    if (keys.has(key)) { duplicates++; continue; }
    keys.add(key);
    if (candidates.length >= limit) { truncated = true; continue; }
    candidates.push({
      projectId: subscription.projectId,
      userId: subscription.userId,
      category: subscription.category,
      scheduledSlot: due.slot,
      scheduledAt: due.scheduledAt.toISOString(),
      latenessMinutes: due.latenessMinutes,
    });
  }
  return {
    candidates,
    examined: input.subscriptions.length,
    disabled, notDue, duplicates, truncated,
  };
}
