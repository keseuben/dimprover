export type ExternalAiWorkerProfile = {
  code: "MFORGE" | "VGUARD";
  displayName: string;
  personName: string;
  role: string;
  layer: "EXTERNAL";
  avatar: string;
  capabilities: string[];
};

export const EXTERNAL_AI_WORKERS: ExternalAiWorkerProfile[] = [
  {
    code: "MFORGE",
    displayName: "M.Forge-AI",
    personName: "Márk",
    role: "Coding Worker",
    layer: "EXTERNAL",
    avatar: "/benjadmin/team/06_M_ForgeAI.webp",
    capabilities: ["frontend", "backend", "api", "implementation", "refactor", "targeted_fix"],
  },
  {
    code: "VGUARD",
    displayName: "V.Guard-AI",
    personName: "Viktória",
    role: "Review & Quality Worker",
    layer: "EXTERNAL",
    avatar: "/benjadmin/team/07_V_GuardAI.webp",
    capabilities: ["review", "security", "regression", "test", "scope_review", "quality_gate"],
  },
];
