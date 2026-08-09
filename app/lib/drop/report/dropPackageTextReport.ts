import type { DropFinalReportBundle } from "./dropReportRepository";
import type { DropPackageWorkflowRecord } from "../public/dropPublicTypes";
import type { DropFileRecord } from "../dropTypes";

function clean(value: unknown) { return String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim(); }
function multiline(value: unknown) { return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() || "-"; }
function safeBase(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 120) || "DIMPRO_DROP"; }

type TextGroup = { key: string; name: string; sortOrder: number; ungrouped: boolean; files: DropFileRecord[] };

function buildTextGroups(bundle: DropFinalReportBundle): TextGroup[] {
  const groupById = new Map(bundle.groups.map((group) => [group.id, group]));
  const buckets = new Map<string, TextGroup>();
  for (const file of bundle.files) {
    const group = file.group_id ? groupById.get(file.group_id) || null : null;
    const key = group ? `group:${group.id}` : "__ungrouped__";
    const current = buckets.get(key);
    if (current) current.files.push(file);
    else buckets.set(key, { key, name: group?.name || "Csoport nélkül", sortOrder: group?.sort_order ?? Number.MAX_SAFE_INTEGER, ungrouped: !group, files: [file] });
  }
  return Array.from(buckets.values()).sort((left, right) => {
    if (left.ungrouped !== right.ungrouped) return left.ungrouped ? 1 : -1;
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.name.localeCompare(right.name, "hu-HU");
  });
}

export function buildDropPackageTextReport(input: {
  bundle: DropFinalReportBundle;
  workflow?: DropPackageWorkflowRecord | null;
  tokenReference?: string | null;
}) {
  const { bundle, workflow } = input;
  const commentsByFile = new Map<string, string[]>();
  const packageComments: string[] = [];
  for (const comment of bundle.comments) {
    if (!comment.file_id) { packageComments.push(`${clean(comment.author_name)}: ${multiline(comment.comment_text)}`); continue; }
    const rows = commentsByFile.get(comment.file_id) || [];
    rows.push(`${clean(comment.author_name)}: ${multiline(comment.comment_text)}`);
    commentsByFile.set(comment.file_id, rows);
  }
  const recipientText = workflow?.showRecipientsOnDownload === false
    ? "A küldő elrejtette a címzettlistát."
    : bundle.recipients.map((recipient) => `${clean(recipient.name || recipient.email)} <${clean(recipient.email)}>${recipient.company ? ` · ${clean(recipient.company)}` : ""}`).join(", ") || "-";
  const groups = buildTextGroups(bundle);
  const lines = [
    "DIMPRO DROP – CSOMAGRIPORT / MEGJEGYZÉS EXPORT",
    "",
    `Csomag neve / tárgy: ${clean(bundle.packageRow.title)}`,
    `Csomagkód: ${clean(bundle.packageRow.public_code)}`,
    `Tokenhivatkozás: ${clean(input.tokenReference || "-")} (maszkolt referencia)`,
    `Feladó: ${clean(bundle.packageRow.uploader_name || bundle.packageRow.uploader_email || "-")}${bundle.packageRow.uploader_email ? ` <${clean(bundle.packageRow.uploader_email)}>` : ""}`,
    `Címzettek: ${recipientText}`,
    `Üzenet: ${multiline(workflow?.senderMessage || "-")}`,
    `Csomagmegjegyzés: ${multiline(workflow?.packageNote || packageComments.join(" | ") || "-")}`,
    `Létrehozás: ${clean(bundle.packageRow.created_at)}`,
    `Lejárat: ${clean(bundle.packageRow.expires_at)}`,
    `Fájlok száma: ${bundle.files.length}`,
    `Csoportok száma: ${groups.length}`,
    "",
    "CSOPORTÖSSZESÍTŐ",
    ...groups.map((group) => `- ${group.name} · ${group.files.length} kép/fájl`),
    "",
    "FÁJLOK ÉS MEGJEGYZÉSEK",
  ];
  let globalIndex = 0;
  for (const group of groups) {
    lines.push("", `=== ${clean(group.name).toLocaleUpperCase("hu-HU")} · ${group.files.length} KÉP/FÁJL ===`, "");
    for (const file of group.files) {
      globalIndex += 1;
      const comments = commentsByFile.get(file.id) || [];
      lines.push(`${globalIndex}. ${clean(file.display_name)}`);
      if (file.original_name !== file.display_name) lines.push(`   Eredeti fájlnév: ${clean(file.original_name)}`);
      lines.push(`   Megjegyzés: ${comments.length ? comments.map(multiline).join(" || ") : "-"}`, "");
    }
  }
  lines.push("A TXT UTF-8 kódolású. A teljes hozzáférési token biztonsági okból nem kerül az exportba.");
  const text = `\uFEFF${lines.join("\r\n")}\r\n`;
  return { buffer: Buffer.from(text, "utf8"), fileName: `${safeBase(`${bundle.packageRow.public_code}_${bundle.packageRow.title}_megjegyzesek`)}.txt` };
}
