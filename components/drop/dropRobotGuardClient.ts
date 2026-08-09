export type DropClientUploadIntent = {
  token: string;
  issuedAt: string;
  notBeforeAt: string;
  expiresAt: string;
};

type IntentResponse = {
  ok?: boolean;
  intents?: DropClientUploadIntent[];
  guard?: { minimumHumanMs?: number };
  error?: string;
};

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export async function requestDropUploadIntentBatch(input: {
  endpoint: string;
  count: number;
  authorization?: string;
}) {
  const response = await fetch(input.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.authorization ? { Authorization: input.authorization } : {}),
    },
    body: JSON.stringify({ count: Math.max(1, Math.min(20, Math.trunc(input.count || 1))) }),
  });
  const payload = await response.json() as IntentResponse;
  if (!response.ok || !payload.intents?.length) {
    throw new Error(payload.error || "A robotvédelmi feltöltési engedély nem hozható létre.");
  }
  const minimumHumanMs = Math.max(500, Number(payload.guard?.minimumHumanMs || 1_500));
  await delay(minimumHumanMs + 75);
  return payload.intents;
}

export function recommendedDropIntentBatchCount(sizes: number[]) {
  if (!sizes.length) return 1;
  const largest = Math.max(...sizes.filter(Number.isFinite), 0);
  if (largest > 100 * 1024 * 1024) return 1;
  if (largest > 20 * 1024 * 1024) return Math.min(5, sizes.length);
  return Math.min(20, sizes.length);
}
