export type ScopeRiskLevel = "GREEN" | "YELLOW" | "RED";
export type ScopeDecision = "AUTO_APPROVED" | "NEEDS_REVIEW" | "DENIED";
export type ScopeCandidate = {
  path: string;
  score: number;
  riskLevel: ScopeRiskLevel;
  decision: ScopeDecision;
  reasons: string[];
  evidence: string[];
};

const redPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^|\/)\.env(?:\.|$)/i, reason: "Környezeti változó / secret fájl." },
  { pattern: /(secret|credential|private[-_]?key|token[-_]?store)/i, reason: "Secret vagy credential terület." },
  { pattern: /(^|\/)(middleware|proxy)\.(ts|js)$/i, reason: "Globális beléptetési / proxy core." },
  { pattern: /(admin-auth|worker-auth|auth-core|session-auth)/i, reason: "Hitelesítési core." },
  { pattern: /(^|\/)(infra|infrastructure|nginx|pm2|deploy|production)(\/|\.|$)/i, reason: "Infra / PROD-közeli terület." },
  { pattern: /(^|\/)next\.config\.(ts|js|mjs)$/i, reason: "Globális build/runtime konfiguráció." },
  { pattern: /(^|\/)scripts\/.*(deploy|prod|restart|migration)/i, reason: "Érzékeny üzemeltetési parancs." },
];

const yellowPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^|\/)app\/lib\//i, reason: "Közös application service / core réteg." },
  { pattern: /(^|\/)components\/(ui|shared)\//i, reason: "Közösen használt UI réteg." },
  { pattern: /(^|\/)supabase\//i, reason: "Adatbázis / Supabase réteg; automatikus írás helyett BENJADMIN-vizsgálat szükséges." },
  { pattern: /(^|\/)(package|package-lock|tsconfig)\.json$/i, reason: "Projekt-szintű konfiguráció / dependency." },
  { pattern: /(types?|schemas?)\.(ts|tsx)$/i, reason: "Megosztott type/schema szerződés." },
  { pattern: /(^|\/)app\/api\/dev\//i, reason: "BENJADMIN Development Center API; koordinátori vizsgálat szükséges." },
];

export function classifyScopePath(filePath: string): { riskLevel: ScopeRiskLevel; decision: ScopeDecision; reasons: string[] } {
  const normalized = filePath.replaceAll("\\", "/").replace(/^\.\//, "");
  const red = redPatterns.filter((item) => item.pattern.test(normalized));
  if (red.length) return { riskLevel: "RED", decision: "DENIED", reasons: red.map((item) => item.reason) };
  const yellow = yellowPatterns.filter((item) => item.pattern.test(normalized));
  if (yellow.length) return { riskLevel: "YELLOW", decision: "NEEDS_REVIEW", reasons: yellow.map((item) => item.reason) };
  return { riskLevel: "GREEN", decision: "AUTO_APPROVED", reasons: ["Modulhoz közvetlenül kapcsolódó, nem érzékeny fájl."] };
}

export function highestRisk(candidates: ScopeCandidate[]): ScopeRiskLevel {
  if (candidates.some((item) => item.riskLevel === "RED")) return "RED";
  if (candidates.some((item) => item.riskLevel === "YELLOW")) return "YELLOW";
  return "GREEN";
}
