import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { classifyScopePath, highestRisk, type ScopeCandidate } from "./scope-policy";
import { isSensitivePath, scanSensitiveText } from "./secret-scanner";

const execFileAsync = promisify(execFile);
const ANALYZER_VERSION = "1.1.1";
const MAX_CANDIDATES = 24;
const MAX_CONTENT_BYTES = 256 * 1024;
const stopWords = new Set(["hogy","legyen","lehessen","kell","egy","az","es","vagy","ami","amit","mellett","feladat","modul","dimpro","dimprover","benjadmin","szeretnem","szeretne","with","from","this","that","the","and","for"]);

function projectRoot() {
  const cwd = process.cwd();
  const suffix = `${path.sep}.next${path.sep}standalone`;
  if (cwd.endsWith(suffix)) return cwd.slice(0, -suffix.length);
  return process.env.DIMPRO_PROJECT_ROOT?.trim() || cwd;
}
function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function tokens(value: string) {
  return [...new Set(normalize(value).split(/[^a-z0-9]+/).filter((item) => item.length >= 4 && !stopWords.has(item)))].slice(0, 14);
}
function moduleHints(value: string) {
  const v = normalize(value);
  const hints: string[] = [];
  if (v.includes("projektkapu")) hints.push("projektkapu");
  if (v.includes("dokumentumverzi") || v.includes("documentversion") || v.includes("document version")) hints.push("drive/documents", "versions", "documents");
  if (v.includes("osszehasonlit") || v.includes("compare")) hints.push("versions", "review");
  if (v.includes("drive")) hints.push("drive");
  if (v.includes("drop")) hints.push("drop");
  if (v.includes("benjadmin")) hints.push("developer-console", "dev-center", "admin/dev");
  if (v.includes("jegyz")) hints.push("minutes", "jegyzokonyv");
  if (v.includes("utemez")) hints.push("utemez", "schedule", "timeline");
  if (v.includes("fajlmuhely")) hints.push("fajlmuhely", "file-workshop", "viewers");
  if (v.includes("ertekez")) hints.push("meeting", "ertekez");
  return [...new Set(hints)];
}
function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

const genericScopeHints = new Set(["versions", "documents", "review"]);
function pathHintHits(filePath: string, hints: string[]) {
  const normalizedPath = normalize(filePath);
  return hints.filter((hint) => normalizedPath.includes(normalize(hint)));
}
function scopeConfidence(filePath: string, hints: string[], evidence: string[]) {
  const hits = pathHintHits(filePath, hints);
  const strongHit = hits.some((hint) => hint.includes("/") || !genericScopeHints.has(hint));
  const directImport = evidence.some((item) => item.startsWith("Közvetlen importfüggőség:"));
  return { hits, strongHit, directImport, highConfidence: strongHit || hits.length >= 2 || directImport };
}

async function trackedFiles(root: string) {
  const { stdout } = await execFileAsync("/usr/bin/git", ["-C", root, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 8000 });
  return stdout.split("\0").filter(Boolean).filter((file) =>
    !file.startsWith(".next/") &&
    !file.startsWith("node_modules/") &&
    !file.startsWith(".git/") &&
    !/\.sha256$/i.test(file) &&
    !/\.bak(?:[-_]|$)/i.test(file) &&
    !/\.(map|min\.js)$/i.test(file)
  );
}

async function contentMatches(root: string, searchTokens: string[]) {
  if (!searchTokens.length) return new Set<string>();
  const pattern = searchTokens.slice(0, 8).map(escapeRegex).join("|");
  try {
    const { stdout } = await execFileAsync("/usr/bin/git", ["-C", root, "grep", "-I", "-l", "-i", "-E", pattern, "--"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 10000 });
    return new Set(stdout.split(/\r?\n/).filter(Boolean).filter((file) => !/\.sha256$/i.test(file) && !/\.bak(?:[-_]|$)/i.test(file)).map((file) => file.replaceAll("\\", "/")));
  } catch (error) {
    const candidate = error as { code?: number; stdout?: string };
    if (candidate.code === 1) return new Set<string>();
    return new Set((candidate.stdout || "").split(/\r?\n/).filter(Boolean).filter((file) => !/\.sha256$/i.test(file) && !/\.bak(?:[-_]|$)/i.test(file)).map((file) => file.replaceAll("\\", "/")));
  }
}

function importSpecifiers(content: string) {
  const out = new Set<string>();
  const patterns = [
    /(?:import|export)\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) if (match[1]) out.add(match[1]);
  }
  return [...out];
}

function resolveRelativeImport(fromFile: string, specifier: string, tracked: Set<string>) {
  if (!specifier.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.json`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`, `${base}/index.jsx`];
  return candidates.find((candidate) => tracked.has(candidate)) || null;
}

