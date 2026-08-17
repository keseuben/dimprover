import fs from "node:fs";

try { process.loadEnvFile?.(".env.local"); } catch {}

const action = String(process.argv[2] || "").trim().toLowerCase();
const subject = String(process.argv[3] || "").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const adminKeyPath = process.env.BENJADMIN_ADMIN_KEY_FILE || ".dimprover/license/admin-key.txt";
const adminKey = fs.readFileSync(adminKeyPath, "utf8").trim();
const headers = { host, "x-dimpro-license-admin-key": adminKey, "content-type": "application/json" };

async function request(path, method, body) {
  const response = await fetch(`${apiBase}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.error || `BENJADMIN Plus bridge HTTP ${response.status}`);
    error.code = payload?.code || `HTTP_${response.status}`;
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function readStdinJson() {
  if (process.stdin.isTTY) return {};
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return raw.trim() ? JSON.parse(raw) : {};
}

function print(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

try {
  if (["pull", "next", "claim", "continue", "folytasd", "folytatas", "kovetkezo"].includes(action)) {
    const workerCode = subject.toUpperCase();
    if (!workerCode) throw new Error("Worker code szükséges: ARMINAI / JAZMINAI / OUTMINAI.");
    const payload = await request(`/api/dev/console/plus-bridge/${encodeURIComponent(workerCode)}/next`, "POST");
    print(payload);
  } else if (action === "report") {
    if (!subject) throw new Error("Task ID szükséges a report művelethez.");
    const body = await readStdinJson();
    const payload = await request(`/api/dev/console/tasks/${encodeURIComponent(subject)}`, "PATCH", { action: "RESULT_REPORT", ...body });
    print(payload);
  } else if (["report-testing", "result-testing"].includes(action)) {
    if (!subject) throw new Error("Task ID szükséges a report-testing művelethez.");
    const body = await readStdinJson();
    print(await request(`/api/dev/console/tasks/${encodeURIComponent(subject)}`, "PATCH", { action: "RESULT_TO_TESTING", ...body }));
  } else if (action === "testing") {
    if (!subject) throw new Error("Task ID szükséges a testing művelethez.");
    print(await request(`/api/dev/console/tasks/${encodeURIComponent(subject)}`, "PATCH", { action: "TESTING" }));
  } else if (action === "complete") {
    if (!subject) throw new Error("Task ID szükséges a complete művelethez.");
    const body = await readStdinJson();
    print(await request(`/api/dev/console/tasks/${encodeURIComponent(subject)}`, "PATCH", { action: "COMPLETE", note: body.note || "Plus-only ChatGPT bridge task lezárva." }));
  } else if (action === "fail") {
    if (!subject) throw new Error("Task ID szükséges a fail művelethez.");
    const body = await readStdinJson();
    print(await request(`/api/dev/console/tasks/${encodeURIComponent(subject)}`, "PATCH", { action: "FAIL", note: body.note || "Plus-only ChatGPT bridge blokkolva." }));
  } else if (action === "accept-suggestion") {
    if (!subject) throw new Error("Task ID szükséges a javaslat elfogadásához.");
    print(await request(`/api/dev/console/tasks/${encodeURIComponent(subject)}`, "PATCH", { action: "ACCEPT_SUGGESTION" }));
  } else {
    throw new Error("Használat: benjadmin-plus-bridge-cli.mjs pull|continue|folytasd <WORKER> | report/report-testing/testing/complete/fail/accept-suggestion <TASK_ID>");
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), code: error?.code || null, status: error?.status || null }, null, 2)}\n`);
  process.exitCode = 1;
}
