import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { createDropS3InlineUrl, openDropS3Object } from "../storage/dropS3Storage";
import type { DropFileRecord } from "../dropTypes";
import type { DropFinalReportBundle } from "./dropReportRepository";
import type { DropPackageWorkflowRecord } from "../public/dropPublicTypes";

const BUDAPEST_TIME_ZONE = "Europe/Budapest";
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"]);

type ReportImage = {
  fileId: string;
  displayName: string;
  originalName: string;
  uploadedBy: string;
  createdAt: string;
  mimeType: string;
  sizeBytes: number;
  sourceOriginalSizeBytes: number;
  savedPercent: number;
  url: string;
  groupId: string | null;
  groupName: string;
  groupSortOrder: number;
  comments: Array<{ author: string; createdAt: string; text: string }>;
};

export type DropReportImagesPerPage = 1 | 2 | 4 | 6;

export type DropReportRenderOptions = {
  workflow?: DropPackageWorkflowRecord | null;
  tokenReference?: string | null;
  reportTitle?: string;
  fileNameSuffix?: string;
  imagesPerPage?: DropReportImagesPerPage;
};

export type RenderedDropFinalReport = {
  buffer: Buffer;
  pageCount: number;
  fileName: string;
  generatedAt: string;
  includedImageCount: number;
  eligibleImageCount: number;
  truncatedImageCount: number;
};

function clampInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("hu-HU", {
    timeZone: BUDAPEST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(value: number | null | undefined) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = numeric;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: index > 1 ? 1 : 0 }).format(size)} ${units[index]}`;
}

function safeFileBase(value: string) {
  return String(value || "dimpro-drop-riport")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120) || "dimpro-drop-riport";
}

function fileSecurityLabel(file: DropFileRecord) {
  if (file.security_status === "infected" || file.virus_scan_status === "infected") return "Fertőzött - tiltva és törölve";
  if (file.deleted_at) return "Tárhelyobjektum törölve";
  if (file.security_status === "clean" && file.virus_scan_status === "clean") return "Tiszta - ClamAV ellenőrizve";
  if (file.virus_scan_status === "error") return "Vírusellenőrzési hiba";
  return "Vírusellenőrzés folyamatban";
}

function modeLabel(mode: string) {
  if (mode === "image") return "KépDrop";
  if (mode === "file") return "FájlDrop";
  if (mode === "zip") return "ZIP-csomag";
  if (mode === "mixed") return "Vegyes csomag";
  return mode || "-";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Piszkozat",
    preparing: "Előkészítés",
    active: "Aktív",
    upload_closed: "Feltöltés lezárva",
    expiring: "Lejáró",
    reporting: "Riportkészítés",
    expired: "Lejárt",
    deleting: "Törlésre vár",
    deleted: "Törölve",
    failed: "Hibás",
  };
  return labels[status] || status || "-";
}


function normalizeReportImagesPerPage(value: unknown): DropReportImagesPerPage {
  const parsed = Number(value);
  return parsed === 2 || parsed === 4 || parsed === 6 ? parsed : 1;
}

async function readReportImageSource(file: DropFileRecord, maximumBytes = 30 * 1024 * 1024) {
  const opened = await openDropS3Object({ storageKey: file.storage_key, bucket: file.storage_bucket });
  if (opened.contentLength > maximumBytes) throw new Error("A riportkép forrása túl nagy.");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of opened.body as unknown as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumBytes) throw new Error("A riportkép forrása meghaladta a biztonsági korlátot.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function createReportImageUrl(file: DropFileRecord, imagesPerPage: DropReportImagesPerPage) {
  try {
    const source = await readReportImageSource(file);
    const maxEdge = imagesPerPage === 1 ? 1500 : imagesPerPage === 2 ? 1100 : imagesPerPage === 4 ? 850 : 700;
    const quality = imagesPerPage === 1 ? 76 : imagesPerPage === 2 ? 72 : 68;
    const optimized = await sharp(source, { animated: false, failOn: "warning", limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, progressive: true, chromaSubsampling: "4:2:0" })
      .toBuffer();
    return `data:image/jpeg;base64,${optimized.toString("base64")}`;
  } catch {
    const signed = await createDropS3InlineUrl({
      storageKey: file.storage_key,
      bucket: file.storage_bucket,
      contentType: file.detected_mime_type || file.mime_type,
      expiresIn: 20 * 60,
    });
    return signed.url;
  }
}

function isEligibleReportImage(file: DropFileRecord) {
  const selected = (file as DropFileRecord & { is_report_selected?: boolean }).is_report_selected !== false;
  const mime = file.detected_mime_type || file.mime_type;
  return Boolean(
    selected
      && file.is_image
      && !file.deleted_at
      && file.upload_status === "ready"
      && file.processing_status === "ready"
      && file.security_status === "clean"
      && file.virus_scan_status === "clean"
      && IMAGE_MIME_TYPES.has(mime),
  );
}

function getFileSourceMetric(bundle: DropFinalReportBundle, fileId: string, fallbackBytes: number) {
  const metric = bundle.fileSourceMetrics[fileId];
  const sourceOriginalSizeBytes = metric?.sourceOriginalSizeBytes || fallbackBytes;
  const uploadSizeBytes = metric?.uploadSizeBytes || fallbackBytes;
  const savedPercent = metric?.savedPercent || (sourceOriginalSizeBytes > uploadSizeBytes
    ? Math.max(0, Math.round((1 - uploadSizeBytes / sourceOriginalSizeBytes) * 100))
    : 0);
  return { sourceOriginalSizeBytes, uploadSizeBytes, savedPercent };
}

async function buildReportImages(bundle: DropFinalReportBundle, imagesPerPage: DropReportImagesPerPage) {
  const maximum = clampInteger(process.env.DIMPRO_DROP_REPORT_MAX_IMAGES, 120, 1, 300);
  const eligible = bundle.files.filter(isEligibleReportImage);
  const selected = eligible.slice(0, maximum);
  const commentsByFile = new Map<string, ReportImage["comments"]>();
  for (const comment of bundle.comments) {
    if (!comment.file_id) continue;
    const comments = commentsByFile.get(comment.file_id) || [];
    comments.push({ author: comment.author_name || "Ismeretlen szerző", createdAt: comment.created_at, text: comment.comment_text });
    commentsByFile.set(comment.file_id, comments);
  }
  const groupById = new Map(bundle.groups.map((group) => [group.id, group]));
  const images: ReportImage[] = [];
  for (const file of selected) {
    const sourceMetric = getFileSourceMetric(bundle, file.id, file.size_stored_bytes || file.size_original_bytes);
    images.push({
      fileId: file.id,
      displayName: file.display_name,
      originalName: file.original_name,
      uploadedBy: file.uploaded_by_name || file.uploaded_by_email || "-",
      createdAt: file.created_at,
      mimeType: file.detected_mime_type || file.mime_type,
      sizeBytes: file.size_stored_bytes,
      sourceOriginalSizeBytes: sourceMetric.sourceOriginalSizeBytes,
      savedPercent: sourceMetric.savedPercent,
      url: await createReportImageUrl(file, imagesPerPage),
      groupId: file.group_id || null,
      groupName: file.group_id ? groupById.get(file.group_id)?.name || "Csoport nélkül" : "Csoport nélkül",
      groupSortOrder: file.group_id ? groupById.get(file.group_id)?.sort_order ?? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER,
      comments: commentsByFile.get(file.id) || [],
    });
  }
  return { images, eligibleCount: eligible.length, truncatedCount: Math.max(0, eligible.length - images.length) };
}

function renderFileRows(bundle: DropFinalReportBundle) {
  if (!bundle.files.length) return `<tr><td colspan="8" class="empty">Nincs rögzített fájl.</td></tr>`;
  const groupById = new Map(bundle.groups.map((group) => [group.id, group]));
  const buckets = new Map<string, { key: string; name: string; sortOrder: number; ungrouped: boolean; files: DropFileRecord[] }>();
  for (const file of bundle.files) {
    const group = file.group_id ? groupById.get(file.group_id) || null : null;
    const key = group ? `group:${group.id}` : "__ungrouped__";
    const current = buckets.get(key);
    if (current) current.files.push(file);
    else buckets.set(key, { key, name: group?.name || "Csoport nélkül", sortOrder: group?.sort_order ?? Number.MAX_SAFE_INTEGER, ungrouped: !group, files: [file] });
  }
  const groups = Array.from(buckets.values()).sort((left, right) => left.ungrouped !== right.ungrouped ? (left.ungrouped ? 1 : -1) : left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "hu-HU"));
  let globalIndex = 0;
  return groups.map((group) => {
    const rows = group.files.map((file) => {
      globalIndex += 1;
      const storedBytes = file.size_stored_bytes || file.size_original_bytes;
      const metric = getFileSourceMetric(bundle, file.id, storedBytes);
      const sizeDetails = metric.savedPercent > 0
        ? `<strong>${escapeHtml(formatBytes(storedBytes))}</strong><br><span class="muted">Eredeti: ${escapeHtml(formatBytes(metric.sourceOriginalSizeBytes))} · −${metric.savedPercent}%</span>`
        : escapeHtml(formatBytes(storedBytes));
      return `<tr><td>${globalIndex}.</td><td><strong>${escapeHtml(file.display_name)}</strong>${file.original_name !== file.display_name ? `<br><span class="muted">Eredeti: ${escapeHtml(file.original_name)}</span>` : ""}</td><td>${escapeHtml(group.name)}</td><td>${escapeHtml(file.uploaded_by_name || file.uploaded_by_email || "-")}</td><td>${escapeHtml(formatDate(file.created_at))}</td><td>${sizeDetails}</td><td>${escapeHtml(fileSecurityLabel(file))}</td><td class="mono">${escapeHtml(file.sha256 ? file.sha256.slice(0, 16) + "..." : "-")}</td></tr>`;
    }).join("");
    return `<tr class="file-group-row"><td colspan="8"><strong>${escapeHtml(group.name)}</strong><span>${group.files.length} fájl</span></td></tr>${rows}`;
  }).join("");
}

function renderPackageComments(bundle: DropFinalReportBundle) {
  const packageComments = bundle.comments.filter((comment) => !comment.file_id);
  if (!packageComments.length) return `<div class="empty-box">Nincs csomagszintű megjegyzés.</div>`;
  return packageComments.map((comment) => `
    <article class="comment">
      <div class="comment-meta"><strong>${escapeHtml(comment.author_name)}</strong><span>${escapeHtml(formatDate(comment.created_at))}</span></div>
      <div class="comment-text">${escapeHtml(comment.comment_text).replaceAll("\n", "<br>")}</div>
    </article>
  `).join("");
}

function compactReportComment(value: string, imagesPerPage: DropReportImagesPerPage) {
  const limit = imagesPerPage === 1 ? 4000 : imagesPerPage === 2 ? 700 : imagesPerPage === 4 ? 220 : 120;
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length <= limit ? { text: clean, truncated: false } : { text: `${clean.slice(0, Math.max(1, limit - 1)).trimEnd()}…`, truncated: true };
}

function renderImageCards(images: ReportImage[], imagesPerPage: DropReportImagesPerPage) {
  if (!images.length) return `<div class="empty-box">Nincs a riportba bevonható, tisztának minősített képfájl.</div>`;
  const buckets = new Map<string, { key: string; name: string; sortOrder: number; ungrouped: boolean; images: ReportImage[] }>();
  for (const image of images) {
    const key = image.groupId ? `group:${image.groupId}` : "__ungrouped__";
    const current = buckets.get(key);
    if (current) current.images.push(image);
    else buckets.set(key, { key, name: image.groupName || "Csoport nélkül", sortOrder: image.groupSortOrder, ungrouped: !image.groupId, images: [image] });
  }
  const groups = Array.from(buckets.values()).sort((left, right) => left.ungrouped !== right.ungrouped ? (left.ungrouped ? 1 : -1) : left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "hu-HU"));
  let globalIndex = 0;
  const pages: string[] = [];
  for (const group of groups) {
    for (let offset = 0; offset < group.images.length; offset += imagesPerPage) {
      const pageImages = group.images.slice(offset, offset + imagesPerPage);
      const cards = pageImages.map((image) => {
        globalIndex += 1;
        const commentsToShow = imagesPerPage === 1 ? image.comments : image.comments.slice(0, imagesPerPage === 2 ? 2 : 1);
        let shortened = commentsToShow.length < image.comments.length;
        const commentHtml = commentsToShow.map((comment) => {
          const compact = compactReportComment(comment.text, imagesPerPage);
          shortened ||= compact.truncated;
          return `<div class="file-comment"><span>${escapeHtml(comment.author)} · ${escapeHtml(formatDate(comment.createdAt))}</span><p>${escapeHtml(compact.text)}</p></div>`;
        }).join("");
        return `<article class="image-card"><div class="image-frame"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.displayName)}" loading="eager" /><div class="image-fallback">A kép előnézete nem tölthető be.</div></div><div class="image-details"><div class="image-number">${globalIndex}.</div><div><h3>${escapeHtml(image.displayName)}</h3>${image.originalName !== image.displayName ? `<p class="muted">Eredeti fájlnév: ${escapeHtml(image.originalName)}</p>` : ""}<p>Feltöltő: <strong>${escapeHtml(image.uploadedBy)}</strong></p><p>Időpont: ${escapeHtml(formatDate(image.createdAt))} · Mentett méret: ${escapeHtml(formatBytes(image.sizeBytes))}</p>${image.comments.length ? `<div class="file-comments"><strong>Megjegyzés</strong>${commentHtml}${shortened ? `<p class="comment-shortened">A hosszú megjegyzés itt rövidítve jelenik meg; a teljes szöveg a TXT exportban szerepel.</p>` : ""}</div>` : `<p class="muted">Nincs a fájlhoz kapcsolt megjegyzés.</p>`}</div></div></article>`;
      }).join("");
      pages.push(`<section class="image-group-page"><div class="image-group-header"><strong>${escapeHtml(group.name)}</strong><span>${group.images.length} kép</span></div><div class="image-page image-layout-${imagesPerPage}">${cards}</div></section>`);
    }
  }
  return pages.join("");
}

