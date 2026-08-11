import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";

try { process.loadEnvFile?.(".env.local"); } catch {}

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const uiBase = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
const fixture = {
  name: "B3.2 P3 Provisioning Acceptance",
  slug: "b32-p3-provisioning-acceptance",
  partnerOrgId: "b32-p3-acceptance",
  deliveryModel: "HANDOFF",
  dataClassification: "NORMAL",
  creationKey: "b32-p3-provisioning-acceptance-20260811",
  createdBy: "B3.2 P3 acceptance",
};
const checks = [];

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

async function api(path, { method = "GET", body, auth = true } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      host,
      ...(auth ? { "x-dimpro-license-admin-key": adminKey } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

function gitAsOutmin(args) {
  return execFileSync("/usr/sbin/runuser", ["-u", "outmin", "--", "/usr/bin/git", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

if (!supabaseUrl || !serviceKey) throw new Error("DEV Supabase service-role environment missing");
const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

let result = await api("/api/dev/engine/partner-projects");
check("partner schema 0.2.0 READY", result.status === 200 && result.payload?.health?.ready === true && result.payload?.health?.actualSchemaVersion === "0.2.0", `status=${result.status} version=${result.payload?.health?.actualSchemaVersion}`);
check("P2 runtime is READY prerequisite", result.payload?.runtimeIsolation?.ready === true && result.payload?.runtimeIsolation?.stage === "READY", `stage=${result.payload?.runtimeIsolation?.stage}`);

result = await api("/api/dev/engine/partner-projects/nonexistent-p3/provision", { method: "POST", auth: false, body: { createdBy: "unauth" } });
check("unauthenticated provisioning is blocked", result.status === 401, `status=${result.status}`);

const created = await api("/api/dev/engine/partner-projects", { method: "POST", body: fixture });
check("HANDOFF acceptance draft created", [200, 201].includes(created.status) && created.payload?.ok === true, `status=${created.status}`);
const projectId = created.payload?.result?.projectId || "";
const projectCode = created.payload?.result?.projectCode || "";
check("fixture has stable PART code", Boolean(projectId) && /^PART-[0-9]{4,}$/.test(projectCode), `projectCode=${projectCode}`);
check("fixture starts DRAFT", created.payload?.project?.provisionState === "DRAFT", `state=${created.payload?.project?.provisionState}`);

const provision = await api(`/api/dev/engine/partner-projects/${encodeURIComponent(projectId)}/provision`, { method: "POST", body: { createdBy: "B3.2 P3 acceptance" } });
check("HANDOFF provisioning reaches READY", provision.status === 200 && provision.payload?.ready === true, `status=${provision.status} ready=${provision.payload?.ready}`);
check("provision result reports READY state", provision.payload?.project?.provisionState === "READY", `state=${provision.payload?.project?.provisionState}`);
const plan = provision.payload?.plan || {};
const expectedRepoPath = `/srv/partner-dev/repositories/${projectCode}.git`;
const expectedWorktreePath = `/srv/partner-dev/worktrees/outmin/${projectCode}`;
check("deterministic repository/worktree refs", plan.repositoryPath === expectedRepoPath && plan.worktreePath === expectedWorktreePath, JSON.stringify({ repositoryPath: plan.repositoryPath, worktreePath: plan.worktreePath }));
check("baseline isolation PASS", provision.payload?.baseline?.partnerWrite === true && provision.payload?.baseline?.internalReadDenied === true && provision.payload?.baseline?.internalTraverseDenied === true && provision.payload?.baseline?.secretReadDenied === true, JSON.stringify(provision.payload?.baseline || {}));

const reprovision = await api(`/api/dev/engine/partner-projects/${encodeURIComponent(projectId)}/provision`, { method: "POST", body: { createdBy: "B3.2 P3 idempotency" } });
check("READY reprovision is idempotent", reprovision.status === 200 && reprovision.payload?.ready === true && reprovision.payload?.idempotent === true, `status=${reprovision.status} idempotent=${reprovision.payload?.idempotent}`);

const detail = await api(`/api/dev/engine/partner-projects/${encodeURIComponent(projectId)}`);
check("detail read model remains READY", detail.status === 200 && detail.payload?.project?.provisionState === "READY" && detail.payload?.project?.repositoryCount === 1, `state=${detail.payload?.project?.provisionState} repos=${detail.payload?.project?.repositoryCount}`);
check("DEV ready and no partner PROD bind", detail.payload?.project?.environments?.DEV === "ready" && detail.payload?.project?.environments?.PROD === "NOT_BOUND", JSON.stringify(detail.payload?.project?.environments || {}));

const [repos, envs, policies, entitlements, targets, secretRefs] = await Promise.all([
  db.from("dev_center_repositories").select("id,project_id,dev_path,metadata").eq("project_id", projectId),
  db.from("dev_center_partner_environments").select("environment_id,environment_type,runtime_ref,db_ref,storage_ref,health_status").eq("project_id", projectId),
  db.from("dev_center_partner_access_policies").select("resource_type,resource_ref,access_level,subject_worker_id").eq("project_id", projectId),
  db.from("dev_center_partner_engine_entitlements").select("engine_key,status,current_version").eq("project_id", projectId),
  db.from("dev_center_partner_delivery_targets").select("target_type,deploy_mode,approval_policy,status").eq("project_id", projectId),
  db.from("dev_center_secret_references").select("secret_key_name,provider,reference_path,metadata").eq("scope_type", "partner_project").eq("scope_id", projectId),
]);
for (const item of [repos, envs, policies, entitlements, targets, secretRefs]) {
  if (item.error) throw new Error(`DB inspection failed: ${item.error.code || item.error.message}`);
}
check("repository registry isolated to partner root", repos.data?.length === 1 && repos.data[0]?.dev_path === expectedRepoPath, JSON.stringify(repos.data || []));
check("DEV/STAG bindings only", envs.data?.length === 2 && envs.data.some((row) => row.environment_type === "PARTNER_DEV") && envs.data.some((row) => row.environment_type === "PARTNER_STAG") && !envs.data.some((row) => row.environment_type === "PARTNER_PROD"), JSON.stringify(envs.data || []));
check("HANDOFF DB/storage refs require no internal provider", envs.data?.every((row) => row.db_ref === "not-required://handoff" && row.storage_ref === "not-required://handoff"), "HANDOFF refs only");
check("Outmin repository/path/environment allowlist created", policies.data?.some((row) => row.resource_type === "repository" && row.resource_ref === plan.repositoryId && row.access_level === "WRITE") && policies.data?.some((row) => row.resource_type === "path" && row.resource_ref === expectedWorktreePath && row.access_level === "WRITE") && policies.data?.filter((row) => row.resource_type === "environment" && row.access_level === "WRITE").length === 2, `policies=${policies.data?.length || 0}`);
check("shared engine entitlements are bounded", entitlements.data?.length === 3 && ["dev-center:write", "dev-center:build", "dev-center:test"].every((key) => entitlements.data.some((row) => row.engine_key === key && row.status === "allowed" && row.current_version === "0.3.0")), JSON.stringify(entitlements.data || []));
check("HANDOFF delivery target ready", targets.data?.length === 1 && targets.data[0]?.target_type === "HANDOFF" && targets.data[0]?.deploy_mode === "handoff" && targets.data[0]?.status === "ready", JSON.stringify(targets.data || []));
check("secret registry stores references only", secretRefs.data?.length === 2 && secretRefs.data.every((row) => typeof row.reference_path === "string" && row.reference_path.startsWith("secretref://") && row.metadata?.rawSecretStored === false), JSON.stringify(secretRefs.data || []));

const repoStat = fs.statSync(expectedRepoPath);
const worktreeStat = fs.statSync(expectedWorktreePath);
check("filesystem ownership is Outmin identity", repoStat.uid > 0 && repoStat.uid === worktreeStat.uid && repoStat.gid === worktreeStat.gid, JSON.stringify({ uid: repoStat.uid, gid: repoStat.gid }));
check("bare repository is valid", gitAsOutmin(["--git-dir", expectedRepoPath, "rev-parse", "--is-bare-repository"]) === "true");
check("worktree branch is main", gitAsOutmin(["-C", expectedWorktreePath, "symbolic-ref", "--short", "HEAD"]) === "main");

const internalDeny = await api("/api/dev/engine/tasks", {
  method: "POST",
  body: {
    projectId: "project_dimprover",
    repositoryId: "repo_dimprover",
    title: "B3.2 P3 internal deny acceptance - must not persist",
    requestedWorkerId: "worker_outminai",
    scope: [{ type: "path", key: "app" }],
  },
});
check("Outmin INTERNAL deny remains enforced after P3", internalDeny.status === 403 && internalDeny.payload?.code === "PARTNER_OUTMIN_INTERNAL_DENIED", `status=${internalDeny.status} code=${internalDeny.payload?.code}`);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((key) => {
    localStorage.setItem("dimproLicenseAdminKey", key);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("dimpro-admin-theme", "dark");
  }, adminKey);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(uiBase, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".operator-console.operator-compact", { timeout: 30000 });
  await page.$$eval(".operator-view-tabs button", (buttons) => {
    const button = buttons.find((item) => (item.textContent || "").trim() === "Partner fejlesztések");
    if (!button) throw new Error("Partner fejlesztések tab missing");
    button.click();
  });
  await page.waitForSelector("[data-testid=partner-development-panel]", { timeout: 30000 });
  await page.waitForFunction((code) => (document.querySelector("[data-testid=partner-development-panel]")?.textContent || "").includes(code), { timeout: 30000 }, projectCode);
  const ui = await page.evaluate((code) => ({
    text: document.querySelector("[data-testid=partner-development-panel]")?.textContent || "",
    provisionDisabled: (document.querySelector(`[data-testid="partner-provision-${code}"]`))?.disabled === true,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    tooSmall: Array.from(document.querySelectorAll("[data-testid=partner-development-panel] *")).filter((node) => {
      const style = getComputedStyle(node);
      const size = Number.parseFloat(style.fontSize || "0");
      return size > 0 && size < 12 && node.textContent?.trim();
    }).slice(0, 10).map((node) => ({ tag: node.tagName, text: node.textContent?.trim().slice(0, 40), size: getComputedStyle(node).fontSize })),
  }), projectCode);
  check("Operator UI shows P3 READY project", ui.text.includes(projectCode) && ui.text.includes("READY") && ui.text.includes("P2 FUTÁSI KÖRNYEZET READY"), `projectCode=${projectCode}`);
  check("READY provision action is disabled", ui.provisionDisabled === true);
  check("Partner UI body typography stays >=12px", ui.tooSmall.length === 0, JSON.stringify(ui.tooSmall));
  check("desktop Partner UI has no horizontal overflow", ui.scrollWidth <= ui.clientWidth + 1, JSON.stringify(ui));
} finally {
  await browser.close();
}

console.log(JSON.stringify({
  ok: true,
  projectId,
  projectCode,
  repositoryId: plan.repositoryId,
  repositoryPath: expectedRepoPath,
  worktreePath: expectedWorktreePath,
  devEnvironmentId: plan.devEnvironmentId,
  stagEnvironmentId: plan.stagEnvironmentId,
  passed: checks.length,
  failed: 0,
  checks,
}, null, 2));
