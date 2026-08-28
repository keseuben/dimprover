import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { verifyReleaseRuntimeProvenance } from "./release-provenance";
import type { ReleaseRuntimeProvenance } from "./types";

export type DeveloperGridRuntimeExpectation = {
  projectRoot?: string | null;
  declaredRelease?: string | null;
  expectedBuildId?: string | null;
  expectedSourceCommit?: string | null;
  expectedSourceBranch?: string | null;
};

type ReleaseMetadata = {
  buildId?: unknown;
  gitCommit?: unknown;
  gitBranch?: unknown;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveProjectRoot(explicit?: string | null) {
  const configured = clean(explicit) || clean(process.env.DIMPRO_PROJECT_ROOT);
  if (configured) return path.resolve(configured);

  const cwd = path.resolve(process.cwd());
  if (path.basename(cwd) === "standalone") {
    const distRoot = path.dirname(cwd);
    const projectRoot = path.dirname(distRoot);
    if (path.basename(distRoot).startsWith(".next")) return projectRoot;
  }
  return cwd;
}

function safeReleaseName(root: string, value: string | null | undefined) {
  const candidate = clean(value);
  if (!candidate) return null;
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.replaceAll("\\", "/");
}

function runtimeReleaseFromCwd(root: string) {
  const cwd = path.resolve(process.cwd());
  if (path.basename(cwd) !== "standalone") return null;
  return safeReleaseName(root, path.dirname(cwd));
}

async function readOptional(file: string) {
  try {
    return (await readFile(file, "utf8")).trim();
  } catch {
    return "";
  }
}

async function readMetadata(file: string): Promise<ReleaseMetadata | null> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as ReleaseMetadata;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function resolveDeveloperGridRuntimeProvenance(
  expectation: DeveloperGridRuntimeExpectation = {},
): Promise<ReleaseRuntimeProvenance> {
  const projectRoot = resolveProjectRoot(expectation.projectRoot);
  const configuredDistDir = safeReleaseName(projectRoot, process.env.NEXT_DIST_DIR);
  const activePointerRaw = await readOptional(path.join(projectRoot, ".dimprover", "active-next-release"));
  const activeReleasePointer = safeReleaseName(projectRoot, activePointerRaw);
  const runtimeRelease = runtimeReleaseFromCwd(projectRoot);
  const declaredRelease = safeReleaseName(
    projectRoot,
    expectation.declaredRelease || configuredDistDir || activeReleasePointer || runtimeRelease || ".next",
  );

  const distDir = declaredRelease || runtimeRelease || configuredDistDir || activeReleasePointer;
  if (!distDir) {
    return verifyReleaseRuntimeProvenance({
      declaredRelease: null,
      activeReleasePointer,
      pm2NextDistDir: configuredDistDir,
      runtimeCwd: process.cwd(),
      runtimeRelease,
      buildId: null,
      expectedBuildId: expectation.expectedBuildId || null,
      metadataReady: false,
      sourceCommit: null,
      expectedSourceCommit: clean(expectation.expectedSourceCommit).toLowerCase() || null,
      sourceBranch: null,
      expectedSourceBranch: clean(expectation.expectedSourceBranch) || null,
    });
  }

  const distRoot = path.resolve(projectRoot, distDir);
  const buildId = clean(await readOptional(path.join(distRoot, "BUILD_ID"))) || null;
  const assetBuildId = clean(await readOptional(path.join(distRoot, "standalone", ".dimpro-assets-build-id"))) || null;
  const metadata = await readMetadata(path.join(distRoot, ".dimpro-release.json"));
  const metadataBuildId = clean(metadata?.buildId);
  const sourceCommit = clean(metadata?.gitCommit).toLowerCase();
  const sourceBranch = clean(metadata?.gitBranch);

  const metadataReady = Boolean(
    buildId
      && metadataBuildId === buildId
      && /^[0-9a-f]{40}$/.test(sourceCommit),
  );

  return verifyReleaseRuntimeProvenance({
    declaredRelease: distDir,
    activeReleasePointer,
    pm2NextDistDir: configuredDistDir,
    runtimeCwd: process.cwd(),
    runtimeRelease,
    buildId,
    expectedBuildId: expectation.expectedBuildId || assetBuildId || null,
    metadataReady,
    sourceCommit: sourceCommit || null,
    expectedSourceCommit: clean(expectation.expectedSourceCommit).toLowerCase() || null,
    sourceBranch: sourceBranch || null,
    expectedSourceBranch: clean(expectation.expectedSourceBranch) || null,
  });
}
