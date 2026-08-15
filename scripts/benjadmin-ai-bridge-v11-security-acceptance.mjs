import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile?.(".env.local"); } catch {}
const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const secret = `bridge-secret-${Date.now()}-XYZ`;
const marker = `AI-BRIDGE-V11-SECRET-${Date.now()}`;
const headers = { host, "x-dimpro-license-admin-key": adminKey, "content-type": "application/json" };
let taskId = "";
let passed = 0;
function check(name, ok, detail = "") { if (!ok) throw new Error(`${name}: ${detail}`); passed += 1; console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`); }
async function cleanup() {
  if (!taskId) return;
  for (const query of [
    db.from("dev_center_live_worklog").delete().eq("task_id", taskId),
    db.from("dev_center_audit_events").delete().eq("task_id", taskId),
    db.from("dev_center_task_dependencies").delete().eq("task_id", taskId),
    db.from("dev_center_conflicts").delete().eq("task_id", taskId),
  ]) await query;
  await db.from("dev_center_tasks").delete().eq("id", taskId);
}
try {
  const text = `${marker} biztonsági acceptance password=\"${secret}\" további fejlesztési utasítás`;
  const response = await fetch(`${apiBase}/api/dev/console/messages`, { method: "POST", headers, body: JSON.stringify({ text, target: "ARMINAI", projectId: "project_dimprover", createTask: true, kind: "INSTRUCTION" }) });
  const payload = await response.json().catch(() => ({}));
  taskId = payload?.task?.id || "";
  check("Sensitive task creation 201", response.status === 201 && payload?.ok === true && Boolean(taskId), `status=${response.status}`);
  const taskMeta = payload?.task?.metadata || {};
  const taskPrompt = String(taskMeta.handoffPrompt || "");
  const coordinatorPrompt = String(payload?.coordinatorMessage?.metadata?.handoffPrompt || "");
  check("Task handoff is marked sanitized", taskMeta.handoffSanitized === true, JSON.stringify({ sanitized: taskMeta.handoffSanitized }));
  check("Task handoff records scanner finding", Array.isArray(taskMeta.handoffSensitiveFindings) && taskMeta.handoffSensitiveFindings.length > 0, JSON.stringify(taskMeta.handoffSensitiveFindings || []));
  check("Task handoff masks raw secret", !taskPrompt.includes(secret) && taskPrompt.includes("ÉRZÉKENY ADAT MASZKOLVA"), taskPrompt.slice(0, 260));
  check("Coordinator handoff masks raw secret", !coordinatorPrompt.includes(secret) && coordinatorPrompt.includes("ÉRZÉKENY ADAT MASZKOLVA"), coordinatorPrompt.slice(0, 260));
  check("Task handoff remains DEV-only", taskPrompt.includes("DEV-only végrehajtás") && taskPrompt.includes("PROD módosítás nincs"));
  check("Sanitized prompt has SHA", /^[0-9a-f]{64}$/.test(String(taskMeta.handoffPromptSha256 || "")), String(taskMeta.handoffPromptSha256 || ""));
  const dbTask = await db.from("dev_center_tasks").select("metadata").eq("id", taskId).single();
  check("Sanitized handoff persisted in DB", !dbTask.error && dbTask.data?.metadata?.handoffSanitized === true && !String(dbTask.data?.metadata?.handoffPrompt || "").includes(secret));
  console.log(JSON.stringify({ ok: true, passed, failed: 0 }, null, 2));
} finally { await cleanup(); }
