/** An intentionally small structural contract shared by Project and Personal Drive.
 * Dates refer to actual uploaded file versions, not metadata-only document edits.
 */
export type RecentUploadRecord = {
  id: string;
  updatedAt: string;
  currentVersion: { createdAt: string } | null;
};

export function recentUploadTimestamp(document: RecentUploadRecord):number {
  const timestamp=Date.parse(document.currentVersion?.createdAt || document.updatedAt || "");
  return Number.isFinite(timestamp)?timestamp:0;
}

export function sortedRecentUploads<T extends RecentUploadRecord>(documents:readonly T[]):T[] {
  return documents.filter(document=>Boolean(document.currentVersion)).slice()
    .sort((a,b)=>recentUploadTimestamp(b)-recentUploadTimestamp(a)||a.id.localeCompare(b.id));
}
