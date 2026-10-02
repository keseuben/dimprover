import fs from "node:fs";
import path from "node:path";

function fail(code, detail = "") { const error = new Error(detail || code); error.code = code; throw error; }

export function resolveDeveloperGridReleaseDist(root, explicit = "") {
  const projectRoot = fs.realpathSync.native(path.resolve(root));
  const nextRootPath = path.join(projectRoot, ".next");
  if (!fs.existsSync(nextRootPath)) fail("RELEASE_DIST_NEXT_ROOT_MISSING", nextRootPath);
  const nextRoot = fs.realpathSync.native(nextRootPath);
  const requested = String(explicit || process.env.BENJADMIN_DEV_RELEASE_DIST || nextRootPath).trim();
  const absolute = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(projectRoot, requested);
  if (!fs.existsSync(absolute)) fail("RELEASE_DIST_MISSING", absolute);
  const resolved = fs.realpathSync.native(absolute);
  const relative = path.relative(nextRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) fail("RELEASE_DIST_OUTSIDE_NEXT_DENIED", resolved);
  if (!fs.statSync(resolved).isDirectory()) fail("RELEASE_DIST_NOT_DIRECTORY", resolved);
  return resolved;
}
