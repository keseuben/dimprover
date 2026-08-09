import { promises as fs } from "node:fs";
import dns from "node:dns/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();

function parseEnv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function httpStatus(url) {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    return response.status;
  } catch {
    return 0;
  }
}

const checks = [];
function add(id, status, detail) {
  checks.push({ id, status, detail });
}

const env = parseEnv(await fs.readFile(path.join(root, ".env.local"), "utf8"));
const allowlist = (env.DIMPRO_APP_ALLOWED_EMAILS || "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
add("auth.allowlist", allowlist.length === 1 && allowlist[0] === "keseruben90@gmail.com" ? "PASS" : "BLOCKED", `count=${allowlist.length}`);

if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  try {
    const settings = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(15000),
    });
    const body = await settings.json();
    add("auth.signup-disabled", settings.ok && body.disable_signup === true ? "PASS" : "BLOCKED", `http=${settings.status}; disable_signup=${String(body.disable_signup)}`);
  } catch (error) {
    add("auth.signup-disabled", "BLOCKED", error instanceof Error ? error.message : "settings request failed");
  }
} else {
  add("auth.signup-disabled", "BLOCKED", "Supabase DEV env missing");
}

const loginLog = path.join(root, ".dimprover", "data", "dimpro-login-attempts.log");
if (await fileExists(loginLog)) {
  const lines = (await fs.readFile(loginLog, "utf8")).trim().split(/\r?\n/).slice(-200);
  const verified = lines.some((line) => {
    try {
      const row = JSON.parse(line);
      return row.email === "keseruben90@gmail.com" && row.action === "verify_otp" && row.result === "otp_verified";
    } catch {
      return false;
    }
  });
  add("auth.real-otp-e2e", verified ? "PASS" : "BLOCKED", verified ? "otp_verified present" : "no verified OTP found");
} else {
  add("auth.real-otp-e2e", "BLOCKED", "login attempt log missing");
}

for (const url of [
  "https://dev.dimpro.hu/login",
  "https://app.dev.dimpro.hu/login",
  "https://drop.dev.dimpro.hu/api/drop/health",
  "https://app.dev.dimpro.hu/api/dimpro-identity/health",
]) {
  const status = await httpStatus(url);
  add(`http.${new URL(url).hostname}${new URL(url).pathname}`, status === 200 ? "PASS" : "BLOCKED", `http=${status}`);
}

try {
  const addresses = await dns.resolve4("admin.dev.dimpro.hu");
  add("dns.admin-dev", addresses.includes("213.160.68.32") ? "PASS" : "BLOCKED", addresses.join(","));
} catch (error) {
  add("dns.admin-dev", "BLOCKED", error instanceof Error ? error.code || error.message : "DNS lookup failed");
}

const deployKey = "/root/.ssh/dimpro_dev_github_ed25519.pub";
add("github.deploy-key-prepared", await fileExists(deployKey) ? "PASS" : "BLOCKED", await fileExists(deployKey) ? "public key exists on DEV" : "deploy key missing");
let remote = "";
try {
  remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" }).trim();
} catch {}
add("github.write-routing", remote.startsWith("git@") || remote.startsWith("ssh://") ? "PASS" : "BLOCKED", remote || "origin missing");

const driveMode = env.DIMPRO_DRIVE_STORAGE_MODE || "missing";
const dropMode = env.DIMPRO_DROP_STORAGE_MODE || "missing";
add("storage.drive-dev-write", driveMode !== "disabled" && driveMode !== "missing" ? "PASS" : "BLOCKED", `mode=${driveMode}`);
add("storage.drop-dev-write", dropMode !== "disabled" && dropMode !== "missing" ? "PASS" : "BLOCKED", `mode=${dropMode}`);

let gitStatus = "unknown";
try {
  gitStatus = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() ? "dirty" : "clean";
} catch {}

const blockers = checks.filter((check) => check.status === "BLOCKED");
console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  stage: "BENJADMIN B3 M0",
  overall: blockers.length ? "BLOCKED" : "PASS",
  gitStatus,
  pass: checks.filter((check) => check.status === "PASS").length,
  blocked: blockers.length,
  checks,
}, null, 2));
