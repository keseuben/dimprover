import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { MeetingWorkspace } from "./types";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string) {
  if (!value) return "Pontosítandó";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cleanLine(value: string) {
  return value.trim().replace(/^#{1,4}\s+/, "");
}

function stripOuterBold(value: string) {
  const trimmed = value.trim();
  return /^\*\*[^*].*\*\*$/.test(trimmed) ? trimmed.slice(2, -2).trim() : trimmed;
}

function looksLikeHeading(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^#{1,4}\s+/.test(trimmed)) return true;
  if (/^\*\*[^*].*\*\*$/.test(trimmed) && trimmed.length <= 160) return true;
  if (/^[A-ZÁÉÍÓÖŐÚÜŰ0-9][A-ZÁÉÍÓÖŐÚÜŰ0-9\s–—:/.()-]{5,}$/.test(trimmed) && trimmed.length <= 160) return true;
  return false;
}

function inlineMarkdownToHtml(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function draftBodyHtml(draft: string) {
  const lines = draft.replace(/\r\n?/g, "\n").split("\n");
  const parts: string[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (!listItems.length) return;
    parts.push(`<ul>${listItems.map((item) => `<li>${inlineMarkdownToHtml(item)}</li>`).join("")}</ul>`);
    listItems = [];
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      parts.push('<div class="spacer"></div>');
      continue;
    }
    if (/^[-–•]\s+/.test(line)) {
      listItems.push(line.replace(/^[-–•]\s+/, ""));
      continue;
    }
    flushList();
    if (looksLikeHeading(line)) {
      parts.push(`<h2>${inlineMarkdownToHtml(stripOuterBold(cleanLine(line)))}</h2>`);
    } else if (/^Forrás:/i.test(line)) {
      parts.push(`<p class="source">${inlineMarkdownToHtml(line)}</p>`);
    } else {
      parts.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
    }
  }
  flushList();
  return parts.join("\n");
}

export function renderAiDraftHtml(workspace: MeetingWorkspace, draft: string) {
  const body = draftBodyHtml(draft);
  return `<!doctype html>
<html lang="hu">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(workspace.documentLabel)} – ${escapeHtml(workspace.title)}</title>
  <style>
    @page { size: A4; margin: 17mm 16mm 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #0f172a; background: #fff; font-family: Arial, "DejaVu Sans", sans-serif; font-size: 10.8pt; line-height: 1.58; }
    header { border-bottom: 2px solid #0f766e; padding-bottom: 14px; margin-bottom: 22px; }
    .brand { color: #0f766e; font-size: 9.5pt; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
    h1 { margin: 8px 0 0; font-size: 23pt; line-height: 1.15; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 22px; margin-top: 15px; color: #475569; }
    .meta div { border-bottom: 1px solid #cbd5e1; padding: 3px 0; }
    main h2 { margin: 20px 0 7px; color: #0f172a; font-size: 13.5pt; line-height: 1.25; page-break-after: avoid; }
    main p { margin: 5px 0; white-space: pre-wrap; }
    main ul { margin: 5px 0 9px 20px; padding: 0; }
    main li { margin: 3px 0; padding-left: 3px; }
    main strong { font-weight: 800; }
    main code { padding: 1px 4px; border-radius: 4px; background: #f1f5f9; font-family: "DejaVu Sans Mono", monospace; font-size: 9.5pt; }
    .source { margin-top: 7px; color: #64748b; font-size: 9.2pt; }
    .spacer { height: 5px; }
    footer { margin-top: 28px; border-top: 1px solid #cbd5e1; padding-top: 10px; color: #64748b; font-size: 8.5pt; }
  </style>
</head>
<body>
  <header>
    <div class="brand">DIMPRO Értekezleti Asszisztens</div>
    <h1>${escapeHtml(workspace.documentLabel)}</h1>
    <div class="meta">
      <div><b>Értekezlet:</b> ${escapeHtml(workspace.title)}</div>
      <div><b>Projekt:</b> ${escapeHtml(workspace.projectName || "-")}</div>
      <div><b>Dátum:</b> ${escapeHtml(formatDate(workspace.scheduledStart || workspace.createdAt))}</div>
      <div><b>Dokumentumszám:</b> ${escapeHtml(workspace.minuteNumber || "Nincs lefoglalva")}</div>
    </div>
  </header>
  <main>${body || "<p>Még nincs exportálható AI-dokumentumtervezet.</p>"}</main>
  <footer>
    AI által támogatott, emberi ellenőrzésre szánt dokumentumtervezet. Az export a DIMPRO AI Dokumentumműhelyben látható aktuális tervezetből készült.
  </footer>
</body>
</html>`;
}

function docxCell(value: string, bold = false) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: value || "-", bold })] })],
  });
}

function metadataTable(workspace: MeetingWorkspace) {
  const rows = [
    ["Értekezlet", workspace.title, "Projekt", workspace.projectName || "-"],
    ["Dátum", formatDate(workspace.scheduledStart || workspace.createdAt), "Dokumentumszám", workspace.minuteNumber || "Nincs lefoglalva"],
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
    },
    rows: rows.map((row) => new TableRow({
      children: row.map((value, index) => docxCell(value, index % 2 === 0)),
    })),
  });
}

function inlineRuns(value: string, options?: { muted?: boolean }) {
  const parts = value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) => {
    const bold = /^\*\*[^*]+\*\*$/.test(part);
    return new TextRun({
      text: bold ? part.slice(2, -2) : part.replaceAll("`", ""),
      bold,
      color: options?.muted ? "64748B" : undefined,
      size: options?.muted ? 18 : 22,
    });
  });
}

function draftParagraphs(draft: string) {
  const paragraphs: Paragraph[] = [];
  const lines = draft.replace(/\r\n?/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      paragraphs.push(new Paragraph({ text: "", spacing: { after: 60 } }));
      continue;
    }
    if (/^[-–•]\s+/.test(line)) {
      paragraphs.push(new Paragraph({
        children: inlineRuns(line.replace(/^[-–•]\s+/, "")),
        bullet: { level: 0 },
        spacing: { after: 60 },
      }));
      continue;
    }
    if (looksLikeHeading(line)) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: stripOuterBold(cleanLine(line)), bold: true, color: "0F172A", size: 27 })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 220, after: 90 },
      }));
      continue;
    }
    const muted = /^Forrás:/i.test(line);
    paragraphs.push(new Paragraph({
      children: inlineRuns(line, { muted }),
      spacing: { after: muted ? 100 : 75 },
    }));
  }
  return paragraphs;
}

export async function renderAiDraftDocx(workspace: MeetingWorkspace, draft: string) {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      children: [new TextRun({ text: "DIMPRO ÉRTEKEZLETI ASSZISZTENS", bold: true, color: "0F766E", size: 20 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      text: workspace.documentLabel,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 150 },
    }),
    metadataTable(workspace),
    new Paragraph({ text: "", spacing: { after: 140 } }),
    ...draftParagraphs(draft),
    new Paragraph({
      children: [new TextRun({
        text: `AI által támogatott, emberi ellenőrzésre szánt dokumentumtervezet · Generálva: ${new Date().toLocaleString("hu-HU")}`,
        color: "64748B",
        size: 17,
      })],
      spacing: { before: 300 },
    }),
  ];

  const document = new Document({ sections: [{ properties: {}, children }] });
  return Buffer.from(await Packer.toBuffer(document));
}
