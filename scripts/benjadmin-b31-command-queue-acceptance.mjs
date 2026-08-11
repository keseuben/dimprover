import fs from "node:fs";

const base = process.env.BENJADMIN_BASE_URL || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const authHeaders = {
  host,
  "x-dimpro-license-admin-key": key,
  "content-type": "application/json",
};
const checks = [];

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

async function post(body, authenticated = true) {
  const headers = authenticated
    ? authHeaders
    : { host, "content-type": "application/json" };
  const response = await fetch(`${base}/api/dev/engine/control-plane/commands`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

let result = await post({
  targetEnvironment: "CONTROL",
  operation: "read",
  commandName: "refresh_state",
  requestedBy: "b31-acceptance",
}, false);
check("unauthenticated command queue blocked", result.status === 401, `status=${result.status}`);

result = await post({
  targetEnvironment: "PRODUCTION",
  operation: "deploy",
  commandName: "deploy_release",
  requestedBy: "b31-acceptance",
});
check(
  "PROD mutating command requires approval",
  result.status === 409 && result.payload?.code === "CONTROL_PROD_APPROVAL_REQUIRED",
  `status=${result.status} code=${result.payload?.code}`,
);

result = await post({
  targetEnvironment: "DEV",
  operation: "build",
  commandName: "run_build",
  requestedBy: "b31-acceptance",
});
check(
  "DEV mutating command requires READY session",
  result.status === 409 && result.payload?.code === "CONTROL_DEV_SESSION_REQUIRED",
  `status=${result.status} code=${result.payload?.code}`,
);

result = await post({
  targetEnvironment: "CONTROL",
  operation: "read",
  commandName: "refresh_state",
  requestedBy: "b31-acceptance",
  payload: { shell: "echo forbidden" },
});
check(
  "raw shell payload blocked",
  result.status === 400 && result.payload?.code === "CONTROL_RAW_COMMAND_FORBIDDEN",
  `status=${result.status} code=${result.payload?.code}`,
);

result = await post({
  targetEnvironment: "CONTROL",
  operation: "read",
  commandName: "run_build",
  requestedBy: "b31-acceptance",
});
check(
  "command-operation mismatch blocked",
  result.status === 400 && result.payload?.code === "CONTROL_COMMAND_OPERATION_MISMATCH",
  `status=${result.status} code=${result.payload?.code}`,
);

result = await post({
  targetEnvironment: "CONTROL",
  operation: "read",
  commandName: "refresh_state",
  requestedBy: "b31-acceptance",
  payload: { source: "acceptance-safe-no-executor" },
});
check(
  "safe queue request fails closed until staged schema exists",
  result.status === 409 && result.payload?.code === "CONTROL_SCHEMA_NOT_READY",
  `status=${result.status} code=${result.payload?.code}`,
);

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0, checks }, null, 2));
