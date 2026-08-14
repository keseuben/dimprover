"server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { scanSensitiveText } from "../ai-worker/secret-scanner";
import { getTerminalHubFeatureFlags } from "./config";
import { sanitizeTerminalText } from "./data-policy";
import { LiveWorkspaceError, readLiveWorkspaceFile, resolveLiveWorkspaceRoot } from "./live-workspace";

const execFileAsync = promisify(execFile);
const MAX_MONACO_BYTES = 512 * 1024;
const MAX_HISTORY = 25;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;

export type LiveWorkspaceGitRevision = {
  commit: string;
  shortCommit: string;
  author: string;
  authoredAt: string;
  subject: string;
};

export type LiveWorkspaceGitContent = {
  ref: string;
  content: string;
  sizeBytes: number;
  available: boolean;
  aiVisibility: "blocked" | "filtered";
  sensitiveFindings: string[];
};

export type LiveWorkspaceGitContext = {
  workspaceId: string;
  relativePath: string;
  language: string;
  status: string;
  headCommit: string;
  head: LiveWorkspaceGitContent;
  current: LiveWorkspaceGitContent;
  history: LiveWorkspaceGitRevision[];
  selectedHistory: LiveWorkspaceGitContent | null;
  selectedCommit: string | null;
  readOnly: true;
  generatedAt: string;
};

function safeText(value: string, limit = 500) {
  return sanitizeTerminalText(value).replace(/\s+/g, " ").trim().slice(0, limit);
}

