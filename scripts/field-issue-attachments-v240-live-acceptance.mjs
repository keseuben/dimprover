import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const baseUrl = process.env.V240_LIVE_BASE_URL?.trim() || "http://127.0.0.1:3100";
const appHost = "app.dev.dimpro.hu";
const adminHost = "admin.dev.dimpro.hu";
const projectId = "project-drive-compare-rc1-qa";
const expectedPointer = ".next-benjadmin-v11-field-v240-unified";
const expectedBuild = "AYDYKkH-j2894_4NduMJF";
const expectedCommit = "8ee7e1722b63";
const expectedPhotoDocumentId = "drive-document-f4121ea18e6b";
const rejectedDocumentId = "drive-document-ff51e65fc147";
const artifactRoot = "/srv/dimpro-dev/artifacts/benjadmin-v11-field-v240-unified-20260815T214227+0200";
const token = fs.readFileSync(`${root}/.dimprover/drive/dev-token.txt`, "utf8").trim();
const adminKey = fs.readFileSync(`${root}/.dimprover/license/admin-key.txt`, "utf8").trim();
let passed = 0;

function check(name, condition, detail = "") {
  assert.ok(condition, `${name}${detail ? `: ${detail}` : ""}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function request(path, { auth = false, admin = false, redirect = "follow" } = {}) {
  const headers = { host: admin ? adminHost : appHost };
  if (auth) {
    headers["x-dimpro-drive-dev-token"] = token;
    headers["x-dimpro-notification-user-id"] = "qa-drive-rc1";
  }
  if (admin) headers["x-dimpro-license-admin-key"] = adminKey;
  const response = await fetch(`${baseUrl}${path}`, { headers, redirect });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { response, payload };
}

function psqlJson(sql) {
  const result = spawnSync("psql", [
    "-w",
    "-h", "aws-0-eu-central-1.pooler.supabase.com",
    "-p", "5432",
    "-U", "postgres.pbgyuznivqvestuksvif",
    "-d", "postgres",
    "-X",
    "-v", "ON_ERROR_STOP=1",
    "-Atc", sql,
  ], { encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error("Live acceptance read-only DB probe failed.");
  return JSON.parse(result.stdout.trim());
}

const pointer = fs.readFileSync(`${root}/.dimprover/active-next-release`, "utf8").trim();
check("active pointer unified V11+V0.4", pointer === expectedPointer, pointer);
const buildId = fs.readFileSync(`${root}/${pointer}/BUILD_ID`, "utf8").trim();
check("active build identity", buildId === expectedBuild, buildId);

const pm2 = spawnSync("pm2", ["jlist"], { encoding: "utf8" });
if (pm2.error || pm2.status !== 0) throw new Error("PM2 state unavailable.");
const main = JSON.parse(pm2.stdout).find((item) => item.name === "dimpro-benjadmin-operator-ui-v2-dev");
check("main PM2 online", main?.pm2_env?.status === "online", String(main?.pm2_env?.status || "missing"));
check("main PM2 unstable restarts zero", Number(main?.pm2_env?.unstable_restarts || 0) === 0);

const issuePage = await request(`/jegyzokonyvek/hibajegyzek?projectId=${projectId}`, { redirect: "manual" });
check("Hibajegyzék public login gate", issuePage.response.status === 307);
check("Hibajegyzék projectId preserved", issuePage.response.headers.get("location") === `/login?projectId=${projectId}`, issuePage.response.headers.get("location") || "");

const fieldPage = await request(`/jegyzokonyvek/uj/terepi-hibafelvetel?projectId=${projectId}`, { redirect: "manual" });
check("Terepi HJ public login gate", fieldPage.response.status === 307);
check("Terepi HJ projectId preserved", fieldPage.response.headers.get("location") === `/login?projectId=${projectId}`, fieldPage.response.headers.get("location") || "");

const login = await request(`/login?projectId=${projectId}`);
check("login page reachable", login.response.status === 200);

const unauthHealth = await request(`/api/projects/${projectId}/issues/health`);
check("Issue health unauthenticated denied", unauthHealth.response.status === 401);

const issuesResult = await request(`/api/projects/${projectId}/issues`, { auth: true });
check("issue list HTTP 200", issuesResult.response.status === 200 && Array.isArray(issuesResult.payload?.issues));
const issue1 = issuesResult.payload.issues.find((item) => item.serial === "HJ-00001");
const issue2 = issuesResult.payload.issues.find((item) => item.serial === "HJ-00002");
check("HJ-00001 business state preserved", issue1?.sourceType === "COMPARE_FINDING" && issue1?.severity === "URGENT" && issue1?.status === "NEW" && Number(issue1?.version) === 3);
check("HJ-00002 business state preserved", issue2?.sourceType === "FIELD_CAPTURE" && issue2?.severity === "URGENT" && issue2?.status === "IN_PROGRESS" && Number(issue2?.version) === 2);
check("HJ-00002 attachment counters restored zero", Number(issue2?.attachmentCount || 0) === 0 && Number(issue2?.photoAttachmentCount || 0) === 0 && Number(issue2?.planAttachmentCount || 0) === 0);
check("HJ-00002 id available", typeof issue2?.id === "string" && issue2.id.length > 0);

const unauthAttachments = await request(`/api/projects/${projectId}/issues/${encodeURIComponent(issue2.id)}/attachments`);
check("attachment API unauthenticated denied", unauthAttachments.response.status === 401);
const attachments = await request(`/api/projects/${projectId}/issues/${encodeURIComponent(issue2.id)}/attachments`, { auth: true });
check("HJ-00002 attachment list HTTP 200", attachments.response.status === 200 && attachments.payload?.ok === true);
check("HJ-00002 active attachment list empty", Array.isArray(attachments.payload?.attachments) && attachments.payload.attachments.length === 0);

const health = await request(`/api/projects/${projectId}/issues/health`, { auth: true });
check("Issue Core V0.4 health HTTP 200", health.response.status === 200);
check("Issue Core V0.4 schema ready", health.payload?.version === "0.4.0" && health.payload?.databaseReady === true && health.payload?.actualSchemaVersion === "0.4.0");

const driveHealth = await request(`/api/projects/${projectId}/drive/health`, { auth: true });
check("Drive health HTTP 200", driveHealth.response.status === 200 && driveHealth.payload?.ok === true);
check("Drive Core database ready", driveHealth.payload?.database?.ready === true && driveHealth.payload?.database?.actualSchemaVersion === "0.3.0");
check("Drive private object storage active", driveHealth.payload?.storage?.mode === "active" && driveHealth.payload?.storage?.realObjectWriteEnabled === true && driveHealth.payload?.storage?.realObjectDownloadEnabled === true);
check("Drive ClamAV security ready", driveHealth.payload?.security?.ready === true && driveHealth.payload?.security?.engine === "ClamAV" && driveHealth.payload?.security?.ping === "PONG");
check("Compare Findings V2 regression ready", driveHealth.payload?.compareFindings?.version === "2.0.0" && driveHealth.payload?.compareFindings?.databaseReady === true && driveHealth.payload?.compareFindings?.actualSchemaVersion === "2.0.0");

const tree = await request(`/api/projects/${projectId}/drive/tree`, { auth: true });
check("Drive tree HTTP 200", tree.response.status === 200 && tree.payload?.tree);
const qaPhoto = tree.payload.tree.documents.find((item) => item.id === expectedPhotoDocumentId);
check("V0.4 QA photo Drive document preserved after unlink", Boolean(qaPhoto && qaPhoto.status !== "DELETED"));
const rejected = tree.payload.tree.documents.find((item) => item.id === rejectedDocumentId);
check("REJECTED EICAR evidence remains rejected", rejected?.currentVersion?.status === "REJECTED");

const context = await request("/api/dev/console/context", { admin: true });
check("BENJADMIN runtime context HTTP 200", context.response.status === 200);
check("BENJADMIN runtime build exact", context.payload?.context?.buildId === expectedBuild);
check("BENJADMIN runtime source exact", context.payload?.context?.commit === expectedCommit && context.payload?.context?.branch === "feat/benjadmin-operator-ui-v2");
check("BENJADMIN release identity exact", context.payload?.context?.releaseIdentity?.distDir === expectedPointer && context.payload?.context?.releaseIdentity?.metadataReady === true);

const audit = psqlJson(`select json_build_object(
  'linked', count(*) filter(where event_type='PROJECT_ISSUE_ATTACHMENT_LINKED'),
  'updated', count(*) filter(where event_type='PROJECT_ISSUE_ATTACHMENT_UPDATED'),
  'unlinked', count(*) filter(where event_type='PROJECT_ISSUE_ATTACHMENT_UNLINKED')
)::text from public.project_core_audit_events
where project_id='${projectId}' and entity_type='issue' and entity_id='${issue2.id}';`);
check("V0.4 attachment audit linked evidence", Number(audit.linked) >= 6, JSON.stringify(audit));
check("V0.4 attachment audit update evidence", Number(audit.updated) >= 2, JSON.stringify(audit));
check("V0.4 attachment audit unlink evidence", Number(audit.unlinked) >= 6, JSON.stringify(audit));

const browserLog = fs.readFileSync(`${artifactRoot}/live-v11-browser-acceptance.log`, "utf8");
check("live V11 browser acceptance 12/12 recorded", browserLog.includes('"passed": 12') && browserLog.includes('"failed": 0'));

console.log(JSON.stringify({
  ok: true,
  contract: "Unified V11 + Field Issue Attachments V2.4 live acceptance",
  passed,
  failed: 0,
  buildId,
  releaseSource: expectedCommit,
  projectId,
  issueSerial: issue2.serial,
  audit,
  completedAt: new Date().toISOString(),
}, null, 2));