function renderHtml(bundle: DropFinalReportBundle, images: ReportImage[], imageSummary: { eligibleCount: number; truncatedCount: number }, generatedAt: string, options: DropReportRenderOptions = {}) {
  const packageRow = bundle.packageRow;
  const imagesPerPage = normalizeReportImagesPerPage(options.imagesPerPage);
  const landscape = imagesPerPage > 1;
  const totalStoredBytes = bundle.files.reduce((sum, file) => sum + Number(file.size_stored_bytes || 0), 0);
  const totalSourceBytes = bundle.files.reduce((sum, file) => {
    const stored = Number(file.size_stored_bytes || file.size_original_bytes || 0);
    return sum + getFileSourceMetric(bundle, file.id, stored).sourceOriginalSizeBytes;
  }, 0);
  const totalSavedPercent = totalSourceBytes > totalStoredBytes
    ? Math.max(0, Math.round((1 - totalStoredBytes / totalSourceBytes) * 100))
    : 0;
  const cleanFiles = bundle.files.filter((file) => file.security_status === "clean" && file.virus_scan_status === "clean" && !file.deleted_at).length;
  const infectedFiles = bundle.files.filter((file) => file.security_status === "infected" || file.virus_scan_status === "infected").length;
  const pendingFiles = Math.max(0, bundle.files.length - cleanFiles - infectedFiles);
  const recipientNames = bundle.recipients.map((recipient) => `${recipient.name || recipient.email}${recipient.company ? ` (${recipient.company})` : ""}`);
  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<title>${escapeHtml(packageRow.title)} - ${escapeHtml(options.reportTitle || "DIMPRO Drop csomagriport")}</title>
<style>
  @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 14mm 11mm 16mm 11mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 10.5px; line-height: 1.45; }
  body { background: #fff; }
  h1, h2, h3, p { margin-top: 0; }
  h1 { margin-bottom: 6px; font-size: 25px; line-height: 1.14; }
  h2 { margin: 0 0 10px; font-size: 16px; color: #0f766e; }
  h3 { margin: 0 0 5px; font-size: 12.5px; }
  .cover { min-height: ${landscape ? "165mm" : "238mm"}; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
  .brand { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #0f766e; padding-bottom: 14px; }
  .mark { width: 47px; height: 47px; border-radius: 13px; display: grid; place-items: center; background: #0f766e; color: #fff; font-size: 19px; font-weight: 900; letter-spacing: -1px; }
  .eyebrow { margin: 0 0 4px; color: #0f766e; font-size: 9px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; }
  .subtitle { margin: 0; color: #475569; font-size: 12px; }
  .cover-main { margin-top: 26px; }
  .project { margin: 12px 0 0; font-size: 13px; font-weight: 700; color: #334155; }
  .code { display: inline-block; margin-top: 14px; border: 1px solid #99f6e4; border-radius: 999px; background: #f0fdfa; padding: 7px 12px; color: #115e59; font-weight: 900; letter-spacing: .08em; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 9px; margin-top: 20px; }
  .metric { border: 1px solid #dbeafe; border-radius: 12px; background: #f8fafc; padding: 12px; }
  .metric span { display: block; color: #64748b; font-size: 8.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .metric strong { display: block; margin-top: 5px; font-size: 13px; }
  .notice { margin-top: 18px; border-left: 4px solid #0f766e; background: #f0fdfa; padding: 12px 14px; color: #134e4a; }
  .cover-footer { color: #64748b; font-size: 9px; }
  .section { page-break-before: always; }
  .section:first-of-type { page-break-before: auto; }
  .section-header { display: flex; justify-content: space-between; align-items: end; gap: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 14px; }
  .section-header p { margin: 0; color: #64748b; font-size: 9px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { background: #0f766e; color: #fff; font-size: 8px; text-align: left; padding: 7px 5px; }
  td { border: 1px solid #cbd5e1; padding: 6px 5px; vertical-align: top; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .file-group-row td { background:#e8f6fa !important; color:#0f172a; border-color:#bae6fd; padding:8px 7px; }
  .file-group-row td span { margin-left:8px; border-radius:999px; background:#cffafe; color:#164e63; padding:2px 7px; font-size:8px; font-weight:900; }
  th:nth-child(1), td:nth-child(1) { width: 4%; }
  th:nth-child(2), td:nth-child(2) { width: 24%; }
  th:nth-child(3), td:nth-child(3) { width: 11%; }
  th:nth-child(4), td:nth-child(4) { width: 12%; }
  th:nth-child(5), td:nth-child(5) { width: 12%; }
  th:nth-child(6), td:nth-child(6) { width: 9%; }
  th:nth-child(7), td:nth-child(7) { width: 17%; }
  th:nth-child(8), td:nth-child(8) { width: 11%; }
  .muted { color: #64748b; font-size: 9px; }
  .mono { font-family: Consolas, monospace; font-size: 8px; }
  .empty { padding: 20px; text-align: center; color: #64748b; }
  .empty-box { border: 1px dashed #cbd5e1; border-radius: 12px; padding: 20px; color: #64748b; text-align: center; }
  .comment { break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 11px; padding: 10px 12px; margin-bottom: 8px; }
  .comment-meta { display: flex; justify-content: space-between; gap: 12px; color: #475569; font-size: 9px; }
  .comment-text { margin-top: 7px; font-size: 10.5px; }
  .image-group-page { break-after: page; page-break-after: always; }
  .image-group-page:last-child { break-after: auto; page-break-after: auto; }
  .image-group-header { break-after: avoid; page-break-after: avoid; display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:10mm; margin:0 0 4mm; padding:7px 10px; border:1px solid #bae6fd; border-radius:10px; background:#e8f6fa; color:#0f172a; }
  .image-group-header strong { font-size:12px; }
  .image-group-header span { border:1px solid #bae6fd; border-radius:999px; background:#fff; padding:3px 8px; color:#164e63; font-size:9px; font-weight:900; }
  .image-page { display:grid; gap:4mm; align-items:stretch; height:${imagesPerPage === 1 ? "215mm" : "145mm"}; }
  .image-layout-1 { grid-template-columns:1fr; grid-template-rows:1fr; }
  .image-layout-2 { grid-template-columns:repeat(2,minmax(0,1fr)); grid-template-rows:1fr; }
  .image-layout-4 { grid-template-columns:repeat(2,minmax(0,1fr)); grid-template-rows:repeat(2,minmax(0,1fr)); }
  .image-layout-6 { grid-template-columns:repeat(3,minmax(0,1fr)); grid-template-rows:repeat(2,minmax(0,1fr)); }
  .image-card { break-inside:avoid; border:1px solid #cbd5e1; border-radius:11px; overflow:hidden; display:flex; flex-direction:column; min-width:0; min-height:0; height:100%; }
  .image-frame { position:relative; flex:0 0 ${imagesPerPage === 1 ? "145mm" : imagesPerPage === 2 ? "78mm" : imagesPerPage === 4 ? "32mm" : "24mm"}; min-height:0; background:#e2e8f0; text-align:center; display:flex; align-items:center; justify-content:center; }
  .image-frame img { display:block; width:100%; height:100%; object-fit:contain; background:#f8fafc; }
  .image-frame img:not([src]), .image-frame img[src=""] { display: none; }
  .image-fallback { display: none; padding: 28px; color: #64748b; }
  .image-frame.failed .image-fallback { display: block; }
  .image-details { display:grid; grid-template-columns:${imagesPerPage >= 4 ? "20px" : "30px"} minmax(0,1fr); gap:${imagesPerPage >= 4 ? "4px" : "6px"}; padding:${imagesPerPage >= 4 ? "4px 6px" : "8px 10px"}; font-size:${imagesPerPage >= 4 ? "7.5px" : "9.4px"}; line-height:${imagesPerPage >= 4 ? "1.28" : "1.45"}; min-height:0; overflow:hidden; }
  .image-number { font-size: ${imagesPerPage >= 4 ? "13px" : "17px"}; font-weight: 900; color: #0f766e; }
  .image-details p { margin: 2px 0; }
  .file-comments { margin-top:${imagesPerPage >= 4 ? "4px" : "8px"}; border-top:1px solid #e2e8f0; padding-top:${imagesPerPage >= 4 ? "4px" : "7px"}; }
  .file-comment { margin-top:${imagesPerPage >= 4 ? "3px" : "6px"}; border-left:${imagesPerPage >= 4 ? "2px" : "3px"} solid #5eead4; padding-left:${imagesPerPage >= 4 ? "5px" : "8px"}; }
  .file-comment span { color:#64748b; font-size:${imagesPerPage >= 4 ? "7px" : "8.5px"}; }
  .file-comment p { margin:${imagesPerPage >= 4 ? "2px 0 0" : "3px 0 0"}; font-size:${imagesPerPage >= 4 ? "7.6px" : "inherit"}; line-height:${imagesPerPage >= 4 ? "1.25" : "inherit"}; }
  .comment-shortened { margin:4px 0 0; color:#64748b; font-size:7.5px; font-style:italic; }
  .summary-table th:nth-child(1), .summary-table td:nth-child(1) { width: 35%; }
  .summary-table th:nth-child(2), .summary-table td:nth-child(2) { width: 65%; }
</style>
</head>
<body>
  <section class="cover">
    <div>
      <div class="brand">
        <div class="mark">DP</div>
        <div><p class="eyebrow">DIMPRO Drop</p><p class="subtitle">${escapeHtml(options.reportTitle || "Csomagriport és megőrzési összesítő")}</p></div>
      </div>
      <div class="cover-main">
        <p class="eyebrow">Lezárt dokumentumcsomag</p>
        <h1>${escapeHtml(packageRow.title)}</h1>
        ${packageRow.project_name_snapshot ? `<p class="project">Projekt: ${escapeHtml(packageRow.project_name_snapshot)}</p>` : ""}
        <div class="code">Csomagkód: ${escapeHtml(packageRow.public_code)}</div>
        <div class="grid">
          <div class="metric"><span>Csomagtípus</span><strong>${escapeHtml(modeLabel(packageRow.mode))}</strong></div>
          <div class="metric"><span>Állapot</span><strong>${escapeHtml(statusLabel(packageRow.status))}</strong></div>
          <div class="metric"><span>Fájlok</span><strong>${bundle.files.length} db · ${escapeHtml(formatBytes(totalStoredBytes))}</strong>${totalSavedPercent > 0 ? `<small class="muted">Mobil eredeti: ${escapeHtml(formatBytes(totalSourceBytes))} · −${totalSavedPercent}%</small>` : ""}</div>
          <div class="metric"><span>Megjegyzések</span><strong>${bundle.comments.length} db</strong></div>
          <div class="metric"><span>Létrehozta</span><strong>${escapeHtml(packageRow.uploader_name || packageRow.uploader_email || "-")}</strong></div>
          <div class="metric"><span>Riport készült</span><strong>${escapeHtml(formatDate(generatedAt))}</strong></div>
        </div>
        <div class="notice"><strong>Biztonsági összesítés:</strong> ${cleanFiles} tiszta, ${infectedFiles} fertőzött/eltávolított, ${pendingFiles} egyéb állapotú fájl. A riport a DIMPRO Drop auditadataiból készült.</div>
      </div>
    </div>
    <div class="cover-footer">Automatikusan generált DIMPRO Drop dokumentum. A riport a fájlok fizikai törlése után is megőrzi a csomag dokumentációs összesítését.</div>
  </section>

  <section class="section">
    <div class="section-header"><div><p class="eyebrow">1. fejezet</p><h2>Csomag- és címzettadatok</h2></div><p>${escapeHtml(packageRow.public_code)}</p></div>
    <table class="summary-table"><tbody>
      <tr><th>Adat</th><th>Érték</th></tr>
      <tr><td>Csomag neve / tárgy</td><td>${escapeHtml(packageRow.title)}</td></tr>
      <tr><td>Csomagkód</td><td>${escapeHtml(packageRow.public_code)}</td></tr>
      <tr><td>Tokenhivatkozás</td><td>${escapeHtml(options.tokenReference || "-")} <span class="muted">(maszkolt referencia, nem használható belépésre)</span></td></tr>
      <tr><td>Feladó</td><td>${escapeHtml(packageRow.uploader_name || packageRow.uploader_email || "-")}${packageRow.uploader_email ? ` &lt;${escapeHtml(packageRow.uploader_email)}&gt;` : ""}</td></tr>
      <tr><td>Üzenet</td><td>${escapeHtml(options.workflow?.senderMessage || packageRow.description || "-").replaceAll("\n", "<br>")}</td></tr>
      <tr><td>Csomagmegjegyzés</td><td>${escapeHtml(options.workflow?.packageNote || "-").replaceAll("\n", "<br>")}</td></tr>
      <tr><td>Projekt</td><td>${escapeHtml(packageRow.project_name_snapshot || "-")}</td></tr>
      <tr><td>Létrehozás</td><td>${escapeHtml(formatDate(packageRow.created_at))}</td></tr>
      <tr><td>Feltöltés zárása</td><td>${escapeHtml(formatDate(packageRow.closed_at || packageRow.upload_closes_at))}</td></tr>
      <tr><td>Lejárat</td><td>${escapeHtml(formatDate(packageRow.expires_at))}</td></tr>
      <tr><td>Türelmi idő vége</td><td>${escapeHtml(formatDate(packageRow.grace_expires_at))}</td></tr>
      <tr><td>Megőrzési beállítás</td><td>${packageRow.retention_days} nap</td></tr>
      <tr><td>Címzettek</td><td>${options.workflow?.showRecipientsOnDownload === false ? "A küldő elrejtette a címzettlistát." : recipientNames.length ? recipientNames.map(escapeHtml).join("<br>") : "-"}</td></tr>
      <tr><td>Riportba bevonható képek</td><td>${imageSummary.eligibleCount} db${imageSummary.truncatedCount ? ` · ${imageSummary.truncatedCount} kép a beállított ${images.length} képes korlát miatt csak a fájllistában szerepel` : ""}</td></tr>
    </tbody></table>
  </section>

  <section class="section">
    <div class="section-header"><div><p class="eyebrow">2. fejezet</p><h2>Fájljegyzék és biztonsági állapot</h2></div><p>${bundle.files.length} fájl</p></div>
    <table><thead><tr><th>#</th><th>Fájlnév</th><th>Csoport</th><th>Feltöltő</th><th>Időpont</th><th>Mentett méret</th><th>Biztonság</th><th>SHA-256</th></tr></thead><tbody>${renderFileRows(bundle)}</tbody></table>
  </section>

  <section class="section">
    <div class="section-header"><div><p class="eyebrow">3. fejezet</p><h2>Csomagszintű megjegyzések</h2></div><p>${bundle.comments.filter((comment) => !comment.file_id).length} bejegyzés</p></div>
    ${renderPackageComments(bundle)}
  </section>

  <section class="section">
    <div class="section-header"><div><p class="eyebrow">4. fejezet</p><h2>Képmelléklet és fájlszintű megjegyzések</h2></div><p>${images.length} kép</p></div>
    ${renderImageCards(images, imagesPerPage)}
  </section>
<script>
  document.querySelectorAll('.image-frame img').forEach((image) => {
    image.addEventListener('error', () => image.parentElement.classList.add('failed'));
  });
</script>
</body>
</html>`;
}

async function waitForReportImages(page: Awaited<ReturnType<Awaited<ReturnType<(typeof import("puppeteer"))["default"]["launch"]>>["newPage"]>>, timeoutMs: number) {
  await page.evaluate(async (timeout) => {
    const images = Array.from(document.images);
    if (!images.length) return;
    const waits = images.map((image) => image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }));
    await Promise.race([
      Promise.all(waits),
      new Promise<void>((resolve) => setTimeout(resolve, Number(timeout))),
    ]);
  }, timeoutMs);
}

export async function renderDropFinalReport(bundle: DropFinalReportBundle, options: DropReportRenderOptions = {}): Promise<RenderedDropFinalReport> {
  const generatedAt = new Date().toISOString();
  const imagesPerPage = normalizeReportImagesPerPage(options.imagesPerPage);
  const { images, eligibleCount, truncatedCount } = await buildReportImages(bundle, imagesPerPage);
  const html = renderHtml(bundle, images, { eligibleCount, truncatedCount }, generatedAt, options);
  let browser: Awaited<ReturnType<(typeof import("puppeteer"))["default"]["launch"]>> | null = null;
  try {
    const { default: puppeteer } = await import("puppeteer");
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setViewport(imagesPerPage > 1
      ? { width: 1754, height: 1240, deviceScaleFactor: 1 }
      : { width: 1240, height: 1754, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForReportImages(page, clampInteger(process.env.DIMPRO_DROP_REPORT_IMAGE_TIMEOUT_SECONDS, 90, 15, 180) * 1000);
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;font-family:Arial,sans-serif;font-size:8px;color:#64748b;padding:0 13mm;display:flex;justify-content:space-between"><span>DIMPRO Drop · ${escapeHtml(bundle.packageRow.public_code)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margin: { top: "14mm", right: "11mm", bottom: "16mm", left: "11mm" },
    });
    const buffer = Buffer.from(bytes);
    const document = await PDFDocument.load(buffer);
    return {
      buffer,
      pageCount: document.getPageCount(),
      fileName: `${safeFileBase(`${bundle.packageRow.public_code}_${bundle.packageRow.title}_${options.fileNameSuffix || "vegleges_riport"}`)}.pdf`,
      generatedAt,
      includedImageCount: images.length,
      eligibleImageCount: eligibleCount,
      truncatedImageCount: truncatedCount,
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
