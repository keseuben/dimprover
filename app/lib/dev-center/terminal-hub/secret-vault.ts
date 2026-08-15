import { getTerminalHubFeatureFlags } from "./config";

export type SecretVaultReadiness = {
  phase: "P9_SECRET_VAULT_SKELETON";
  enabled: boolean;
  storageConfigured: false;
  rawSecretReadableByAi: false;
  browserSecretStorageAllowed: false;
  referenceOnlyAiPolicy: true;
  putApiAvailable: false;
  getApiAvailable: false;
  state: "DISABLED" | "SKELETON_ONLY";
  blockers: string[];
  generatedAt: string;
};
export function getSecretVaultReadiness(): SecretVaultReadiness {
  const enabled=getTerminalHubFeatureFlags().secretVaultEnabled;
  return { phase:"P9_SECRET_VAULT_SKELETON", enabled, storageConfigured:false, rawSecretReadableByAi:false, browserSecretStorageAllowed:false, referenceOnlyAiPolicy:true, putApiAvailable:false, getApiAvailable:false, state:enabled?"SKELETON_ONLY":"DISABLED", blockers:[...(enabled?["Secret Vault storage adapter még nincs aktiválva."]: ["Secret Vault feature flag OFF."]),"Raw secret AI-nak soha nem olvasható."], generatedAt:new Date().toISOString() };
}
