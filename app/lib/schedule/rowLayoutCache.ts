import { VisibleRowLayout } from "@/app/lib/schedule/rowLayoutEngine";

const rowLayoutCache = new Map<string, VisibleRowLayout[]>();

export function getCachedRowLayout(
  cacheKey: string
): VisibleRowLayout[] | null {
  return rowLayoutCache.get(cacheKey) ?? null;
}

export function setCachedRowLayout(
  cacheKey: string,
  layouts: VisibleRowLayout[]
) {
  rowLayoutCache.set(cacheKey, layouts);
}

export function clearRowLayoutCache() {
  rowLayoutCache.clear();
}