import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { SourceProvenance, WorkerCode } from "./types";

const execFileAsync = promisify(execFile);

export type SourceProvenanceExpectation = {
  repository: string;
  worktree: string;
  branch: string;
  expectedHead?: string | null;
  worker: WorkerCode;
  taskId: string;
  sessionId: string;
};

async function git(cwd: string, args: string[]) {
  const result = await execFileAsync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 10_000 });
  return result.stdout.trim();
}

export async function verifySourceProvenance(expectation: SourceProvenanceExpectation): Promise<SourceProvenance> {
  const reasons: string[] = [];
  const expectedWorktree = path.resolve(expectation.worktree);
  const expectedRepository = path.resolve(expectation.repository);
  let actualTopLevel = "";
  let actualBranch = "";
  let actualHead = "";
  let actualCommonDir = "";

  try {
    [actualTopLevel, actualBranch, actualHead, actualCommonDir] = await Promise.all([
      git(expectedWorktree, ["rev-parse", "--show-toplevel"]),
      git(expectedWorktree, ["branch", "--show-current"]),
      git(expectedWorktree, ["rev-parse", "HEAD"]),
      git(expectedWorktree, ["rev-parse", "--git-common-dir"]),
    ]);
  } catch (error) {
    reasons.push(error instanceof Error ? `Git provenance nem olvasható: ${error.message}` : "Git provenance nem olvasható.");
  }

  if (actualTopLevel && path.resolve(actualTopLevel) !== expectedWorktree) reasons.push(`Worktree mismatch: ${actualTopLevel}`);
  if (actualBranch && actualBranch !== expectation.branch) reasons.push(`Branch mismatch: ${actualBranch}`);
  if (expectation.expectedHead && actualHead && actualHead !== expectation.expectedHead) reasons.push(`HEAD mismatch: ${actualHead}`);

  if (actualCommonDir) {
    const resolvedCommon = path.isAbsolute(actualCommonDir)
      ? path.resolve(actualCommonDir)
      : path.resolve(expectedWorktree, actualCommonDir);
    if (resolvedCommon !== expectedRepository) reasons.push(`Repository mismatch: ${resolvedCommon}`);
  }

  if (!actualTopLevel) reasons.push("Worktree nem igazolható.");
  if (!actualBranch) reasons.push("Branch nem igazolható.");
  if (!actualHead) reasons.push("HEAD nem igazolható.");
  if (!actualCommonDir) reasons.push("Canonical repository nem igazolható.");

  const sourceState = reasons.length ? "BLOCKED" : "VERIFIED";
  return {
    repository: expectedRepository,
    worktree: expectedWorktree,
    branch: expectation.branch,
    baseHead: actualHead || expectation.expectedHead || "",
    head: actualHead || expectation.expectedHead || "",
    worker: expectation.worker,
    taskId: expectation.taskId,
    sessionId: expectation.sessionId,
    verifiedAt: new Date().toISOString(),
    sourceState,
    blockCode: sourceState === "BLOCKED" ? "SOURCE_BASELINE_MISMATCH" : null,
    reasons,
  };
}

export function assertVerifiedSource(provenance: SourceProvenance): SourceProvenance {
  if (provenance.sourceState !== "VERIFIED") {
    const error = new Error(`BLOCKED · SOURCE_BASELINE_MISMATCH${provenance.reasons.length ? ` · ${provenance.reasons.join("; ")}` : ""}`);
    Object.assign(error, { code: "SOURCE_BASELINE_MISMATCH", provenance });
    throw error;
  }
  return provenance;
}

export async function verifySourceHeadAdvance(provenance: SourceProvenance, reportedHead: string) {
  const nextHead = String(reportedHead || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(nextHead)) {
    const error = new Error("A source HEAD advance teljes 40 karakteres Git SHA-t igényel.");
    Object.assign(error, { code: "SOURCE_HEAD_INVALID" });
    throw error;
  }
  const currentHead = String(provenance.head || "").toLowerCase();
  const baseHead = String(provenance.baseHead || provenance.head || "").toLowerCase();
  const verified = await verifySourceProvenance({
    repository: provenance.repository, worktree: provenance.worktree, branch: provenance.branch, expectedHead: nextHead,
    worker: provenance.worker, taskId: provenance.taskId, sessionId: provenance.sessionId,
  });
  assertVerifiedSource(verified);
  for (const ancestor of [baseHead, currentHead].filter(Boolean)) {
    try {
      await execFileAsync("git", ["-C", provenance.worktree, "merge-base", "--is-ancestor", ancestor, nextHead], { encoding: "utf8", timeout: 10_000 });
    } catch {
      const error = new Error(`A source HEAD nem előrehaladó leszármazott: ${ancestor.slice(0, 12)} → ${nextHead.slice(0, 12)}.`);
      Object.assign(error, { code: "SOURCE_HEAD_NON_FAST_FORWARD", previousHead: ancestor, reportedHead: nextHead });
      throw error;
    }
  }
  return { ...verified, baseHead: baseHead || verified.baseHead, head: nextHead, verifiedAt: new Date().toISOString() };
}

export async function verifyCurrentSourceExecutionState(provenance: SourceProvenance, options: { requireClean?: boolean } = {}) {
  const verified = await verifySourceProvenance({
    repository: provenance.repository, worktree: provenance.worktree, branch: provenance.branch, expectedHead: provenance.head,
    worker: provenance.worker, taskId: provenance.taskId, sessionId: provenance.sessionId,
  });
  assertVerifiedSource(verified);
  let dirty = false;
  try { dirty = Boolean(await git(provenance.worktree, ["status", "--porcelain", "--untracked-files=normal"])); }
  catch (error) {
    const failure = new Error(error instanceof Error ? `Git status nem olvasható: ${error.message}` : "Git status nem olvasható.");
    Object.assign(failure, { code: "SOURCE_WORKTREE_STATUS_UNAVAILABLE" });
    throw failure;
  }
  if (options.requireClean && dirty) {
    const error = new Error("A source worktree nem tiszta; FULL BUILD/review csak commitolt állapotból indulhat.");
    Object.assign(error, { code: "SOURCE_WORKTREE_DIRTY" });
    throw error;
  }
  return { ...verified, baseHead: provenance.baseHead || verified.baseHead, head: provenance.head, dirty };
}
