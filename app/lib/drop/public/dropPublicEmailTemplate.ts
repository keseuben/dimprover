import type { DropPublicEmailPreviewBundle } from "./dropPublicEmailPreview";

export type DropPublicMailFile = {
  id: string;
  name: string;
  sizeBytes: number;
  comments: string[];
  mimeType: string;
  isImage: boolean;
  storageKey: string;
  storageBucket?: string | null;
  directUrl?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  groupSortOrder?: number | null;
};

export type DropPublicDeliveryEmailContentInput = {
  recipientName: string;
  allRecipients?: Array<{ name: string; email: string }>;
  showRecipients?: boolean;
  uploaderName: string;
  uploaderEmail: string;
  subject: string;
  senderMessage: string;
  packageNote: string;
  expiresAt: string;
  files: DropPublicMailFile[];
  downloadUrl: string;
  downloadPin: string | null;
  previewBundle: DropPublicEmailPreviewBundle;
  testMode?: boolean;
  testClientLabel?: string;
};

type MailGroup = { key: string; name: string; sortOrder: number; files: DropPublicMailFile[]; ungrouped: boolean };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}
function textBlock(value: string) { return value.trim() ? value : "–"; }
function formatFileSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value; let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toLocaleString("hu-HU", { maximumFractionDigits: unit > 1 ? 1 : 0 })} ${units[unit]}`;
}
function fileBadge(file: DropPublicMailFile) {
  if (file.isImage) return "KÉP";
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toUpperCase().slice(0, 6) : "FÁJL";
  return extension || "FÁJL";
}
function buildMailGroups(files: DropPublicMailFile[]) {
  const byKey = new Map<string, MailGroup>();
  for (const file of files) {
    const named = Boolean(file.groupId && file.groupName?.trim());
    const key = named ? `group:${file.groupId}` : "__ungrouped__";
    const existing = byKey.get(key);
    if (existing) { existing.files.push(file); continue; }
    byKey.set(key, {
      key,
      name: named ? file.groupName!.trim() : "Csoport nélkül",
      sortOrder: named && Number.isFinite(file.groupSortOrder) ? Number(file.groupSortOrder) : Number.MAX_SAFE_INTEGER,
      files: [file],
      ungrouped: !named,
    });
  }
  return Array.from(byKey.values()).sort((left, right) => {
    if (left.ungrouped !== right.ungrouped) return left.ungrouped ? 1 : -1;
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.name.localeCompare(right.name, "hu-HU");
  });
}
function groupAnchor(index: number) { return `drop-group-${index + 1}`; }

export function buildDropPublicDeliveryEmailContent(input: DropPublicDeliveryEmailContentInput) {
  const formattedPin = input.downloadPin ? `${input.downloadPin.slice(0, 3)}-${input.downloadPin.slice(3)}` : null;
  const expires = new Date(input.expiresAt).toLocaleString("hu-HU");
  const previewByFileId = new Map(input.previewBundle.previews.map((preview) => [preview.fileId, preview]));
  const allGroups = buildMailGroups(input.files);
  const orderedFiles = allGroups.flatMap((group) => group.files);
  const visibleFiles = orderedFiles.slice(0, 20);
  const visibleIds = new Set(visibleFiles.map((file) => file.id));
  const hiddenFileCount = Math.max(0, input.files.length - visibleFiles.length);

  const fileText = allGroups.map((group) => {
    const visible = group.files.filter((file) => visibleIds.has(file.id));
    if (!visible.length) return "";
    return [
      `=== ${group.name.toLocaleUpperCase("hu-HU")} · ${group.files.length} KÉP/FÁJL ===`,
      ...visible.map((file) => [
        `${file.name} (${formatFileSize(file.sizeBytes)})`,
        ...file.comments.map((comment) => `  Megjegyzés: ${comment}`),
      ].join("\n")),
    ].join("\n");
  }).filter(Boolean).join("\n\n");

  const testNoticeText = input.testMode ? [
    "TESZTÜZENET – NEM VALÓDI FÁJLKÜLDEMÉNY",
    `Vizsgált levelezőkliens: ${input.testClientLabel || "nincs megadva"}`,
    "A levél kizárólag a DIMPRO Drop képelőnézet és levélsablon megjelenítésének ellenőrzésére szolgál.", "",
  ] : [];

  const text = [
    ...testNoticeText, "DIMPRO Drop – fájlküldemény érkezett", "",
    `Címzett: ${input.recipientName}`,
    `Feladó: ${input.uploaderName} <${input.uploaderEmail}>`,
    `Tárgy: ${input.subject}`,
    ...(input.showRecipients !== false ? [`Címzettek:\n${(input.allRecipients || []).length ? (input.allRecipients || []).map((recipient) => `- ${recipient.name || recipient.email} <${recipient.email}>`).join("\n") : "–"}`] : []),
    `Üzenet: ${textBlock(input.senderMessage)}`,
    `Csomagmegjegyzés: ${textBlock(input.packageNote)}`, "",
    `Csoportok (${allGroups.length}):`,
    ...allGroups.map((group) => `- ${group.name} · ${group.files.length} kép/fájl`), "",
    `Fájlok a levélben (${visibleFiles.length}/${input.files.length}):`, fileText,
    ...(hiddenFileCount ? [`További ${hiddenFileCount} fájl a biztonságos Drop-linken érhető el.`] : []), "",
    `Letöltési link: ${input.downloadUrl}`,
    "Több fájl esetén a letöltőoldalon az összes fájl egyetlen ZIP-csomagban is letölthető.",
    ...(formattedPin ? [`Letöltési kód: ${formattedPin}`, "A linket és a kódot együtt kell használni."] : []),
    `Elérhető eddig: ${expires}`, "",
    input.testMode ? "A tesztlink nem tartozik valódi csomaghoz." : "A fájlokat a DIMPRO ClamAV-vírusellenőrzése tisztának minősítette. A letöltés naplózott és időkorlátos.",
  ].join("\n");

  function renderFileCard(file: DropPublicMailFile) {
    const preview = previewByFileId.get(file.id);
    const comments = file.comments.length
      ? `<div class="drop-comment" style="margin-top:8px;padding:9px 11px;border-radius:9px;background:#f8fafc;color:#334155;font-family:Arial,sans-serif;font-size:12px;line-height:1.55">${file.comments.map((comment) => `<div style="margin:2px 0"><strong>Megjegyzés:</strong> ${escapeHtml(comment)}</div>`).join("")}</div>` : "";
    const previewImage = preview ? `<img src="cid:${escapeHtml(preview.cid)}" width="180" height="120" alt="${escapeHtml(file.name)} előnézete" style="display:block;width:180px;height:120px;max-width:180px;object-fit:cover;border:0;border-radius:10px;background:#e2e8f0;color:#334155;font-family:Arial,sans-serif;font-size:12px;line-height:120px;text-align:center">` : "";
    const visual = preview
      ? (file.directUrl ? `<a href="${escapeHtml(file.directUrl)}" target="_blank" rel="noopener" title="Kép megnyitása új ablakban" style="display:block;text-decoration:none">${previewImage}</a>` : previewImage)
      : `<table role="presentation" cellpadding="0" cellspacing="0" width="72" height="72" style="width:72px;height:72px;border-collapse:separate"><tr><td width="72" height="72" align="center" valign="middle" bgcolor="#e6f6f7" style="width:72px;height:72px;border-radius:10px;background:#e6f6f7;color:#0f766e;font-family:Arial,sans-serif;font-size:12px;font-weight:900;letter-spacing:.08em">${escapeHtml(fileBadge(file))}</td></tr></table>`;
    return `<tr><td style="padding:0 0 10px"><table role="presentation" class="drop-card" cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff" style="width:100%;border:1px solid #dbe4ea;border-radius:14px;background:#ffffff;border-collapse:separate"><tr><td class="drop-preview-cell" width="${preview ? "204" : "96"}" style="width:${preview ? "204px" : "96px"};padding:12px;vertical-align:top">${visual}</td><td class="drop-file-meta" style="padding:14px 14px 14px 0;vertical-align:top;font-family:Arial,sans-serif"><div class="drop-title" style="font-size:14px;font-weight:800;line-height:1.45;color:#0f172a;word-break:break-word">${escapeHtml(file.name)}</div><div class="drop-muted" style="margin-top:5px;font-size:12px;line-height:1.45;color:#64748b">${escapeHtml(formatFileSize(file.sizeBytes))}${file.isImage ? " · kép" : ""}</div></td></tr>${comments ? `<tr><td colspan="2" class="drop-comment-cell" style="padding:0 12px 12px">${comments}</td></tr>` : ""}</table></td></tr>`;
  }

  const groupSummaryHtml = allGroups.length ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f0f9fc" style="width:100%;margin:16px 0;border:1px solid #bae6fd;border-radius:12px;background:#f0f9fc;border-collapse:separate"><tr><td style="padding:12px 14px;font-family:Arial,sans-serif"><div style="font-size:11px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#0369a1">Csoportok összesítője</div>${allGroups.map((group, index) => `<div style="margin-top:8px"><a href="#${groupAnchor(index)}" style="color:#0f172a;text-decoration:none;font-size:13px;font-weight:800">${escapeHtml(group.name)}</a> <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;background:#cffafe;color:#164e63;font-size:11px;font-weight:900">${group.files.length} kép/fájl</span></div>`).join("")}</td></tr></table>` : "";

  const groupedFileHtml = allGroups.map((group, index) => {
    const visible = group.files.filter((file) => visibleIds.has(file.id));
    if (!visible.length) return "";
    return `<tr><td id="${groupAnchor(index)}" style="padding:8px 0 10px"><a name="${groupAnchor(index)}"></a><table role="presentation" class="drop-group-head" cellpadding="0" cellspacing="0" width="100%" bgcolor="#e8f6fa" style="width:100%;border:1px solid #bae6fd;border-radius:11px;background:#e8f6fa;border-collapse:separate"><tr><td style="padding:10px 12px;font-family:Arial,sans-serif;color:#0f172a"><strong style="font-size:14px">${escapeHtml(group.name)}</strong><span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#cffafe;color:#164e63;font-size:11px;font-weight:900">${group.files.length} kép/fájl</span></td></tr></table></td></tr>${visible.map(renderFileCard).join("")}`;
  }).join("");

  const previewSummary = input.previewBundle.previews.length ? `<p class="drop-muted" style="margin:8px 0 14px;font-family:Arial,sans-serif;font-size:12px;line-height:1.55;color:#64748b">${input.previewBundle.previews.length} kép kis előnézete beágyazva. A képre kattintva külön böngésző-megnyitás indul; a teljes csomag a biztonságos Drop-linken érhető el.</p>` : "";
  const hiddenFilesNotice = hiddenFileCount ? `<p class="drop-muted" style="margin:8px 0 14px;padding:10px 12px;border-radius:10px;background:#f8fafc;font-family:Arial,sans-serif;font-size:12px;line-height:1.55;color:#475569"><strong>További ${hiddenFileCount} fájl</strong> nem jelenik meg a levélben; a teljes csomag a biztonságos Drop-linken érhető el.</p>` : "";
  const openButton = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 20px;border-collapse:separate"><tr><td bgcolor="#0f766e" style="border-radius:12px;background:#0f766e"><a href="${escapeHtml(input.downloadUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 20px;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:800;text-decoration:none">${input.testMode ? "Tesztoldal megnyitása" : "Fájlok megnyitása"}</a></td></tr></table>`;
  const testBanner = input.testMode ? `<table role="presentation" class="drop-test" cellpadding="0" cellspacing="0" width="100%" bgcolor="#fff7ed" style="width:100%;margin:0 0 16px;border:1px solid #fdba74;border-collapse:separate"><tr><td class="drop-test" style="padding:14px 16px;font-family:Arial,sans-serif;color:#7c2d12"><div style="font-size:13px;font-weight:900;letter-spacing:.04em">TESZTÜZENET – NEM VALÓDI FÁJLKÜLDEMÉNY</div><div style="margin-top:5px;font-size:12px;line-height:1.5">Vizsgált kliens: <strong>${escapeHtml(input.testClientLabel || "nincs megadva")}</strong>. A levél a tényleges DIMPRO Drop sablont és CID-képelőnézetet ellenőrzi.</div></td></tr></table>` : "";
  const footerText = input.testMode ? "Ez egy adminisztrátori kompatibilitási teszt. A hivatkozás nem tartozik valódi csomaghoz." : "A fájlokat a DIMPRO ClamAV-vírusellenőrzése tisztának minősítette. A letöltés időkorlátos és auditált.";

  const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>
