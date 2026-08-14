import { createHash } from "node:crypto";
import { buildTerminalDataViews } from "./data-policy";
import type { TerminalOutputChunk } from "./session-types";

export type SanitizedTerminalChunk = { sequence: number; data: string; createdAt: string; findingCount: number };
export type TerminalAuditChunk = { sequence: number; sha256: string; byteLength: number; findingCount: number; createdAt: string };

export function toSanitizedTerminalChunks(chunks: TerminalOutputChunk[]): SanitizedTerminalChunk[] {
  return chunks.map((chunk) => {
    const views = buildTerminalDataViews(chunk.data);
    return { sequence: chunk.sequence, data: views.sanitized, createdAt: chunk.createdAt, findingCount: views.findings.length };
  });
}

export function toTerminalAuditChunks(chunks: TerminalOutputChunk[]): TerminalAuditChunk[] {
  return chunks.map((chunk) => {
    const views = buildTerminalDataViews(chunk.data);
    return {
      sequence: chunk.sequence,
      sha256: createHash("sha256").update(views.audit).digest("hex"),
      byteLength: Buffer.byteLength(views.audit, "utf8"),
      findingCount: views.findings.length,
      createdAt: chunk.createdAt,
    };
  });
}
