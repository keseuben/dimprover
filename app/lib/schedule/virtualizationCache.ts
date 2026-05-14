import { VisibleRowLayout } from "@/app/lib/schedule/rowLayoutEngine";

type CacheKey = string;

const visibleRowCache = new Map<CacheKey, VisibleRowLayout[]>();

function buildCacheKey(
  scrollTop: number,
  viewportHeight: number,
  overscan: number
) {
  return `${scrollTop}_${viewportHeight}_${overscan}`;
}

export function getCachedVisibleRows(
  scrollTop: number,
  viewportHeight: number,
  overscan: number
): VisibleRowLayout[] | undefined {
  const key = buildCacheKey(
    scrollTop,
    viewportHeight,
    overscan
  );

  return visibleRowCache.get(key);
}

export function setCachedVisibleRows(
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
  rows: VisibleRowLayout[]
) {
  const key = buildCacheKey(
    scrollTop,
    viewportHeight,
    overscan
  );

  visibleRowCache.set(key, rows);

  // MEMORY LIMIT
  if (visibleRowCache.size > 200) {
    const firstKey = visibleRowCache.keys().next().value;

    if (firstKey) {
      visibleRowCache.delete(firstKey);
    }
  }
}

export function clearVirtualizationCache() {
  visibleRowCache.clear();
}