import type { WorkerRegistryEntry } from "./types";

export const DEVELOPER_GRID_WORKERS: readonly WorkerRegistryEntry[] = [
  { code: "ARMINAI", label: "01 ÁrminAI", position: "TOP_LEFT", fixed: true, role: "Belső AI kódmérnök", state: "READY", authoritativeContext: false },
  { code: "OUTMINAI", label: "02 OutminAI", position: "TOP_RIGHT", fixed: true, role: "Külső / partner AI kódmérnök", state: "READY", authoritativeContext: false },
  { code: "BENJAMINAI", label: "03 BenjáminAI", position: "BOTTOM_LEFT", fixed: true, role: "Integrált AI kódmérnök", state: "READY", authoritativeContext: false },
  { code: "JAZMINAI", label: "04 JázminAI", position: "BOTTOM_RIGHT", fixed: true, role: "Belső AI kódmérnök", state: "READY", authoritativeContext: false },
  { code: "DEVMINAI", label: "05 DevminAI", position: "AUXILIARY", fixed: false, role: "Fejlesztési tervező és asszisztens", state: "IDLE", authoritativeContext: false },
] as const;

export function listDeveloperGridWorkers() {
  return DEVELOPER_GRID_WORKERS.map((worker) => ({ ...worker }));
}
