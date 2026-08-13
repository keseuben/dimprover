export type MForgePatchArtifact = {
  schemaVersion: "benjadmin.mforge.patch.v1";
  summary: string;
  unifiedDiff: string;
  tests: string[];
  notes: string[];
  changedPaths: string[];
};
type Guards = { isSensitivePath: (path: string) => boolean; scanSensitiveText: (value: string) => string[] };
type Row = Record<string, unknown>;
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function list(value: unknown, max = 50) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, max).map((item) => item.slice(0, 500)) : []; }
function changedPathsFromDiff(diff: string) {
  const changed: string[] = [];
  for (const line of diff.split(/\r?\n/)) {
    if (!line.startsWith("diff --git ")) continue;
    const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (!match || match[1] !== match[2]) throw new Error("A provider diff átnevezést vagy hibás diff headert tartalmaz.");
    changed.push(match[1]);
  }
  return Array.from(new Set(changed));
}

export function parseMForgeProviderOutputCore(raw: string, allowedPaths: string[], guards: Guards, limits = { maxOutputBytes: 1024 * 1024, maxDiffBytes: 512 * 1024 }): MForgePatchArtifact {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("A provider output üres.");
  if (Buffer.byteLength(trimmed, "utf8") > limits.maxOutputBytes) throw new Error("A provider output túl nagy.");
  if (trimmed.startsWith("```") || trimmed.endsWith("```")) throw new Error("A provider output markdown code fence-et tartalmaz; szigorú JSON szükséges.");
  let parsed: Row;
  try { parsed = record(JSON.parse(trimmed)); } catch { throw new Error("A provider output nem érvényes JSON."); }
  if (text(parsed.schemaVersion) !== "benjadmin.mforge.patch.v1") throw new Error("Ismeretlen M.Forge provider output séma.");
  const summary = text(parsed.summary).slice(0, 2000);
  const unifiedDiff = typeof parsed.unifiedDiff === "string" ? parsed.unifiedDiff.trim() : "";
  if (!summary) throw new Error("A provider output summary hiányzik.");
  if (!unifiedDiff) throw new Error("A provider output nem tartalmaz patch-et; futás BLOCKED/NO_PATCH állapotba kerülhet.");
  if (Buffer.byteLength(unifiedDiff, "utf8") > limits.maxDiffBytes) throw new Error("A provider unified diff túl nagy.");
  const forbidden = ["new file mode", "deleted file mode", "rename from ", "rename to ", "GIT binary patch", "Binary files ", "--- /dev/null", "+++ /dev/null"];
  const forbiddenHit = forbidden.find((needle) => unifiedDiff.includes(needle));
  if (forbiddenHit) throw new Error(`A provider diff tiltott műveletet tartalmaz: ${forbiddenHit}`);
  const changedPaths = changedPathsFromDiff(unifiedDiff);
  if (!changedPaths.length) throw new Error("A provider diff nem tartalmaz szabványos diff --git headert.");
  const allowed = new Set(allowedPaths);
  for (const filePath of changedPaths) {
    if (!allowed.has(filePath)) throw new Error(`A provider diff scope-on kívüli fájlt módosít: ${filePath}`);
    if (guards.isSensitivePath(filePath)) throw new Error(`A provider diff érzékeny pathot módosít: ${filePath}`);
  }
  const secretHits = guards.scanSensitiveText(unifiedDiff);
  if (secretHits.length) throw new Error(`A provider diff érzékeny mintát tartalmaz: ${secretHits.join(", ")}`);
  return { schemaVersion: "benjadmin.mforge.patch.v1", summary, unifiedDiff, tests: list(parsed.tests), notes: list(parsed.notes), changedPaths };
}
