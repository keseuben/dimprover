export const VGUARD_REVIEW_SCHEMA = "benjadmin.vguard.review.v1";
export const VGUARD_REVIEW_RESULTS = ["PASS", "PASS_WITH_NOTES", "FAIL"] as const;
export const VGUARD_FINDING_SEVERITIES = ["INFO", "WARNING", "HIGH", "BLOCKER"] as const;
export const VGUARD_FINDING_CATEGORIES = ["SECURITY", "REGRESSION", "QUALITY", "TEST", "SCOPE", "OTHER"] as const;

export type VGuardReviewResult = typeof VGUARD_REVIEW_RESULTS[number];
export type VGuardReviewFinding = {
  severity: typeof VGUARD_FINDING_SEVERITIES[number];
  category: typeof VGUARD_FINDING_CATEGORIES[number];
  message: string;
  path: string | null;
};
export type VGuardReviewOutput = {
  schemaVersion: typeof VGUARD_REVIEW_SCHEMA;
  result: VGuardReviewResult;
  summary: string;
  findings: VGuardReviewFinding[];
  tests: string[];
  notes: string[];
};

function text(value: unknown, max = 4000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function list(value: unknown, maxItems = 50, maxText = 1000) { return Array.isArray(value) ? value.slice(0, maxItems).map((item) => text(item, maxText)).filter(Boolean) : []; }

export function parseVGuardReviewOutput(raw: string, allowedPaths: string[]): VGuardReviewOutput {
  if (!raw.trim()) throw new Error("A V.Guard review output üres.");
  if (Buffer.byteLength(raw, "utf8") > 512 * 1024) throw new Error("A V.Guard review output túl nagy.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("A V.Guard review output nem érvényes JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("A V.Guard review output objektum kell legyen.");
  const obj = parsed as Record<string, unknown>;
  if (obj.schemaVersion !== VGUARD_REVIEW_SCHEMA) throw new Error("Ismeretlen V.Guard review schemaVersion.");
  const result = text(obj.result).toUpperCase() as VGuardReviewResult;
  if (!VGUARD_REVIEW_RESULTS.includes(result)) throw new Error("Érvénytelen V.Guard review eredmény.");
  const summary = text(obj.summary, 3000);
  if (!summary) throw new Error("A V.Guard review summary kötelező.");
  const allowed = new Set(allowedPaths);
  const findingRows = Array.isArray(obj.findings) ? obj.findings.slice(0, 50) : [];
  const findings: VGuardReviewFinding[] = findingRows.map((value) => {
    const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const severity = text(row.severity).toUpperCase() as VGuardReviewFinding["severity"];
    const category = text(row.category).toUpperCase() as VGuardReviewFinding["category"];
    const message = text(row.message, 1600);
    const filePath = text(row.path, 500) || null;
    if (!VGUARD_FINDING_SEVERITIES.includes(severity)) throw new Error("Érvénytelen V.Guard finding severity.");
    if (!VGUARD_FINDING_CATEGORIES.includes(category)) throw new Error("Érvénytelen V.Guard finding category.");
    if (!message) throw new Error("A V.Guard finding message kötelező.");
    if (filePath && !allowed.has(filePath)) throw new Error(`A V.Guard finding scope-on kívüli pathot jelöl: ${filePath}`);
    return { severity, category, message, path: filePath };
  });
  if (result === "PASS" && findings.some((item) => item.severity === "HIGH" || item.severity === "BLOCKER")) throw new Error("PASS eredmény nem tartalmazhat HIGH/BLOCKER findingot.");
  if (result === "FAIL" && !findings.some((item) => item.severity === "HIGH" || item.severity === "BLOCKER")) throw new Error("FAIL eredményhez HIGH vagy BLOCKER finding szükséges.");
  return { schemaVersion: VGUARD_REVIEW_SCHEMA, result, summary, findings, tests: list(obj.tests), notes: list(obj.notes) };
}
