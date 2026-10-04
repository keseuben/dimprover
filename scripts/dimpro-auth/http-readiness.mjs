#!/usr/bin/env node

const mode = process.argv.includes("--post-db") ? "POST_DB" : "PRE_DB";
const checks = [];
let failed = 0;

async function probe(name, url, validate) {
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: "manual", cache: "no-store", headers: { "user-agent": "DIMPRO-AUTH-DEV-READINESS/1.0" } });
    const contentType = response.headers.get("content-type") || "";
    let body = null;
    if (contentType.includes("application/json")) body = await response.json().catch(() => null);
    else body = (await response.text().catch(() => "")).slice(0, 300);
    const result = validate(response, body);
    const ok = result === true;
    if (!ok) failed += 1;
    checks.push({ name, url, ok, status: response.status, location: response.headers.get("location"), detail: ok ? "PASS" : String(result || "VALIDATION_FAILED"), durationMs: Date.now() - started });
  } catch (error) {
    failed += 1;
    checks.push({ name, url, ok: false, status: null, location: null, detail: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started });
  }
}

await probe("AUTH login UI", "https://auth.dev.dimpro.hu/login", (r) => r.status === 200 || `expected 200, got ${r.status}`);
await probe("Friendly login redirect", "https://login.dev.dimpro.hu/", (r) => {
  const location = r.headers.get("location") || "";
  return (r.status === 307 || r.status === 308) && location.startsWith("https://auth.dev.dimpro.hu/login")
    ? true
    : `expected 307/308 to auth.dev.dimpro.hu/login, got ${r.status} ${location || "(no location)"}`;
});
await probe("AUTH liveness", "https://auth.dev.dimpro.hu/health/live", (r, body) =>
  r.status === 200 && body?.ok === true && body?.service === "dimpro-auth" && body?.live === true
    ? true
    : `expected 200 dimpro-auth live JSON, got ${r.status}`,
);
await probe("AUTH readiness", "https://auth.dev.dimpro.hu/health/ready", (r, body) => {
  if (mode === "POST_DB") return r.status === 200 && body?.ok === true && body?.ready === true && Number(body?.migrationCount) >= 7
    ? true : `expected POST_DB ready=200/migrationCount>=7, got ${r.status}`;
  return r.status === 503 && body?.service === "dimpro-auth" && body?.ready === false
    ? true : `expected PRE_DB 503 JSON ready=false, got ${r.status}`;
});
await probe("Drive AUTH session route", "https://drive.dev.dimpro.hu/api/dimpro-auth/session", (r, body) =>
  r.status === 200 && body?.ok === true && body?.authenticated === false
    ? true
    : `expected 200 unauthenticated session JSON, got ${r.status}`,
);
await probe("Drive unauthenticated workspace", "https://drive.dev.dimpro.hu/drive", (r) => {
  const location = r.headers.get("location") || "";
  return (r.status === 307 || r.status === 308) && location.includes("/api/dimpro-auth/start")
    ? true
    : `expected redirect to /api/dimpro-auth/start, got ${r.status} ${location || "(no location)"}`;
});

console.log(JSON.stringify({ ok: failed === 0, mode, productionAccess: "DENY", failed, checks }, null, 2));
process.exitCode = failed === 0 ? 0 : 2;
