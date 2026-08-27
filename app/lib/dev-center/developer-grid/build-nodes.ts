import type { DeveloperGridBuildNode, DeveloperGridBuildNodeState } from "./types";

export const DEVELOPER_GRID_BUILD_NODES: DeveloperGridBuildNode[] = [
  { id: "canonical-dev", hostname: "dimpro-dev", state: "READY", executor: true, lastVerifiedAt: null, metadata: { canonical: true } },
  { id: "build01", hostname: "build01.dimpro.hu", state: "NOT_CONNECTED", executor: false, lastVerifiedAt: null, metadata: {} },
  { id: "build02", hostname: "build02.dimpro.hu", state: "NOT_CONNECTED", executor: false, lastVerifiedAt: null, metadata: {} },
];

export function resolveDeveloperGridBuildNodes(input?: Partial<Record<DeveloperGridBuildNode["id"], { state: DeveloperGridBuildNodeState; verifiedAt?: string | null }>>) {
  return DEVELOPER_GRID_BUILD_NODES.map((node) => {
    const override = input?.[node.id];
    if (!override) return { ...node, metadata: { ...node.metadata } };
    return {
      ...node,
      state: override.state,
      executor: override.state === "READY",
      lastVerifiedAt: override.verifiedAt || null,
      metadata: { ...node.metadata },
    };
  });
}

export function selectDeveloperGridBuildExecutor(nodes: DeveloperGridBuildNode[]) {
  const readyDedicated = nodes.find((node) => node.id !== "canonical-dev" && node.state === "READY" && node.executor);
  if (readyDedicated) return readyDedicated;
  const canonical = nodes.find((node) => node.id === "canonical-dev" && node.state === "READY" && node.executor);
  return canonical || null;
}
