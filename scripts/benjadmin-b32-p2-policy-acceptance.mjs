import fs from "node:fs";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const reporterKey = process.env.DIMPRO_DEV_REPORTER_KEY?.trim() || "";
const checks = [];

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

async function call(path, { body, auth = "admin" } = {}) {
  const headers = { host };
  if (body) headers["content-type"] = "application/json";
  if (auth === "admin") headers["x-dimpro-license-admin-key"] = adminKey;
  if (auth === "reporter" && reporterKey) headers["x-dimpro-dev-reporter-key"] = reporterKey;
  if (auth === "bad-worker") {
    headers["x-dimpro-worker-id"] = "worker_outminai";
    headers["x-dimpro-worker-token"] = "invalid-b32-p2-worker-token";
  }
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

let result = await call("/api/dev/engine/health");
check("DEV engine remains READY", result.status === 200 && result.payload?.health?.ready === true, `status=${result.status}`);

result = await call("/api/dev/engine/tasks", {
  body: {
    projectId: "project_dimprover",
    repositoryId: "repo_dimprover",
    title: "B3.2 P2 negative acceptance - must not persist",
    requestedWorkerId: "worker_outminai",
    scope: [{ type: "path", key: "app" }],
  },
});
check(
  "OutminAI cannot receive INTERNAL DIMPRO task",
  result.status === 403 && result.payload?.code === "PARTNER_OUTMIN_INTERNAL_DENIED",
  `status=${result.status} code=${result.payload?.code}`,
);

result = await call("/api/dev/engine/orchestration", {
  body: { action: "claim_next_task", sessionId: "nonexistent-b32-p2", workerId: "worker_outminai" },
});
check(
  "OutminAI automatic next-task claim is disabled",
  result.status === 403 && result.payload?.code === "PARTNER_OUTMIN_EXPLICIT_TASK_REQUIRED",
  `status=${result.status} code=${result.payload?.code}`,
);

result = await call("/api/dev/engine/orchestration", {
  auth: "bad-worker",
  body: { action: "claim_task", sessionId: "nonexistent-b32-p2", taskId: "nonexistent-b32-p2" },
});
check("invalid OutminAI worker token fails closed", result.status === 401, `status=${result.status}`);

result = await call("/api/dev/engine/tasks", {
  auth: "none",
  body: { projectId: "project_dimprover", title: "unauthorized-negative-acceptance" },
});
check("unauthenticated task mutation is blocked", result.status === 401, `status=${result.status}`);

if (reporterKey) {
  result = await call("/api/dev/engine/tasks", {
    auth: "reporter",
    body: { projectId: "project_dimprover", title: "reporter-negative-acceptance" },
  });
  check("read-only reporter cannot create tasks", result.status === 401, `status=${result.status}`);

  result = await call("/api/dev/engine/sessions", {
    auth: "reporter",
    body: { openedBy: "reporter-negative-acceptance", environmentId: "env_dev" },
  });
  check("read-only reporter cannot open worker sessions", result.status === 401, `status=${result.status}`);

  result = await call("/api/dev/engine/control-plane/commands", {
    auth: "reporter",
    body: { target: "CONTROL", operation: "read", commandName: "refresh_state", requestedBy: "reporter-negative-acceptance" },
  });
  check("read-only reporter cannot queue control commands", result.status === 401, `status=${result.status}`);
} else {
  console.log("SKIP reporter mutation checks :: DIMPRO_DEV_REPORTER_KEY not available in process environment");
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0, reporterChecks: Boolean(reporterKey), checks }, null, 2));