async function expandDirectImports(root: string, scored: Map<string, { score: number; evidence: string[] }>, tracked: Set<string>) {
  const parents = [...scored.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 16);
  for (const [parent, info] of parents) {
    if (!/\.(ts|tsx|js|jsx)$/i.test(parent) || isSensitivePath(parent)) continue;
    try {
      const buffer = await readFile(path.join(root, parent));
      if (buffer.length > MAX_CONTENT_BYTES || buffer.includes(0)) continue;
      for (const specifier of importSpecifiers(buffer.toString("utf8"))) {
        const resolved = resolveRelativeImport(parent, specifier, tracked);
        if (!resolved || isSensitivePath(resolved)) continue;
        const score = Math.max(3, info.score - 3);
        const current = scored.get(resolved);
        if (!current || current.score < score) scored.set(resolved, { score, evidence: [`Közvetlen importfüggőség: ${parent}`] });
        else if (!current.evidence.some((item) => item.includes(parent))) current.evidence.push(`Közvetlen importfüggőség: ${parent}`);
      }
    } catch {}
  }
}

async function evidenceFor(root: string, filePath: string, searchTokens: string[]) {
  if (isSensitivePath(filePath)) return ["Érzékeny path: tartalom nem olvasható scope discovery során."];
  try {
    const absolute = path.join(root, filePath);
    const buffer = await readFile(absolute);
    if (buffer.length > MAX_CONTENT_BYTES || buffer.includes(0)) return ["Path-egyezés; tartalomscan kihagyva méret/bináris miatt."];
    const content = buffer.toString("utf8");
    const secretHits = scanSensitiveText(content);
    if (secretHits.length) return [`Érzékeny tartalomminta: ${secretHits.join(", ")}; contextbe nem adható.`];
    const lower = normalize(content);
    const hits = searchTokens.filter((token) => lower.includes(token)).slice(0, 5);
    return hits.length ? [`Tartalmi kulcsszó-egyezés: ${hits.join(", ")}`] : ["Path/modul egyezés."];
  } catch {
    return ["Path-egyezés; tartalom nem olvasható."];
  }
}

export async function analyzeTechnicalScope(input: { title: string; goal: string; moduleHint?: string | null }) {
  const root = projectRoot();
  const searchTokens = tokens(`${input.title} ${input.goal} ${input.moduleHint || ""}`);
  const hints = moduleHints(`${input.title} ${input.goal} ${input.moduleHint || ""}`);
  const tracked = await trackedFiles(root);
  const trackedSet = new Set(tracked);
  const content = await contentMatches(root, [...searchTokens, ...hints]);
  const scored = new Map<string, { score: number; evidence: string[] }>();

  for (const file of tracked) {
    const normalizedPath = normalize(file);
    let score = 0;
    const evidence: string[] = [];
    for (const hint of hints) if (normalizedPath.includes(normalize(hint))) { score += 10; evidence.push(`Modulútvonal: ${hint}`); }
    for (const token of searchTokens) if (normalizedPath.includes(token)) { score += 4; evidence.push(`Path kulcsszó: ${token}`); }
    if (content.has(file)) { score += 6; evidence.push("Tartalmi egyezés"); }
    if (/(__tests__|\.test\.|\.spec\.|acceptance)/i.test(file) && score > 0) score += 2;
    if (/DIMPROVER_PRODUCT_DOCS\//.test(file) && score > 0) score += 1;
    if (score > 0) scored.set(file, { score, evidence });
  }
  for (const file of content) {
    if (!trackedSet.has(file) || scored.has(file)) continue;
    scored.set(file, { score: 5, evidence: ["Tartalmi egyezés"] });
  }
  await expandDirectImports(root, scored, trackedSet);

  const ranked = [...scored.entries()].sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0])).slice(0, MAX_CANDIDATES);
  const candidates: ScopeCandidate[] = [];
  for (const [filePath, info] of ranked) {
    const policy = classifyScopePath(filePath);
    const confidence = scopeConfidence(filePath, hints, info.evidence);
    const lowConfidenceGreen = policy.riskLevel === "GREEN" && !confidence.highConfidence;
    const detailEvidence = await evidenceFor(root, filePath, [...searchTokens, ...hints]);
    candidates.push({
      path: filePath,
      score: info.score,
      riskLevel: lowConfidenceGreen ? "YELLOW" : policy.riskLevel,
      decision: lowConfidenceGreen ? "NEEDS_REVIEW" : policy.decision,
      reasons: lowConfidenceGreen ? ["Alacsony scope-bizonyosság: nincs erős modulútvonal vagy közvetlen importkapcsolat; automatikus write helyett BENJADMIN review szükséges."] : policy.reasons,
      evidence: [...info.evidence.slice(0, 3), ...(confidence.hits.length ? [`Scope hint egyezés: ${confidence.hits.join(", ")}`] : []), ...detailEvidence].slice(0, 5),
    });
  }

  const approved = candidates.filter((item) => item.decision === "AUTO_APPROVED").map((item) => ({ type: "path" as const, key: item.path }));
  const review = candidates.filter((item) => item.decision === "NEEDS_REVIEW");
  const denied = candidates.filter((item) => item.decision === "DENIED");
  return {
    analyzerVersion: ANALYZER_VERSION,
    generatedAt: new Date().toISOString(),
    searchTokens,
    moduleHints: hints,
    overallRisk: highestRisk(candidates),
    candidates,
    approvedScope: approved,
    reviewRequired: review.length > 0,
    reviewCount: review.length,
    deniedCount: denied.length,
    safeToPreflight: approved.length > 0 && denied.length === 0 && review.length === 0,
  };
}
