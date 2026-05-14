const dependencyPathCache = new Map<string, string>();

export function getCachedDependencyPath(
  cacheKey: string
): string | null {
  return dependencyPathCache.get(cacheKey) ?? null;
}

export function setCachedDependencyPath(
  cacheKey: string,
  path: string
) {
  dependencyPathCache.set(cacheKey, path);
}

export function clearDependencyPathCache() {
  dependencyPathCache.clear();
}
