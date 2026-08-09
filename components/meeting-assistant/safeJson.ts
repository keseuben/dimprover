export async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const redirectedToLogin = response.redirected && /\/login(?:\?|$)/i.test(response.url);
  if (redirectedToLogin || response.status === 401) {
    throw new Error("A DIMPRO-kapcsolat lejárt. Nyisd meg újra a panelt vagy végezd el ismét a párosítást.");
  }
  if (!contentType.toLowerCase().includes("application/json")) {
    if (response.status >= 500) throw new Error("A DIMPRO szerver átmenetileg nem érhető el. Próbáld újra rövidesen.");
    throw new Error(fallbackMessage);
  }
  const data = (await response.json().catch(() => null)) as T | null;
  if (!data) throw new Error(fallbackMessage);
  return data;
}