:root{color-scheme:light dark;supported-color-schemes:light dark}@media only screen and (max-width:520px){.drop-shell{padding:16px!important}.drop-preview-cell{width:132px!important;padding:10px!important}.drop-preview-cell img{width:120px!important;height:90px!important;max-width:120px!important;line-height:90px!important}.drop-file-meta{padding:12px 10px 10px 0!important}.drop-title{font-size:12px!important;line-height:1.35!important}.drop-comment-cell{padding:0 10px 10px!important}.drop-comment{margin-top:0!important;padding:10px!important;font-size:13px!important;line-height:1.55!important}}@media(prefers-color-scheme:dark){body.drop-page,table.drop-page{background:#07131c!important;color:#f8fafc!important}.drop-shell{background:#0f1f2c!important;border-color:#334155!important;color:#f8fafc!important}.drop-card{background:#162737!important;border-color:#334155!important}.drop-title{color:#f8fafc!important}.drop-muted{color:#cbd5e1!important}.drop-comment{background:#203244!important;color:#e2e8f0!important}.drop-group-head{background:#193445!important;border-color:#475569!important;color:#f8fafc!important}.drop-pin{background:#3b2f12!important;border-color:#f59e0b!important;color:#fef3c7!important}.drop-test{background:#3a2415!important;border-color:#fb923c!important;color:#ffedd5!important}}[data-ogsc] .drop-shell{background:#0f1f2c!important;border-color:#334155!important;color:#f8fafc!important}[data-ogsc] .drop-card{background:#162737!important;border-color:#334155!important}[data-ogsc] .drop-title{color:#f8fafc!important}[data-ogsc] .drop-muted{color:#cbd5e1!important}[data-ogsc] .drop-comment{background:#203244!important;color:#e2e8f0!important}
</style><title>${escapeHtml(input.subject)}</title></head><body class="drop-page" bgcolor="#f4f8fa" style="margin:0;padding:0;background:#f4f8fa;color:#0f172a"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.testMode ? "DIMPRO Drop tesztlevél – képelőnézet ellenőrzése" : `${input.uploaderName} fájlokat küldött Önnek`)}</div><table role="presentation" class="drop-page" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f4f8fa" style="width:100%;background:#f4f8fa;border-collapse:collapse"><tr><td align="center" style="padding:16px 8px"><table role="presentation" cellpadding="0" cellspacing="0" width="720" style="width:100%;max-width:720px;border-collapse:separate"><tr><td bgcolor="#071d2b" style="padding:24px;border-radius:18px 18px 0 0;background:#071d2b;color:#ffffff;font-family:Arial,sans-serif"><p style="margin:0;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#67e8f9">DIMPRO Drop</p><h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;color:#ffffff">${input.testMode ? "Képelőnézet teszt" : "Fájlküldemény érkezett"}</h1></td></tr><tr><td class="drop-shell" bgcolor="#ffffff" style="border:1px solid #cbd5e1;border-top:0;padding:24px;border-radius:0 0 18px 18px;background:#ffffff;font-family:Arial,sans-serif;color:#0f172a">${testBanner}<p style="margin:0 0 14px;font-size:15px;line-height:1.6"><strong>${escapeHtml(input.uploaderName)}</strong> fájlokat küldött Önnek.</p><p style="margin:0 0 12px;font-size:14px;line-height:1.6"><strong>Tárgy:</strong> ${escapeHtml(input.subject)}</p>${input.showRecipients !== false ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.6"><strong>Címzettek:</strong><br>${(input.allRecipients || []).length ? (input.allRecipients || []).map((recipient) => `${escapeHtml(recipient.name || recipient.email)} &lt;<a href="mailto:${escapeHtml(recipient.email)}" style="color:#075985;text-decoration:none">${escapeHtml(recipient.email)}</a>&gt;`).join("<br>") : "–"}</p>` : ""}<p style="margin:0 0 12px;font-size:14px;line-height:1.6"><strong>Üzenet:</strong><br>${escapeHtml(textBlock(input.senderMessage)).replace(/\n/g, "<br>")}</p>${openButton}${input.packageNote ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.6"><strong>Csomagmegjegyzés:</strong><br>${escapeHtml(input.packageNote).replace(/\n/g, "<br>")}</p>` : ""}${groupSummaryHtml}<p style="margin:24px 0 8px;font-size:14px;line-height:1.5"><strong>Feltöltött fájlok (${input.files.length}):</strong></p>${previewSummary}<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse">${groupedFileHtml}</table>${hiddenFilesNotice}${openButton}${formattedPin ? `<table role="presentation" class="drop-pin" cellpadding="0" cellspacing="0" width="100%" bgcolor="#fffbeb" style="width:100%;border:1px solid #f59e0b;border-radius:12px;background:#fffbeb;border-collapse:separate"><tr><td class="drop-pin" style="padding:16px;font-family:Arial,sans-serif;color:#78350f"><strong>Letöltési kód:</strong><div style="font-size:28px;font-weight:900;letter-spacing:.12em;margin-top:6px">${formattedPin}</div><p style="margin:8px 0 0;font-size:13px;line-height:1.5">A link és a kód együtt szükséges.</p></td></tr></table>` : ""}<p class="drop-muted" style="margin:14px 0 0;font-size:12px;line-height:1.55;color:#475569">Több fájl esetén a letöltőoldalon az összes fájl egyetlen ZIP-csomagban is letölthető.</p><p class="drop-muted" style="margin:18px 0 0;font-size:13px;line-height:1.55;color:#475569">Elérhető eddig: <strong>${escapeHtml(expires)}</strong></p><p class="drop-muted" style="margin:12px 0 0;font-size:12px;line-height:1.55;color:#64748b">${escapeHtml(footerText)}</p></td></tr></table></td></tr></table></body></html>`;

  return { text, html, formattedPin, previewCount: input.previewBundle.previews.length, previewBytes: input.previewBundle.totalBytes };
}
