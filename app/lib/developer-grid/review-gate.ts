"server-only";

import { getGridEvidenceSummary, listGridEvidence } from "./evidence";
import { readGridState } from "./state-store";
import { verifyCurrentSourceExecutionState } from "./source-provenance";
import type { GridEvidence, WorkerSession } from "./types";

export type DeveloperGridReviewGateTarget = "REVIEW" | "BUILD" | "CLOSURE";
export type DeveloperGridReviewGateCheck = { id: string; label: string; required: boolean; pass: boolean; detail: string; evidenceId?: string | null };

const terminalPass = new Set(["PASS", "PASS_WITH_NOTES"]);

function latestMatching(evidence: GridEvidence[], predicate: (item: GridEvidence) => boolean) {
  return evidence.find(predicate) || null;
}

function activeSession(sessions: WorkerSession[], taskId: string) {
  return sessions.find((item) => item.taskId === taskId && item.endedAt === null) || null;
}

export async function evaluateDeveloperGridReviewGate(input: { taskId?: string; target?: DeveloperGridReviewGateTarget } = {}) {
  const target = input.target === "BUILD" || input.target === "CLOSURE" ? input.target : "REVIEW";
  const state = await readGridState();
  const taskId = String(input.taskId || state.task?.id || "").trim();
  const checks: DeveloperGridReviewGateCheck[] = [];
  if (!taskId || !state.task || state.task.id !== taskId) {
    return { taskId: taskId || null, target, state: "BLOCKED" as const, ready: false, sourceHead: null, baseHead: null, workerCode: null, checks: [{ id:"TASK", label:"Authoritative task", required:true, pass:false, detail:"Nincs egyező authoritative aktív task." }], evidenceSummary: null, productionAccess:"DENY" as const };
  }
  const session = activeSession(state.sessions, taskId);
  checks.push({ id:"SESSION", label:"Aktív worker session", required:true, pass:Boolean(session), detail:session ? `${session.workerCode} · ${session.id}` : "Nincs aktív worker session." });
  if (!session) return { taskId, target, state:"BLOCKED" as const, ready:false, sourceHead:null, baseHead:null, workerCode:null, checks, evidenceSummary:null, productionAccess:"DENY" as const };

  const sourceHead = session.sourceProvenance.head;
  const baseHead = session.sourceProvenance.baseHead || sourceHead;
  const bootOk = session.developmentContext.bootAckState === "VALIDATED" && Boolean(session.developmentContext.bootAckValidatedAt);
  checks.push({ id:"BOOT_ACK", label:"BOOT ACK", required:true, pass:bootOk, detail:bootOk ? `VALIDATED · ${session.developmentContext.bootAckValidatedAt}` : `Állapot: ${session.developmentContext.bootAckState || "NINCS"}` });

  let sourceOk = session.sourceProvenance.sourceState === "VERIFIED" && !session.sourceProvenance.blockCode;
  let sourceDetail = sourceOk ? `HEAD ${sourceHead.slice(0,12)} · base ${baseHead.slice(0,12)}` : "Source provenance BLOCKED.";
  if (sourceOk) {
    try {
      const current = await verifyCurrentSourceExecutionState(session.sourceProvenance, { requireClean:false });
      sourceOk = current.head === sourceHead;
      sourceDetail = sourceOk ? `${current.dirty ? "DIRTY" : "CLEAN"} · HEAD ${sourceHead.slice(0,12)} · base ${baseHead.slice(0,12)}` : "A worktree HEAD eltér az authoritative source HEAD-től.";
    } catch (error) {
      sourceOk = false;
      sourceDetail = error instanceof Error ? error.message : "A source execution state nem igazolható.";
    }
  }
  checks.push({ id:"SOURCE", label:"Source provenance", required:true, pass:sourceOk, detail:sourceDetail });

  const evidence = await listGridEvidence({ taskId, limit:500 });
  const summary = await getGridEvidenceSummary(taskId);
  const headEvidence = evidence.filter((item) => item.head === sourceHead);
  const testPass = latestMatching(headEvidence, (item) => item.kind === "TEST" && item.status === "PASS");
  checks.push({ id:"TEST", label:"Célzott teszt evidence", required:true, pass:Boolean(testPass), detail:testPass ? `${testPass.summary} · ${testPass.occurredAt}` : `Nincs PASS TEST evidence a ${sourceHead.slice(0,12)} HEAD-hez.`, evidenceId:testPass?.id || null });

  const resolvedFingerprints = new Set(evidence.map((item) => item.attributes.resolvesFingerprint).filter(Boolean));
  const currentErrors = headEvidence.filter((item) => item.kind === "ERROR" && ["HIGH","CRITICAL"].includes(item.severity) && ["FAIL","BLOCKED"].includes(item.status) && !resolvedFingerprints.has(item.fingerprintSha256));
  const latestBy = (kind: GridEvidence["kind"], key: (item: GridEvidence) => string) => {
    const seen = new Set<string>();
    return headEvidence.filter((item) => item.kind === kind).filter((item) => { const value = key(item); if (seen.has(value)) return false; seen.add(value); return true; });
  };
  const latestTests = latestBy("TEST", (item) => item.attributes.testName || item.summary);
  const latestReviews = latestBy("REVIEW", () => "review");
  const latestBuilds = latestBy("BUILD", () => "build");
  const currentFailures = [...currentErrors, ...latestTests, ...latestReviews, ...latestBuilds].filter((item) => ["HIGH","CRITICAL"].includes(item.severity) && ["FAIL","BLOCKED"].includes(item.status) && !resolvedFingerprints.has(item.fingerprintSha256));
  checks.push({ id:"BLOCKERS", label:"Blokkoló diagnostics", required:true, pass:currentFailures.length === 0, detail:currentFailures.length ? `${currentFailures.length} current-HEAD unresolved HIGH/CRITICAL blocker.` : "Nincs current-HEAD unresolved HIGH/CRITICAL blocker." });

  const review = latestMatching(headEvidence, (item) => item.kind === "REVIEW" && terminalPass.has(item.status));
  const reviewRequired = target === "BUILD" || target === "CLOSURE";
  checks.push({ id:"VGUARD", label:"V.Guard review", required:reviewRequired, pass:Boolean(review) || !reviewRequired, detail:review ? `${review.status} · ${review.summary}` : reviewRequired ? `Nincs V.Guard PASS/PASS_WITH_NOTES evidence a ${sourceHead.slice(0,12)} HEAD-hez.` : "A review-readiness kapuhoz még nem kötelező review-result.", evidenceId:review?.id || null });

  const build = latestMatching(headEvidence, (item) => item.kind === "BUILD" && item.status === "PASS");
  const buildRequired = target === "CLOSURE";
  checks.push({ id:"BUILD", label:"FULL BUILD", required:buildRequired, pass:Boolean(build) || !buildRequired, detail:build ? `${build.summary}` : buildRequired ? `Nincs PASS BUILD evidence a ${sourceHead.slice(0,12)} HEAD-hez.` : "A jelenlegi gate-célhoz nem kötelező FULL BUILD.", evidenceId:build?.id || null });

  const handoff = latestMatching(headEvidence, (item) => item.kind === "HANDOFF" && item.status === "COMPLETED" && item.attributes.handoffStatus === "COMPLETED");
  const handoffRequired = target === "CLOSURE";
  checks.push({ id:"HANDOFF", label:"Handoff completeness", required:handoffRequired, pass:Boolean(handoff) || !handoffRequired, detail:handoff ? `${handoff.summary}` : handoffRequired ? `Nincs COMPLETED HANDOFF evidence a ${sourceHead.slice(0,12)} HEAD-hez.` : "A jelenlegi gate-célhoz még nem kötelező COMPLETED handoff.", evidenceId:handoff?.id || null });

  const ready = checks.every((check) => !check.required || check.pass);
  return { taskId, target, state: ready ? "PASS" as const : "BLOCKED" as const, ready, sourceHead, baseHead, workerCode:session.workerCode, sessionId:session.id, checks, evidenceSummary:summary, productionAccess:"DENY" as const };
}
