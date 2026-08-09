import { createHash } from "node:crypto";
import type { MeetingTranscriptLine } from "./types";

type TranscriptSource = "vtt" | "docx" | "txt" | "paste";

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function cleanText(value: string) {
  return decodeEntities(value)
    .replace(/<v\s+[^>]+>/gi, "")
    .replace(/<\/v>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function idFor(source: TranscriptSource, index: number, at: string, speaker: string, text: string) {
  return `manual-${createHash("sha1").update(`${source}:${index}:${at}:${speaker}:${text}`).digest("hex").slice(0, 24)}`;
}

function normalizeTime(value: string) {
  const match = value.trim().match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,]\d+)?/);
  if (!match) return "";
  const hours = match[1] ? String(Number(match[1])).padStart(2, "0") : "00";
  const minutes = String(Number(match[2])).padStart(2, "0");
  const seconds = String(Number(match[3])).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function parseVtt(content: string, source: TranscriptSource) {
  const blocks = content.replace(/^\uFEFF/, "").replace(/\r/g, "").split(/\n{2,}/);
  const lines: MeetingTranscriptLine[] = [];
  blocks.forEach((block, index) => {
    const rows = block.split("\n").map((row) => row.trim()).filter(Boolean);
    const timeIndex = rows.findIndex((row) => row.includes("-->"));
    if (timeIndex < 0) return;
    const [start] = rows[timeIndex].split("-->").map((row) => row.trim());
    const rawText = rows.slice(timeIndex + 1).join(" ");
    const speakerMatch = rawText.match(/<v\s+([^>]+)>/i);
    const colonMatch = cleanText(rawText).match(/^([^:]{2,120}):\s+(.+)$/);
    const speaker = (speakerMatch?.[1] || colonMatch?.[1] || "Teams átirat").trim().slice(0, 160);
    const text = cleanText(speakerMatch ? rawText : colonMatch?.[2] || rawText).slice(0, 12000);
    const at = normalizeTime(start);
    if (!text) return;
    lines.push({ id: idFor(source, index, at, speaker, text), at, speaker, text, shared: false, source });
  });
  return lines;
}

function parsePlain(content: string, source: TranscriptSource) {
  const rows = content.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n").map((row) => cleanText(row)).filter(Boolean);
  const lines: MeetingTranscriptLine[] = [];
  let pendingSpeaker = "";
  let pendingTime = "";
  rows.forEach((row, index) => {
    const inline = row.match(/^\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?)\]?\s*(?:[-–—]\s*)?([^:]{2,160}):\s*(.+)$/);
    if (inline) {
      const at = normalizeTime(inline[1]);
      const speaker = inline[2].trim().slice(0, 160);
      const text = inline[3].trim().slice(0, 12000);
      lines.push({ id: idFor(source, index, at, speaker, text), at, speaker, text, shared: false, source });
      pendingSpeaker = "";
      pendingTime = "";
      return;
    }
    const speakerTime = row.match(/^([^|]{2,160})\s*[|–—-]\s*((?:\d{1,2}:)?\d{1,2}:\d{2})$/);
    if (speakerTime) {
      pendingSpeaker = speakerTime[1].trim();
      pendingTime = normalizeTime(speakerTime[2]);
      return;
    }
    const speakerOnly = row.match(/^([^:]{2,100}):$/);
    if (speakerOnly) {
      pendingSpeaker = speakerOnly[1].trim();
      return;
    }
    const at = pendingTime;
    const speaker = pendingSpeaker || "Teams átirat";
    const text = row.slice(0, 12000);
    lines.push({ id: idFor(source, index, at, speaker, text), at, speaker, text, shared: false, source });
    pendingTime = "";
  });
  return lines;
}

async function extractDocxText(buffer: Buffer) {
  const imported = await import("jszip");
  const JSZip = imported.default || imported;
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) throw new Error("A DOCX dokumentum fő szövege nem található.");
  return decodeEntities(documentXml
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, ""));
}

export async function parseManualTranscript(input: { buffer?: Buffer; text?: string; source: TranscriptSource }) {
  let content = input.text || "";
  if (input.source === "docx") {
    if (!input.buffer) throw new Error("Hiányzik a DOCX fájl tartalma.");
    content = await extractDocxText(input.buffer);
  } else if (!content && input.buffer) {
    content = input.buffer.toString("utf8");
  }
  if (!content.trim()) throw new Error("Az átirat nem tartalmaz feldolgozható szöveget.");
  const lines = input.source === "vtt" || /WEBVTT|-->/.test(content.slice(0, 5000)) ? parseVtt(content, input.source) : parsePlain(content, input.source);
  if (lines.length === 0) throw new Error("Az átiratból nem sikerült megszólalásokat felismerni.");
  const speakers = [...new Set(lines.map((item) => item.speaker).filter((item) => item && item !== "Teams átirat"))];
  return { lines, speakerCount: speakers.length, speakers };
}