async function gitText(worktree: string, args: string[], maxBuffer = 512 * 1024) {
  try {
    const result = await execFileAsync("git", ["-C", worktree, ...args], {
      encoding: "utf8",
      timeout: 4000,
      maxBuffer,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr } as const;
  } catch (error) {
    const value = error as { stdout?: string; stderr?: string };
    return { ok: false, stdout: value.stdout || "", stderr: value.stderr || "" } as const;
  }
}

async function gitBuffer(worktree: string, args: string[], maxBuffer = MAX_MONACO_BYTES + 16 * 1024) {
  try {
    const result = await execFileAsync("git", ["-C", worktree, ...args], {
      encoding: "buffer",
      timeout: 4000,
      maxBuffer,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    return { ok: true, stdout: result.stdout as Buffer } as const;
  } catch {
    return { ok: false, stdout: Buffer.alloc(0) } as const;
  }
}

function contentView(ref: string, buffer: Buffer, available: boolean): LiveWorkspaceGitContent {
  if (!available) return { ref, content: "", sizeBytes: 0, available: false, aiVisibility: "filtered", sensitiveFindings: [] };
  if (buffer.length > MAX_MONACO_BYTES) throw new LiveWorkspaceError("A Git-verzió nagyobb a P6 512 KiB Monaco limitjénél.", "LIVE_WORKSPACE_GIT_FILE_TOO_LARGE", 413);
  if (buffer.includes(0)) throw new LiveWorkspaceError("Bináris Git-verzió nem jeleníthető meg Monaco nézetben.", "LIVE_WORKSPACE_GIT_BINARY_DENIED", 415);
  const content = buffer.toString("utf8");
  const findings = scanSensitiveText(content);
  return {
    ref,
    content,
    sizeBytes: buffer.length,
    available: true,
    aiVisibility: findings.length ? "blocked" : "filtered",
    sensitiveFindings: findings,
  };
}

async function readRevision(worktree: string, commit: string, relativePath: string) {
  const objectRef = `${commit}:${relativePath}`;
  const sizeResult = await gitText(worktree, ["cat-file", "-s", objectRef], 16 * 1024);
  if (!sizeResult.ok) return contentView(commit, Buffer.alloc(0), false);
  const size = Number.parseInt(sizeResult.stdout.trim(), 10);
  if (!Number.isFinite(size) || size < 0) return contentView(commit, Buffer.alloc(0), false);
  if (size > MAX_MONACO_BYTES) throw new LiveWorkspaceError("A Git-verzió nagyobb a P6 512 KiB Monaco limitjénél.", "LIVE_WORKSPACE_GIT_FILE_TOO_LARGE", 413);
  const show = await gitBuffer(worktree, ["show", objectRef], Math.max(MAX_MONACO_BYTES + 16 * 1024, size + 16 * 1024));
  return contentView(commit, show.stdout, show.ok);
}

function parseHistory(raw: string): LiveWorkspaceGitRevision[] {
  return raw.split("\x1e").map((entry) => entry.trim()).filter(Boolean).slice(0, MAX_HISTORY).flatMap((entry) => {
    const [commit, shortCommit, author, authoredAt, ...subjectParts] = entry.split("\x1f");
    if (!COMMIT_PATTERN.test(commit || "") || !shortCommit || !authoredAt) return [];
    return [{
      commit,
      shortCommit: safeText(shortCommit, 16),
      author: safeText(author || "GIT", 100) || "GIT",
      authoredAt,
      subject: safeText(subjectParts.join("\x1f"), 500) || "Commit",
    }];
  });
}

export function assertWorkspaceMonacoEnabled() {
  const flags = getTerminalHubFeatureFlags();
  if (!flags.liveWorkspaceEnabled || !flags.workspaceMonacoEnabled) {
    throw new LiveWorkspaceError("A Live Workspace P6 Monaco/Git context feature flag jelenleg ki van kapcsolva.", "LIVE_WORKSPACE_MONACO_DISABLED", 409);
  }
}

export async function getLiveWorkspaceGitContext(workspaceId: string, relativePath: string, requestedCommit = ""): Promise<LiveWorkspaceGitContext> {
  assertWorkspaceMonacoEnabled();
  const currentFile = await readLiveWorkspaceFile(workspaceId, relativePath);
  const workspace = await resolveLiveWorkspaceRoot(workspaceId);
  const [headResult, statusResult, historyResult] = await Promise.all([
    gitText(workspace.path, ["rev-parse", "HEAD"], 16 * 1024),
    gitText(workspace.path, ["status", "--short", "--", currentFile.relativePath], 64 * 1024),
    gitText(workspace.path, ["log", "-n", String(MAX_HISTORY), "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e", "--", currentFile.relativePath], 512 * 1024),
  ]);
  const headCommit = headResult.ok && COMMIT_PATTERN.test(headResult.stdout.trim()) ? headResult.stdout.trim() : "";
  if (!headCommit) throw new LiveWorkspaceError("A worktree HEAD commit nem olvasható.", "LIVE_WORKSPACE_GIT_HEAD_UNAVAILABLE", 409);
  const history = historyResult.ok ? parseHistory(historyResult.stdout) : [];
  const selectedCommit = requestedCommit.trim();
  if (selectedCommit && !COMMIT_PATTERN.test(selectedCommit)) {
    throw new LiveWorkspaceError("Érvénytelen Git history commit azonosító.", "LIVE_WORKSPACE_GIT_COMMIT_INVALID", 400);
  }
  if (selectedCommit && !history.some((item) => item.commit === selectedCommit)) {
    throw new LiveWorkspaceError("A kért commit nincs a fájl engedélyezett P6 history-listájában.", "LIVE_WORKSPACE_GIT_COMMIT_NOT_ALLOWED", 403);
  }
  const [head, selectedHistory] = await Promise.all([
    readRevision(workspace.path, headCommit, currentFile.relativePath),
    selectedCommit ? readRevision(workspace.path, selectedCommit, currentFile.relativePath) : Promise.resolve(null),
  ]);
  const currentBuffer = Buffer.from(currentFile.content, "utf8");
  const current = contentView("WORKTREE", currentBuffer, true);
  return {
    workspaceId,
    relativePath: currentFile.relativePath,
    language: currentFile.language,
    status: statusResult.ok ? safeText(statusResult.stdout, 120) : "",
    headCommit,
    head,
    current,
    history,
    selectedHistory,
    selectedCommit: selectedCommit || null,
    readOnly: true,
    generatedAt: new Date().toISOString(),
  };
}
