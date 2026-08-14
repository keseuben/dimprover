import { scanSensitiveText } from "../ai-worker/secret-scanner";

const REDACTED = "[REDACTED_SENSITIVE_TERMINAL_DATA]";

export type TerminalRedactionFinding = {
  type: string;
  start: number;
  end: number;
  replacement: string;
};

export type TerminalRedactionResult = {
  sanitized: string;
  findings: TerminalRedactionFinding[];
};

export function redactTerminalSecrets(raw: string): TerminalRedactionResult {
  const findingTypes = scanSensitiveText(raw);
  if (!findingTypes.length) return { sanitized: raw, findings: [] };
  return {
    sanitized: REDACTED,
    findings: findingTypes.map((type) => ({ type, start: 0, end: raw.length, replacement: REDACTED })),
  };
}

export function sanitizeTerminalText(raw: string) {
  return redactTerminalSecrets(raw).sanitized;
}

export function normalizeAuditCommand(raw: string) {
  return sanitizeTerminalText(raw).replace(/\s+/g, " ").trim().slice(0, 4000);
}

export function buildTerminalDataViews(raw: string) {
  const redaction = redactTerminalSecrets(raw);
  return {
    raw,
    sanitized: redaction.sanitized,
    audit: normalizeAuditCommand(raw),
    findings: redaction.findings,
  } as const;
}
