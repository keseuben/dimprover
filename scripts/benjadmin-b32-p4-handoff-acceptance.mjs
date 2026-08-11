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
  return execFileSync("/usr/sbin/runuser", ["-u", "outmin", "--", "/usr/bin/git", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

if (!supabaseUrl || !serviceKey) throw new Error("DEV Supabase service-role environment missing");
const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const fixture = {
  name: "B3.2 P4 Partnerátadás Acceptance",
  slug: `b32-p4-partneratadas-${Date.now()}`,
  partnerOrgId: "b32-p4-acceptance",
  deliveryModel: "HANDOFF",
  dataClassification: "NORMAL",
  creationKey: `b32-p4-handoff-${Date.now()}`,
  createdBy: "B3.2 P4 acceptance",
};

let projectId = "";
let projectCode = "";
let repositoryPath = "";
let worktreePath = "";
let handoffId = "";
let releaseId = "";

async function cleanup() {
  if (!projectId) return;
  const operations = [
    ["dev_center_partner_handoffs", "project_id"],
    ["dev_center_releases", "project_id"],
    ["dev_center_secret_references", "scope_id", { scope_type: "partner_project" }],
    ["dev_center_partner_delivery_targets", "project_id"],
    ["dev_center_partner_engine_entitlements", "project_id"],
    ["dev_center_partner_access_policies", "project_id"],
    ["dev_center_partner_environments", "project_id"],
    ["dev_center_repositories", "project_id"],
    ["dev_center_audit_events", "project_id"],
    ["dev_center_partner_projects", "project_id"],
    ["dev_center_projects", "id"],
  ];
  for (const [table, column, extra] of operations) {
    let query = db.from(table).delete().eq(column, projectId);
    if (extra) for (const [key, value] of Object.entries(extra)) query = query.eq(key, value);
    const result = await query;
    if (result.error) console.error(`CLEANUP WARN ${table}: ${result.error.code || result.error.message}`);
  }

  if (projectCode) {
    const environmentCodes = [`${projectCode}-DEV`, `${projectCode}-STAG`];
    const environmentCleanup = await db.from("dev_center_environments").delete().in("code", environmentCodes);
    if (environmentCleanup.error) console.error(`CLEANUP WARN dev_center_environments: ${environmentCleanup.error.code || environmentCleanup.error.message}`);
  }

  const allowedRepoPrefix = "/srv/partner-dev/repositories/";
  const allowedWorktreePrefix = "/srv/partner-dev/worktrees/outmin/";
  if (worktreePath.startsWith(allowedWorktreePrefix) && projectCode && worktreePath.endsWith(`/${projectCode}`)) {
    fs.rmSync(worktreePath, { recursive: true, force: true });
  }
  if (repositoryPath.startsWith(allowedRepoPrefix) && projectCode && repositoryPath.endsWith(`/${projectCode}.git`)) {
    fs.rmSync(repositoryPath, { recursive: true, force: true });
  }
}

try {
  let result = await api("/api/dev/engine/partner-projects");
  check("Partner séma 0.2.0 READY", result.status === 200 && result.payload?.health?.ready === true && result.payload?.health?.actualSchemaVersion === "0.2.0", `status=${result.status}`);
  check("P2 futási környezet (runtime) READY", result.payload?.runtimeIsolation?.ready === true, `stage=${result.payload?.runtimeIsolation?.stage}`);

  result = await api("/api/dev/engine/partner-handoffs", { method: "POST", auth: false, body: {} });
  check("Hitelesítés nélküli átadás-előkészítés blokkolt", result.status === 401, `status=${result.status}`);
  result = await api("/api/dev/engine/partner-handoffs/nemletezo", { method: "PATCH", auth: false, body: { action: "ACCEPT" } });
  check("Hitelesítés nélküli átadási állapotváltás blokkolt", result.status === 401, `status=${result.status}`);

  const created = await api("/api/dev/engine/partner-projects", { method: "POST", body: fixture });
  check("P4 teszt partnerprojekt létrejött", [200, 201].includes(created.status) && created.payload?.ok === true, `status=${created.status}`);
  projectId = created.payload?.result?.projectId || "";
  projectCode = created.payload?.result?.projectCode || "";
  check("Stabil PART kód létrejött", Boolean(projectId) && /^PART-[0-9]{4,}$/.test(projectCode), projectCode);

  const provisioned = await api(`/api/dev/engine/partner-projects/${encodeURIComponent(projectId)}/provision`, { method: "POST", body: { createdBy: "B3.2 P4 acceptance" } });
  check("Partnerprojekt kiépítése (provisioning) READY", provisioned.status === 200 && provisioned.payload?.ready === true, `status=${provisioned.status}`);
  repositoryPath = provisioned.payload?.plan?.repositoryPath || "";
  worktreePath = provisioned.payload?.plan?.worktreePath || "";
  check("Partner repository/worktree elkülönített", repositoryPath.startsWith("/srv/partner-dev/repositories/") && worktreePath.startsWith("/srv/partner-dev/worktrees/outmin/"), JSON.stringify({ repositoryPath, worktreePath }));

  const fixtureFile = `${worktreePath}/P4_ATADASI_MINTA.txt`;
  fs.writeFileSync(fixtureFile, "BENJADMIN B3.2 P4 átadási acceptance\n", "utf8");
  gitAsOutmin(["-C", worktreePath, "add", "P4_ATADASI_MINTA.txt"]);
  gitAsOutmin(["-C", worktreePath, "-c", "user.name=BENJADMIN P4 Acceptance", "-c", "user.email=benjadmin-p4@local.invalid", "commit", "-m", "test: B3.2 P4 handoff fixture"]);
  gitAsOutmin(["-C", worktreePath, "push", "origin", "main"]);
  const commit = gitAsOutmin(["-C", worktreePath, "rev-parse", "HEAD"]);
  check("Átadási Git commit elkészült", /^[0-9a-f]{40}$/i.test(commit), commit.slice(0, 12));

  const secretRejected = await api("/api/dev/engine/partner-handoffs", {
    method: "POST",
    body: { projectId, gitCommit: commit, buildId: "P4-BUILD-SECRET-CHECK", notes: "token=tiltott-nyers-titok-123456789", actor: "B3.2 P4 acceptance" },
  });
  check("Nyers titok az átadási jegyzékből blokkolt", secretRejected.status === 400 && secretRejected.payload?.code === "PARTNER_HANDOFF_RAW_SECRET_DENIED", `status=${secretRejected.status} code=${secretRejected.payload?.code}`);

  const prepared = await api("/api/dev/engine/partner-handoffs", {
    method: "POST",
    body: {
      projectId,
      gitCommit: commit,
      buildId: "B3.2-P4-ACCEPTANCE-BUILD-20260811",
      notes: "P4 acceptance átadási jegyzék, build once / deploy many ellenőrzéshez.",
      artifactRefs: ["artifactref://b32-p4/acceptance-package"],
      actor: "B3.2 P4 acceptance",
    },
  });
  check("Átadás előkészítve (prepared)", prepared.status === 201 && prepared.payload?.handoff?.status === "prepared", `status=${prepared.status}`);
  handoffId = prepared.payload?.handoff?.id || "";
  releaseId = prepared.payload?.handoff?.releaseId || "";
  check("SHA-256 átadási ellenőrzőösszeg létrejött", /^sha256:[0-9a-f]{64}$/i.test(prepared.payload?.handoff?.checksum || ""), prepared.payload?.handoff?.checksum?.slice(0, 22) || "");
  check("Build/commit az átadási jegyzékhez rögzítve", prepared.payload?.handoff?.buildId === "B3.2-P4-ACCEPTANCE-BUILD-20260811" && prepared.payload?.handoff?.gitCommit === commit, releaseId);

  const releasePrepared = await db.from("dev_center_releases").select("status,git_commit,build_id,metadata").eq("id", releaseId).single();
  if (releasePrepared.error) throw new Error(releasePrepared.error.message);
  check("Általános kiadási mag (release core) jelölt állapotú", releasePrepared.data?.status === "candidate", releasePrepared.data?.status || "");
  check("Build once / deploy many jelölés rögzítve", releasePrepared.data?.metadata?.buildOnceDeployMany === true, JSON.stringify(releasePrepared.data?.metadata || {}));

  const invalidAccept = await api(`/api/dev/engine/partner-handoffs/${encodeURIComponent(handoffId)}`, { method: "PATCH", body: { action: "ACCEPT", actor: "B3.2 P4 acceptance" } });
  check("Érvénytelen prepared -> accepted ugrás blokkolt", invalidAccept.status === 409 && invalidAccept.payload?.code === "PARTNER_HANDOFF_TRANSITION_DENIED", `status=${invalidAccept.status}`);

  const handedOver = await api(`/api/dev/engine/partner-handoffs/${encodeURIComponent(handoffId)}`, { method: "PATCH", body: { action: "HAND_OVER", actor: "B3.2 P4 acceptance" } });
  check("Partnerátadás rögzítve (handed over)", handedOver.status === 200 && handedOver.payload?.handoff?.status === "handed_over" && Boolean(handedOver.payload?.handoff?.handedOverAt), `status=${handedOver.status}`);
  const releaseHanded = await db.from("dev_center_releases").select("status,approved_by,approved_at").eq("id", releaseId).single();
  check("Kiadási mag jóváhagyott (approved)", !releaseHanded.error && releaseHanded.data?.status === "approved" && Boolean(releaseHanded.data?.approved_at), releaseHanded.data?.status || "");

  const accepted = await api(`/api/dev/engine/partner-handoffs/${encodeURIComponent(handoffId)}`, { method: "PATCH", body: { action: "ACCEPT", actor: "B3.2 P4 acceptance" } });
  check("Partnerátadás elfogadva (accepted)", accepted.status === 200 && accepted.payload?.handoff?.status === "accepted" && Boolean(accepted.payload?.handoff?.acceptedAt), `status=${accepted.status}`);
  const releaseAccepted = await db.from("dev_center_releases").select("status,released_at").eq("id", releaseId).single();
  check("Kiadási mag kiadva (released)", !releaseAccepted.error && releaseAccepted.data?.status === "released" && Boolean(releaseAccepted.data?.released_at), releaseAccepted.data?.status || "");

  const repeated = await api(`/api/dev/engine/partner-handoffs/${encodeURIComponent(handoffId)}`, { method: "PATCH", body: { action: "ACCEPT", actor: "B3.2 P4 acceptance" } });
  check("Elfogadott átadás ismételt lezárása blokkolt", repeated.status === 409 && repeated.payload?.code === "PARTNER_HANDOFF_TRANSITION_DENIED", `status=${repeated.status}`);

  const handoffList = await api(`/api/dev/engine/partner-handoffs?projectId=${encodeURIComponent(projectId)}`);
  check("Partnerátadás lekérdezhető", handoffList.status === 200 && handoffList.payload?.handoffs?.some((item) => item.id === handoffId && item.status === "accepted"), `count=${handoffList.payload?.handoffs?.length || 0}`);

  const audit = await db.from("dev_center_audit_events").select("action").eq("project_id", projectId).in("action", ["PARTNER_HANDOFF_PREPARED", "PARTNER_HANDOFF_HANDED_OVER", "PARTNER_HANDOFF_ACCEPTED"]);
  check("P4 átadási audit események rögzítve", !audit.error && audit.data?.length === 3, `count=${audit.data?.length || 0}`);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
  try {
    const page = await browser.newPage();
    await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument((key) => {
      localStorage.setItem("dimproLicenseAdminKey", key);
      sessionStorage.setItem("dimproBenjadminSession", "active");
      localStorage.setItem("dimpro-admin-theme", "dark");
      localStorage.setItem("dimpro-benjadmin-board-pinned", "false");
    }, adminKey);

    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "mobil", width: 390, height: 844 },
    ]) {
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
      await page.goto(uiBase, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector(".operator-console.operator-compact", { timeout: 30000 });
      await page.$$eval(".operator-view-tabs button", (buttons) => {
        const button = buttons.find((item) => (item.textContent || "").trim() === "Partner fejlesztések");
        if (!button) throw new Error("Partner fejlesztések menü hiányzik");
        button.click();
      });
      await page.waitForSelector("[data-testid=partner-handoff-panel]", { timeout: 30000 });
      await page.waitForFunction((code) => (document.querySelector("[data-testid=partner-handoff-panel]")?.textContent || "").includes(code), { timeout: 30000 }, projectCode);
      const ui = await page.evaluate(() => ({
        panelText: document.querySelector("[data-testid=partner-development-panel]")?.textContent || "",
        handoffText: document.querySelector("[data-testid=partner-handoff-panel]")?.textContent || "",
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        tooSmall: Array.from(document.querySelectorAll("[data-testid=partner-development-panel] *")).filter((node) => {
          const size = Number.parseFloat(getComputedStyle(node).fontSize || "0");
          return size > 0 && size < 12 && node.textContent?.trim();
        }).slice(0, 10).map((node) => ({ text: node.textContent?.trim().slice(0, 40), size: getComputedStyle(node).fontSize })),
      }));
      check(`${viewport.name} P4 Partnerátadás panel látható`, ui.handoffText.includes("Átadási életciklus") && ui.handoffText.includes("Elfogadva (accepted)"), projectCode);
      check(`${viewport.name} magyar elsődleges feliratok láthatók`, ui.panelText.includes("PARTNER FEJLESZTÉSI SÍK") && ui.panelText.includes("Kiépítési életciklus") && ui.panelText.includes("Átadási modell"));
      check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, ui.scrollWidth <= ui.clientWidth + 1, JSON.stringify({ scrollWidth: ui.scrollWidth, clientWidth: ui.clientWidth }));
      check(`${viewport.name} partner törzsszöveg >=12px`, ui.tooSmall.length === 0, JSON.stringify(ui.tooSmall));
      if (viewport.name === "desktop") check("desktop Partner P4 egy viewportban marad", ui.scrollHeight <= ui.innerHeight + 1, JSON.stringify({ scrollHeight: ui.scrollHeight, innerHeight: ui.innerHeight }));
    }
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ ok: true, projectId, projectCode, handoffId, releaseId, passed: checks.length, failed: 0, checks }, null, 2));
} finally {
  await cleanup();
}
