#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const runtimeRoot = path.resolve(process.env.BENJADMIN_RUNTIME_ROOT || process.cwd());
try { process.loadEnvFile?.(path.join(runtimeRoot, ".env.local")); } catch {}
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const key = fs.readFileSync(path.join(runtimeRoot, ".dimprover/license/admin-key.txt"), "utf8").trim();
const headers = { host, "x-dimpro-license-admin-key": key, "content-type": "application/json" };
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const id = `map-v2-${Date.now().toString(36)}`;
let passed = 0;

function check(name, ok, detail = "") {
  if (!ok) throw new Error(`${name}${detail ? ` :: ${detail}` : ""}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function api(body, authorized = true) {
  const response = await fetch(`${apiBase}/api/dev/console/development-map/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authorized ? headers : { host, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function cleanup() {
  await db.from("dev_center_audit_events").delete().eq("task_id", id);
  await db.from("dev_center_tasks").delete().eq("id", id);
}

try {
  let result = await api({ nodeId: "benjadmin-console-chat" }, false);
  check("Map mutation denies unauthenticated request", result.response.status === 401, `status=${result.response.status}`);

  const inserted = await db.from("dev_center_tasks").insert({
    id,
    project_id: "project_dimprover",
    repository_id: "repo_dimprover",
    title: "MAP V2 runtime acceptance",
    description: "DEV-only API acceptance",
    status: "testing",
    priority: 50,
    branch_name: "feature/map-v2-runtime",
    worktree_path: "/srv/dimpro-dev/worktrees/map-v2-runtime",
    scope: [],
    acceptance: [],
    created_by: "ARMINAI",
    metadata: { productionAccess: "DENY", origin: "MAP_V2_RUNTIME_ACCEPTANCE" },
  }).select("*").single();
  check("Isolated Map V2 fixture created", !inserted.error, inserted.error?.message || id);
  const physical = [inserted.data?.project_id, inserted.data?.branch_name, inserted.data?.worktree_path].join("|");

  result = await api({ nodeId: "benjadmin-console-chat", workItem: "first" });
  check("First map move succeeds through live API", result.response.status === 200 && result.payload?.ok === true && result.payload?.placement?.nodeId === "benjadmin-console-chat", JSON.stringify(result.payload));
  check("Move response keeps physical Git move disabled", result.payload?.physicalGitMove === false, JSON.stringify(result.payload));

  result = await api({ nodeId: "drive-web", workItem: "second" });
  check("Second map move succeeds through live API", result.response.status === 200 && result.payload?.placement?.nodeId === "drive-web", JSON.stringify(result.payload));

  let row = await db.from("dev_center_tasks").select("project_id,branch_name,worktree_path,metadata").eq("id", id).single();
  check("Previous placement is retained in bounded history", row.data?.metadata?.developmentMapHistory?.at(-1)?.nodeId === "benjadmin-console-chat", JSON.stringify(row.data?.metadata?.developmentMapHistory || []));
  check("Project branch and worktree remain physically unchanged", [row.data?.project_id, row.data?.branch_name, row.data?.worktree_path].join("|") === physical, JSON.stringify(row.data));

  result = await api({ action: "undo" });
  check("Undo succeeds through live API", result.response.status === 200 && result.payload?.undone === true && result.payload?.placement?.nodeId === "benjadmin-console-chat", JSON.stringify(result.payload));
  check("Undo response keeps physical Git move disabled", result.payload?.physicalGitMove === false, JSON.stringify(result.payload));

  row = await db.from("dev_center_tasks").select("metadata").eq("id", id).single();
  check("Undo pops exactly one history entry", (row.data?.metadata?.developmentMapHistory || []).length === 1, JSON.stringify(row.data?.metadata?.developmentMapHistory || []));

  const audit = await db.from("dev_center_audit_events").select("metadata").eq("task_id", id).eq("action", "TASK_DEVELOPMENT_MAP_UNDONE").order("created_at", { ascending: false }).limit(1).maybeSingle();
  check("Undo audit remains PROD denied", !audit.error && audit.data?.metadata?.productionAccess === "DENY" && audit.data?.metadata?.physicalGitMove === false, audit.error?.message || JSON.stringify(audit.data?.metadata || {}));

  const badMetadata = {
    ...(row.data?.metadata || {}),
    developmentMapHistory: [...(row.data?.metadata?.developmentMapHistory || []), { nodeId: "removed-node-v2", workItem: "invalid" }],
  };
  const badWrite = await db.from("dev_center_tasks").update({ metadata: badMetadata }).eq("id", id);
  if (badWrite.error) throw badWrite.error;
  result = await api({ action: "undo" });
  check("Invalid historical node fails closed", result.response.status === 409 && result.payload?.code === "DEV_CENTER_DEVELOPMENT_MAP_UNDO_TARGET_INVALID", JSON.stringify(result.payload));

  const emptyWrite = await db.from("dev_center_tasks").update({ metadata: { ...badMetadata, developmentMapHistory: [] } }).eq("id", id);
  if (emptyWrite.error) throw emptyWrite.error;
  result = await api({ action: "undo" });
  check("Empty map history fails closed", result.response.status === 409 && result.payload?.code === "DEV_CENTER_DEVELOPMENT_MAP_UNDO_EMPTY", JSON.stringify(result.payload));

  console.log(JSON.stringify({ ok: true, passed, failed: 0, taskId: id, apiBase, productionAccess: "DENY" }, null, 2));
} finally {
  await cleanup();
}
