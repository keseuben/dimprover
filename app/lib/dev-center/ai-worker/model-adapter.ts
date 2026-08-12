export interface WorkerModelAdapter {
  provider: "mock" | "openai" | "anthropic" | "other";
  modelId: string;
  probe(): Promise<{ ready: boolean; detail: string }>;
}

export const mockWorkerAdapter: WorkerModelAdapter = {
  provider: "mock",
  modelId: "BENJADMIN_V1_MOCK",
  async probe() {
    return { ready: true, detail: "V1.0 mock adapter: külső provider nem indul, PROD-hozzáférés nincs." };
  },
};
