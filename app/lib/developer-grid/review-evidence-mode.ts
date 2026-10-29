import type { GridEvidence } from "./types";

const modes=new Set(["VGUARD_EXTERNAL","INTERNAL_REVIEW_FALLBACK","INTERNAL_BASELINE_VALIDATION"]);
export function resolveDeveloperGridReviewMode(review:GridEvidence|null,evidence:GridEvidence[]) {
  if(!review) return null;
  const explicit=review.attributes.reviewMode;
  if(explicit) return modes.has(explicit)?explicit:"REVIEW_MODE_UNVERIFIED";
  const reviewId=review.attributes.reviewId;
  if(!reviewId) return "REVIEW_MODE_UNVERIFIED";
  const matching=new Set(evidence.filter(item=>item.kind==="REVIEW" && item.taskId===review.taskId && item.sessionId===review.sessionId && item.workerCode===review.workerCode && item.head===review.head && item.attributes.reviewId===reviewId).map(item=>item.attributes.reviewMode).filter((mode):mode is string=>Boolean(mode && modes.has(mode))));
  return matching.size===1?[...matching][0]:"REVIEW_MODE_UNVERIFIED";
}
