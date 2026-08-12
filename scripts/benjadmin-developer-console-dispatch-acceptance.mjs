import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile?.(".env.local"); } catch {}

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
if (!supabaseUrl || !serviceKey) throw new Error("DEV Supabase service-role environment missing");
const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const marker = `CONSOLE-DISPATCH-${Date.now()}`;
let taskId = "";
let passed = 0;
function check(name, ok, details = "") { if (!ok) throw new Error(`${name}: ${details}`); passed += 1; console.log(`PASS ${name}${details ? ` :: ${details}` : ""}`); }

async function cleanup() {
  if (!taskId) return;
  const operations = [
    db.from("dev_center_live_worklog").delete().eq("task_id", taskId),
    db.from("dev_center_audit_events").delete().eq("task_id", taskId),
  ];
  for (const op of operations) { const result = await op; if (result.error) console.error(`CLEANUP WARN: ${result.error.message}`); }
  const taskDelete = await db.from("dev_center_tasks").delete().eq("id", taskId);
  if (taskDelete.error) console.error(`CLEANUP WARN task: ${taskDelete.error.message}`);
}

try {
  const response = await fetch(`${apiBase}/api/dev/console/messages`, {
    method: "POST",
    headers: { host, "x-dimpro-license-admin-key": adminKey, "content-type": "application/json" },
    body: JSON.stringify({ text: `${marker} Ármin-AI teszt task`, target: "ARMINAI", projectId: "project_dimprover", createTask: true, kind: "INSTRUCTION" }),
  });
  const payload = await response.json().catch(() => ({}));
  taskId = payload?.task?.id || "";
  check("Konzol utasítás POST 201", response.status === 201 && payload?.ok === true, `status=${response.status}`);
  check("Valós fejlesztési task létrejött", Boolean(taskId), taskId);
  check("Task Ármin-AI részére előirányozva", payload?.dispatch?.selectedWorkerId === "worker_arminai" && payload?.dispatch?.selectedWorkerCode === "ARMINAI", JSON.stringify(payload?.dispatch || {}));
  check("Natív executor hiányát őszintén jelenti", payload?.dispatch?.stage === "EXECUTOR_NOT_CONFIGURED" && payload?.dispatch?.executorConfigured === false, JSON.stringify(payload?.dispatch || {}));
  check("Ben-AI koordinátor válasz azonnal létrejött", payload?.coordinatorMessage?.author === "BENAI" && payload?.coordinatorMessage?.kind === "TASK_ASSIGNMENT", JSON.stringify(payload?.coordinatorMessage || {}));
  check("ChatGPT/MCP átadó prompt DEV-only és taskhoz kötött", typeof payload?.dispatch?.handoffPrompt === "string" && payload.dispatch.handoffPrompt.includes(taskId) && /DEV-only/.test(payload.dispatch.handoffPrompt) && /PROD módosítás nincs/.test(payload.dispatch.handoffPrompt), payload?.dispatch?.handoffPrompt || "");
  const taskRead = await db.from("dev_center_tasks").select("id,project_id,requested_worker_id,status,metadata").eq("id", taskId).single();
  check("DB task forrása BENJADMIN_DEVELOPER_CONSOLE", !taskRead.error && taskRead.data?.project_id === "project_dimprover" && taskRead.data?.requested_worker_id === "worker_arminai" && taskRead.data?.status === "queued" && taskRead.data?.metadata?.origin === "BENJADMIN_DEVELOPER_CONSOLE", JSON.stringify(taskRead.data || {}));
  const worklogRead = await db.from("dev_center_live_worklog").select("source,worker_code,summary,metadata").eq("task_id", taskId);
  check("BENJADMIN és Ben-AI ugyanahhoz a taskhoz auditálhatóan kapcsolódik", !worklogRead.error && (worklogRead.data || []).some((row) => row.source === "benjadmin") && (worklogRead.data || []).some((row) => row.source === "benai" && row.worker_code === "BENAI"), JSON.stringify(worklogRead.data || []));
  console.log(JSON.stringify({ ok: true, passed, failed: 0 }, null, 2));
} finally {
  await cleanup();
}
