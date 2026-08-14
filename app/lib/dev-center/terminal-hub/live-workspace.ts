"server-only";

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { scanSensitiveText } from "../ai-worker/secret-scanner";
import { getTerminalHubFeatureFlags, TERMINAL_HUB_WORKSPACE_ROOTS } from "./config";
import { resolveAllowedWorkspacePath, TerminalWorkspacePolicyError } from "./workspace-policy";

const execFileAsync = promisify(execFile);
const MAX_WORKSPACES = 120;
const MAX_TREE_ENTRIES = 500;
const MAX_PREVIEW_BYTES = 512 * 1024;

const previewExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".md", ".txt", ".css", ".scss", ".html", ".xml",
  ".yml", ".yaml", ".sql", ".sh", ".ps1", ".py", ".toml", ".ini",
]);

const languageByExtension: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescriptreact", ".js": "javascript", ".jsx": "javascriptreact",
  ".mjs": "javascript", ".cjs": "javascript", ".json": "json", ".md": "markdown", ".txt": "plaintext",
  ".css": "css", ".scss": "scss", ".html": "html", ".xml": "xml", ".yml": "yaml", ".yaml": "yaml",
  ".sql": "sql", ".sh": "shell", ".ps1": "powershell", ".py": "python", ".toml": "toml", ".ini": "ini",
};

export type LiveWorkspaceSummary = {
  id: string;
  name: string;
  plane: "INTERNAL" | "PARTNER";
  path: string;
  branch: string;
  commit: string;
  dirtyCount: number;
  status: "CLEAN" | "DIRTY" | "UNKNOWN";
};

export type LiveWorkspaceTreeEntry = {
  name: string;
  relativePath: string;
  kind: "directory" | "file";
  sizeBytes: number;
  modifiedAt: string;
  previewable: boolean;
};

export type LiveWorkspaceFilePreview = {
  workspaceId: string;
  relativePath: string;
  name: string;
  content: string;
  language: string;
  sizeBytes: number;
  lineCount: number;
  modifiedAt: string;
  sha256: string;
  gitStatus: string;
  aiVisibility: "blocked" | "filtered";
  sensitiveFindings: string[];
};

type WorkspaceRoot = { id: string; name: string; plane: "INTERNAL" | "PARTNER"; path: string };

export class LiveWorkspaceError extends Error {
  status: number;
  code: string;
  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "LiveWorkspaceError";
    this.code = code;
    this.status = status;
  }
}

export function assertLiveWorkspaceEnabled() {
  if (!getTerminalHubFeatureFlags().liveWorkspaceEnabled) {
    throw new LiveWorkspaceError("A Live Workspace feature flag jelenleg ki van kapcsolva.", "LIVE_WORKSPACE_DISABLED", 409);
  }
}

function workspaceId(realPath: string) {
  return createHash("sha256").update(realPath, "utf8").digest("hex").slice(0, 24);
}

