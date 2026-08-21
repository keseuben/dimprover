import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function readEnv(file) {
  const raw = fs.readFileSync(file, "utf8");
  return Object.fromEntries(raw.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

const root = process.cwd();
const envFile = process.env.BENJADMIN_ENV_FILE?.trim() || path.join(root, ".env.local");
const env = readEnv(envFile);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing DEV Supabase environment.");
let appHost = "";
try { appHost = new URL(env.NEXT_PUBLIC_APP_URL || "").hostname; } catch {}
const allowedDevHosts = new Set(["app.dev.dimpro.hu", "admin.dev.dimpro.hu"]);
if (!allowedDevHosts.has(appHost)) throw new Error(`PROD DENY: registry script kizárólag DIMPRO DEV környezeten futhat. Host: ${appHost || "nincs"}`);

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const now = new Date().toISOString();

const project = {
  id: "project_benjadmin",
  name: "BENJADMIN Fejlesztői Konzol",
  slug: "benjadmin-fejlesztoi-konzol",
  category: "Belső fejlesztési és AI-vezérlő platform",
  description: "A DIMPRO / DIMPROVER fejlesztésirányítási control plane-je: BenAI koordináció, AI worker taskok, ChatGrid Desktop, külső AI review, live státusz, audit és release-koordináció.",
  status: "active",
  accent: "cyan",
  updated_at: now,
  metadata: {
    system: "BENJADMIN",
    role: "internal_development_control_plane",
    productionAccess: "DENY",
    chatGrid: true,
    externalAiWorkers: ["MFORGE", "VGUARD"],
    registeredBy: "BenAI",
    registeredAt: now,
  },
};

const versions = [
  {
    id: "version_benjadmin_chatgrid_029",
    project_id: project.id,
    version: "0.2.9",
    module_name: "ChatGrid Desktop",
    title: "BENJADMIN ChatGrid Desktop v0.2.9",
    summary: "Windows Electron ChatGrid: 01–04 worker grid + 05 BenjAdmin, Daily Start, task launch, avatar/profile, használati útmutató, globális értesítések és DEV live pairing.",
    status: "testing",
    updated_at: now,
    download_url: "https://admin.dev.dimpro.hu/downloads/benjadmin-chatgrid/BENJADMIN-ChatGrid-0.2.9-Windows-x64.exe",
    test_summary: "Source acceptance 123/123 PASS; Ctrl+Alt+9 és globális BEÁLLÍTÁSOK fizikai Windows hotfix ellenőrzés PASS; teljes Windows E2E még nyitott.",
    next_step: "Teljes fizikai Windows E2E lezárása, majd External Review Room ChatGrid UI fejlesztése.",
    created_by: "BenAI",
    metadata: {
      environment: "DEV",
      productionAccess: "DENY",
      sourceBranch: "feature/benjadmin-chatgrid-v029-hotfix-20260821",
      sourceCommit: "55f4ae330a61fde592df7327d281dbae89c8b8c2",
      documentationCommit: "c177932d5156c51434d34f2114621a9d810411cc",
      platform: "Windows Electron",
      physicalWindowsE2E: "PARTIAL_PASS",
    },
  },
  {
    id: "version_benjadmin_chatgrid_external_review_v01",
    project_id: project.id,
    version: "0.1.0-planned",
    module_name: "ChatGrid External Review Room",
    title: "ChatGrid External Review Room · M.Forge-AI + V.Guard-AI",
    summary: "Közös, BenjAdmin által látható és vezérelhető review thread BenAI, M.Forge-AI és V.Guard-AI között; provider/model státusz, verdict, diff/finding és explicit DEV write approval kapu.",
    status: "planned",
    updated_at: now,
    test_summary: "Még nincs implementációs acceptance; BENJADMIN backend M.Forge/V.Guard workflow és provider adapter alapjai már léteznek.",
    next_step: "ChatGrid read-only review-room UI + BENJADMIN review-thread API szerződés és explicit BenjAdmin write-approval UX tervezése/implementálása.",
    created_by: "BenAI",
    metadata: {
      environment: "DEV",
      productionAccess: "DENY",
      defaultMode: "READ_ONLY_REVIEW",
      participants: ["BENJADMIN", "BENAI", "MFORGE", "VGUARD"],
      providers: ["OPENAI_CODEX", "CLAUDE"],
      writePolicy: "EXPLICIT_BENJADMIN_APPROVAL_REQUIRED",
      mforgeDefaultMode: "READ_ONLY_REVIEW_WITH_SCOPED_DEV_WRITE_ESCALATION",
      vguardDefaultMode: "INDEPENDENT_REVIEW_ONLY",
      vguardWriteEscalation: "EXPLICIT_SCOPED_DEV_WRITE_INVALIDATES_INDEPENDENT_REVIEW",
      visibility: "BENJADMIN_VISIBLE_THREAD",
    },
  },
];

const projectResult = await db.from("dev_center_projects").upsert(project, { onConflict: "id" }).select("id,name,slug,status,metadata").single();
if (projectResult.error) throw projectResult.error;
const versionResult = await db.from("dev_center_versions").upsert(versions, { onConflict: "id" }).select("id,project_id,version,module_name,title,status,next_step,metadata");
if (versionResult.error) throw versionResult.error;

const auditId = "dev-audit-chatgrid-registry-v01";
const audit = await db.from("dev_center_audit_events").upsert({
  id: auditId,
  actor_type: "system",
  actor_id: "BenAI",
  action: "BENJADMIN_CHATGRID_REGISTERED",
  entity_type: "project",
  entity_id: project.id,
  project_id: project.id,
  summary: "BENJADMIN ChatGrid Desktop és External Review Room hivatalosan felvezetve a DEV Development Centerbe.",
  metadata: { versionIds: versions.map((item) => item.id), productionAccess: "DENY", source: "benjadmin-chatgrid-project-registry.mjs", updatedAt: now },
}, { onConflict: "id" });
if (audit.error) throw audit.error;

console.log(JSON.stringify({ ok: true, project: projectResult.data, versions: versionResult.data, auditId }, null, 2));
