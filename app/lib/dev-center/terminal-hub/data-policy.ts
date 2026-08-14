import { scanSensitiveText } from "../ai-worker/secret-scanner";

const REDACTED = "[REDACTED_SENSITIVE_TERMINAL_DATA]";

export function sanitizeTerminalText(raw: string) {
  return scanSensitiveText(raw).length ? REDACTED : raw;
}

export function normalizeAuditCommand(raw: string) {
  return sanitizeTerminalText(raw).replace(/\s+/g, " ").trim().slice(0, 4000);
}

export function buildTerminalDataViews(raw: string) {
  return {
    raw,
    sanitized: sanitizeTerminalText(raw),
    audit: normalizeAuditCommand(raw),
  } as const;
}