function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function gitRead(worktree: string, args: string[]) {
  try {
    const result = await execFileAsync("git", ["-C", worktree, ...args], {
      timeout: 4000,
      maxBuffer: 512 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    return result.stdout.trim();
  } catch {
    return "";
  }
}

async function discoverWorkspaceRoots(): Promise<WorkspaceRoot[]> {
  const found: WorkspaceRoot[] = [];
  for (const configuredRoot of TERMINAL_HUB_WORKSPACE_ROOTS) {
    if (found.length >= MAX_WORKSPACES) break;
    let rootReal = "";
    try { rootReal = await realpath(configuredRoot); } catch { continue; }
    let entries: Dirent<string>[] = [];
    try { entries = await readdir(rootReal, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (found.length >= MAX_WORKSPACES) break;
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const candidate = path.join(rootReal, entry.name);
      try {
        const resolved = await resolveAllowedWorkspacePath(candidate);
        const stat = await lstat(resolved.path);
        if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
        found.push({
          id: workspaceId(resolved.path),
          name: entry.name,
          plane: rootReal.includes("/partner-dev/") ? "PARTNER" : "INTERNAL",
          path: resolved.path,
        });
      } catch {
        continue;
      }
    }
  }
  return found.sort((a, b) => a.plane.localeCompare(b.plane) || a.name.localeCompare(b.name, "hu"));
}

export async function resolveLiveWorkspaceRoot(workspaceIdValue: string) {
  if (!/^[0-9a-f]{24}$/.test(workspaceIdValue)) {
    throw new LiveWorkspaceError("Érvénytelen Live Workspace azonosító.", "LIVE_WORKSPACE_ID_INVALID");
  }
  const roots = await discoverWorkspaceRoots();
  const workspace = roots.find((item) => item.id === workspaceIdValue);
  if (!workspace) throw new LiveWorkspaceError("A Live Workspace nem található vagy nem engedélyezett.", "LIVE_WORKSPACE_NOT_FOUND", 404);
  return workspace;
}

async function resolveWithinWorkspace(workspace: WorkspaceRoot, relativePath: string) {
  const raw = typeof relativePath === "string" ? relativePath.trim() : "";
  if (raw.includes("\0")) throw new LiveWorkspaceError("Érvénytelen Live Workspace útvonal.", "LIVE_WORKSPACE_PATH_INVALID");
  const normalized = raw.replaceAll("\\", "/").replace(/^\.\//, "");
  if (path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) {
    throw new LiveWorkspaceError("A relatív útvonal nem hagyhatja el a worktree-t.", "LIVE_WORKSPACE_PATH_ESCAPE", 403);
  }
  const rootReal = await realpath(workspace.path);
  const candidate = path.resolve(rootReal, normalized || ".");
  let resolved: Awaited<ReturnType<typeof resolveAllowedWorkspacePath>>;
  try {
    resolved = await resolveAllowedWorkspacePath(candidate);
  } catch (error) {
    if (error instanceof TerminalWorkspacePolicyError) {
      throw new LiveWorkspaceError(error.message, error.code, 403);
    }
    throw error;
  }
  if (!isInside(rootReal, resolved.path)) {
    throw new LiveWorkspaceError("Az útvonal a kiválasztott worktree-n kívülre mutat.", "LIVE_WORKSPACE_PATH_ESCAPE", 403);
  }
  return { rootReal, path: resolved.path, relativePath: path.relative(rootReal, resolved.path).replaceAll(path.sep, "/") };
}

export async function listLiveWorkspaces(): Promise<LiveWorkspaceSummary[]> {
  assertLiveWorkspaceEnabled();
  const roots = await discoverWorkspaceRoots();
  return Promise.all(roots.map(async (workspace) => {
    const [inside, branch, commit, statusText] = await Promise.all([
      gitRead(workspace.path, ["rev-parse", "--is-inside-work-tree"]),
      gitRead(workspace.path, ["branch", "--show-current"]),
      gitRead(workspace.path, ["rev-parse", "--short=12", "HEAD"]),
      gitRead(workspace.path, ["status", "--short", "--untracked-files=normal"]),
    ]);
    const dirtyCount = statusText ? statusText.split("\n").filter(Boolean).length : 0;
    return {
      ...workspace,
      branch: inside === "true" ? branch : "",
      commit: inside === "true" ? commit : "",
      dirtyCount,
      status: inside !== "true" ? "UNKNOWN" as const : dirtyCount ? "DIRTY" as const : "CLEAN" as const,
    };
  }));
}

export async function listLiveWorkspaceTree(workspaceIdValue: string, relativePath = "") {
  assertLiveWorkspaceEnabled();
  const workspace = await resolveLiveWorkspaceRoot(workspaceIdValue);
  const resolved = await resolveWithinWorkspace(workspace, relativePath);
  const stat = await lstat(resolved.path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new LiveWorkspaceError("A Live Workspace tree csak könyvtárat tud listázni.", "LIVE_WORKSPACE_NOT_DIRECTORY", 400);
  }
  const dirents = await readdir(resolved.path, { withFileTypes: true });
  const entries: LiveWorkspaceTreeEntry[] = [];
  let hiddenCount = 0;
  for (const entry of dirents) {
    if (entries.length >= MAX_TREE_ENTRIES) break;
    if (entry.isSymbolicLink()) { hiddenCount += 1; continue; }
    const childRelative = [resolved.relativePath, entry.name].filter(Boolean).join("/");
    try {
      const child = await resolveWithinWorkspace(workspace, childRelative);
      const childStat = await lstat(child.path);
      if (childStat.isSymbolicLink() || (!childStat.isDirectory() && !childStat.isFile())) { hiddenCount += 1; continue; }
      const extension = path.extname(entry.name).toLowerCase();
      entries.push({
        name: entry.name,
        relativePath: childRelative,
        kind: childStat.isDirectory() ? "directory" : "file",
        sizeBytes: childStat.isFile() ? childStat.size : 0,
        modifiedAt: childStat.mtime.toISOString(),
        previewable: childStat.isFile() && childStat.size <= MAX_PREVIEW_BYTES && previewExtensions.has(extension),
      });
    } catch (error) {
      if (error instanceof LiveWorkspaceError || error instanceof TerminalWorkspacePolicyError) { hiddenCount += 1; continue; }
      throw error;
    }
  }
  entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "hu") : a.kind === "directory" ? -1 : 1));
  return {
    workspace: { id: workspace.id, name: workspace.name, plane: workspace.plane, path: workspace.path },
    relativePath: resolved.relativePath,
    parentPath: resolved.relativePath ? path.posix.dirname(resolved.relativePath) === "." ? "" : path.posix.dirname(resolved.relativePath) : null,
    entries,
    hiddenCount,
    truncated: entries.length >= MAX_TREE_ENTRIES,
  };
}

export async function readLiveWorkspaceFile(workspaceIdValue: string, relativePath: string): Promise<LiveWorkspaceFilePreview> {
  assertLiveWorkspaceEnabled();
  const workspace = await resolveLiveWorkspaceRoot(workspaceIdValue);
  const resolved = await resolveWithinWorkspace(workspace, relativePath);
  const stat = await lstat(resolved.path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new LiveWorkspaceError("Csak normál fájl nyitható meg.", "LIVE_WORKSPACE_FILE_INVALID", 400);
  if (stat.size > MAX_PREVIEW_BYTES) throw new LiveWorkspaceError("A fájl nagyobb a P4 512 KiB előnézeti limitjénél.", "LIVE_WORKSPACE_FILE_TOO_LARGE", 413);
  const extension = path.extname(resolved.path).toLowerCase();
  if (!previewExtensions.has(extension)) throw new LiveWorkspaceError("Ez a fájltípus P4 read-only előnézetben nem támogatott.", "LIVE_WORKSPACE_FILE_TYPE_DENIED", 415);
  const buffer = await readFile(resolved.path);
  if (buffer.includes(0)) throw new LiveWorkspaceError("Bináris fájl nem jeleníthető meg kód-előnézetben.", "LIVE_WORKSPACE_BINARY_DENIED", 415);
  const content = buffer.toString("utf8");
  const findings = scanSensitiveText(content);
  const relative = resolved.relativePath;
  const gitStatus = await gitRead(workspace.path, ["status", "--short", "--", relative]);
  return {
    workspaceId: workspace.id,
    relativePath: relative,
    name: path.basename(resolved.path),
    content,
    language: languageByExtension[extension] || "plaintext",
    sizeBytes: stat.size,
    lineCount: content ? content.split("\n").length : 0,
    modifiedAt: stat.mtime.toISOString(),
    sha256: createHash("sha256").update(buffer).digest("hex"),
    gitStatus,
    aiVisibility: findings.length ? "blocked" : "filtered",
    sensitiveFindings: findings,
  };
}
