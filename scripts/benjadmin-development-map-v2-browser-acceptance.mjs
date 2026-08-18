#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";

const runtimeRoot = path.resolve(process.env.BENJADMIN_RUNTIME_ROOT || process.cwd());
try { process.loadEnvFile?.(path.join(runtimeRoot, ".env.local")); } catch {}
const key = fs.readFileSync(path.join(runtimeRoot, ".dimprover/license/admin-key.txt"), "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const uiBase = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const headers = { host, "x-dimpro-license-admin-key": key, "content-type": "application/json" };
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const marker = `MAP-V2-UI-${stamp}`;
const activeId = `dev-task-map-v2-active-${stamp.toString(36)}`;
const technicalId = `dev-task-map-v2-tech-${stamp.toString(36)}`;
const archiveId = `dev-task-map-v2-archive-${stamp.toString(36)}`;
let browser;
let passed = 0;

function check(name, ok, detail = "") {
  if (!ok) throw new Error(`${name}${detail ? ` :: ${detail}` : ""}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${name}${detail ? ` :: ${detail}` : ""}`);
}
async function mapApi(taskId, body) {
  const response = await fetch(`${apiBase}/api/dev/console/development-map/${encodeURIComponent(taskId)}`, { method: "PATCH", headers, body: JSON.stringify(body) });
  return { response, payload: await response.json().catch(() => ({})) };
}
async function cleanup() {
  if (browser) await browser.close().catch(() => {});
  await db.from("dev_center_audit_events").delete().in("task_id", [activeId, technicalId, archiveId]);
  await db.from("dev_center_tasks").delete().in("id", [activeId, technicalId, archiveId]);
}

try {
  const inserted = await db.from("dev_center_tasks").insert([
    { id: activeId, project_id: "project_dimprover", repository_id: "repo_dimprover", title: `${marker} aktív BENJADMIN fejlesztés`, description: "Map V2 active layer fixture", status: "testing", priority: 97, requested_worker_id: "worker_arminai", assigned_worker_id: "worker_arminai", branch_name: "feature/map-v2-ui-active", worktree_path: "/srv/dimpro-dev/worktrees/map-v2-ui-active", scope: [], acceptance: [], created_by: "ARMINAI", metadata: { origin: "MAP_V2_BROWSER", productionAccess: "DENY" } },
    { id: technicalId, project_id: "project_dimprover", repository_id: "repo_dimprover", title: `${marker} M3 acceptance atomic claim race`, description: "Technical acceptance fixture", status: "queued", priority: 96, branch_name: null, worktree_path: null, scope: [], acceptance: [], created_by: "ARMINAI", metadata: { origin: "MAP_V2_BROWSER", productionAccess: "DENY" } },
    { id: archiveId, project_id: "project_dimprover", repository_id: "repo_dimprover", title: `${marker} lezárt fejlesztés`, description: "Archive fixture", status: "completed", priority: 95, branch_name: "feature/map-v2-ui-archive", worktree_path: "/srv/dimpro-dev/worktrees/map-v2-ui-archive", scope: [], acceptance: [], created_by: "ARMINAI", metadata: { origin: "MAP_V2_BROWSER", productionAccess: "DENY" } },
  ]).select("id");
  check("Map V2 browser fixtures created", !inserted.error && (inserted.data || []).length === 3, inserted.error?.message || "");

  let moved = await mapApi(activeId, { nodeId: "benjadmin-console-chat", workItem: "first placement" });
  check("Browser fixture first placement saved", moved.response.status === 200 && moved.payload?.placement?.nodeId === "benjadmin-console-chat", JSON.stringify(moved.payload));
  moved = await mapApi(activeId, { nodeId: "drive-web", workItem: "second placement" });
  check("Browser fixture second placement saved", moved.response.status === 200 && moved.payload?.placement?.nodeId === "drive-web", JSON.stringify(moved.payload));

  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((adminKey) => {
    localStorage.setItem("dimproLicenseAdminKey", adminKey);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("benjadmin-developer-console-theme", "light");
  }, key);
  await page.setViewport({ width: 1536, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${uiBase}/dev-map`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-development-map"]', { timeout: 30000 });
  await page.waitForFunction((id) => Boolean(document.querySelector(`[data-testid="benjadmin-development-map-source"] [data-development-map-task="${id}"]`)), { timeout: 30000 }, activeId);

  const baseState = await page.evaluate((activeTaskId) => ({
    taxonomy: (document.body.textContent || "").includes("TAXONÓMIA: V1 · EXCEL JÓVÁHAGYÁSRA VÁR"),
    layers: [...document.querySelectorAll("[data-map-layer]")].map((node) => ({ layer: node.getAttribute("data-map-layer"), text: node.textContent || "" })),
    activePresent: Boolean(document.querySelector(`[data-testid="benjadmin-development-map-source"] [data-development-map-task="${activeTaskId}"]`)),
    undoPresent: Boolean(document.querySelector(`[data-development-map-undo="${activeTaskId}"]`)),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }), activeId);
  check("Map V2 taxonomy guard is visible", baseState.taxonomy, JSON.stringify(baseState));
  check("Active Technical Archive layer controls render", ["active", "technical", "archive"].every((name) => baseState.layers.some((item) => item.layer === name)), JSON.stringify(baseState.layers));
  check("Active fixture is visible on Active layer", baseState.activePresent, JSON.stringify(baseState));
  check("Undo control is visible after two placements", baseState.undoPresent, JSON.stringify(baseState));
  check("Map V2 desktop overflow safe", baseState.overflow === false, JSON.stringify(baseState));

  await page.click('[data-map-layer="technical"]');
  await page.waitForFunction((id) => Boolean(document.querySelector(`[data-testid="benjadmin-development-map-source"] [data-development-map-task="${id}"]`)), { timeout: 10000 }, technicalId);
  const technicalState = await page.evaluate((techId, activeTaskId) => ({
    tech: Boolean(document.querySelector(`[data-testid="benjadmin-development-map-source"] [data-development-map-task="${techId}"]`)),
    active: Boolean(document.querySelector(`[data-testid="benjadmin-development-map-source"] [data-development-map-task="${activeTaskId}"]`)),
  }), technicalId, activeId);
  check("Technical layer isolates technical task", technicalState.tech && !technicalState.active, JSON.stringify(technicalState));

  await page.click('[data-map-layer="archive"]');
  await page.waitForFunction((id) => Boolean(document.querySelector(`[data-testid="benjadmin-development-map-source"] [data-development-map-task="${id}"]`)), { timeout: 10000 }, archiveId);
  const archiveState = await page.evaluate((id) => Boolean(document.querySelector(`[data-testid="benjadmin-development-map-source"] [data-development-map-task="${id}"]`)), archiveId);
  check("Archive layer exposes completed task", archiveState);

  await page.click('[data-map-layer="active"]');
  await page.waitForSelector(`[data-development-map-undo="${activeId}"]`, { timeout: 10000 });
  await page.click(`[data-development-map-undo="${activeId}"]`);
  await page.waitForFunction(() => (document.body.textContent || "").includes("Visszaállítva:"), { timeout: 15000 });
  const stored = await db.from("dev_center_tasks").select("project_id,branch_name,worktree_path,metadata").eq("id", activeId).single();
  check("Browser undo restores previous placement", stored.data?.metadata?.developmentMap?.nodeId === "benjadmin-console-chat", JSON.stringify(stored.data?.metadata?.developmentMap || {}));
  check("Browser undo keeps physical Git identity unchanged", stored.data?.project_id === "project_dimprover" && stored.data?.branch_name === "feature/map-v2-ui-active" && stored.data?.worktree_path === "/srv/dimpro-dev/worktrees/map-v2-ui-active", JSON.stringify(stored.data));
  const audit = await db.from("dev_center_audit_events").select("metadata").eq("task_id", activeId).eq("action", "TASK_DEVELOPMENT_MAP_UNDONE").order("created_at", { ascending: false }).limit(1).maybeSingle();
  check("Browser undo audit is PROD denied", audit.data?.metadata?.productionAccess === "DENY" && audit.data?.metadata?.physicalGitMove === false, JSON.stringify(audit.data?.metadata || {}));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const mobile = await page.evaluate(() => ({ visible: Boolean(document.querySelector('[data-testid="benjadmin-development-map"]')), layers: Boolean(document.querySelector('[data-testid="benjadmin-development-map-layers"]')), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  check("Map V2 mobile keeps layer controls", mobile.visible && mobile.layers, JSON.stringify(mobile));
  check("Map V2 mobile overflow safe", mobile.overflow === false, JSON.stringify(mobile));

  console.log(JSON.stringify({ ok: true, passed, failed: 0, marker, activeId, technicalId, archiveId, productionAccess: "DENY" }, null, 2));
} finally {
  await cleanup();
}
