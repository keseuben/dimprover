"server-only";

import fs from "node:fs";
import path from "node:path";
import { getWindowsBridgeDeviceAttestation } from "@/app/lib/dev-center/terminal-hub/windows-bridge-pairing";
import { DEVELOPER_GRID_VERSION } from "./types";
import { getDeveloperGridFoundation } from "./foundation";

const PUBLIC_RELEASE_ROOT = "/var/www/developer-grid-download";
const MAX_HEARTBEAT_AGE_MS = 10 * 60 * 1000;

type ReleaseManifest = {
  version?: string; gitCommit?: string; buildId?: string; environment?: string; productionAccess?: string;
  exe?: { file?: string; sha256?: string; bytes?: number };
};

function versionNumber() { return String(DEVELOPER_GRID_VERSION).replace(/-dev$/, ""); }
function manifestPath(version: string) { return path.join(PUBLIC_RELEASE_ROOT, `ARTIFACT_MANIFEST_v${version}.json`); }
function readManifest(version: string): ReleaseManifest | null {
  try { return JSON.parse(fs.readFileSync(manifestPath(version), "utf8")) as ReleaseManifest; } catch { return null; }
}

export async function evaluateDeveloperGridWindowsE2E(deviceToken: string) {
  const version = versionNumber();
  const [device, foundation] = await Promise.all([getWindowsBridgeDeviceAttestation(deviceToken), getDeveloperGridFoundation()]);
  const manifest = readManifest(version);
  const reported = device.client;
  const probe = device.clientProbe || null;
  const expectedHead = String(foundation.sourceProvenance.head || "");
  const expectedBuildId = String(foundation.releaseRuntimeProvenance.buildId || "");
  const lastSeenMs = device.lastSeenAt ? Date.parse(device.lastSeenAt) : NaN;
  const heartbeatFresh = Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs >= 0 && Date.now() - lastSeenMs <= MAX_HEARTBEAT_AGE_MS;
  const checks = [
    { id:"manifest", label:"Publikus DEV manifest elérhető", required:true, pass:Boolean(manifest) },
    { id:"manifest-env", label:"Manifest DEV · PROD DENY", required:true, pass:manifest?.environment==="DEV" && manifest?.productionAccess==="DENY" },
    { id:"manifest-head", label:"Manifest current source HEAD", required:true, pass:Boolean(manifest && expectedHead && manifest.gitCommit===expectedHead) },
    { id:"manifest-build", label:"Manifest current BUILD_ID", required:true, pass:Boolean(manifest && expectedBuildId && manifest.buildId===expectedBuildId) },
    { id:"heartbeat", label:"Fizikai Windows heartbeat friss", required:true, pass:heartbeatFresh },
    { id:"client", label:reported ? "Windows artifact identity jelentve" : `Windows artifact identity jelentve${probe?.failureCodes?.length ? ` · ${probe.failureCodes.slice(0,2).join("+")}` : ""}`, required:true, pass:Boolean(reported) },
    { id:"version", label:`Windows kliens v${version}`, required:true, pass:Boolean(reported && reported.version===version) },
    { id:"sha256", label:"Windows EXE SHA-256 egyezik", required:true, pass:Boolean(reported && manifest?.exe?.sha256 && reported.executableSha256===manifest.exe.sha256) },
    { id:"bytes", label:"Windows EXE bájtméret egyezik", required:true, pass:Boolean(reported && Number(manifest?.exe?.bytes)>0 && reported.executableBytes===Number(manifest?.exe?.bytes)) },
  ];
  const ready = checks.every((check)=>!check.required || check.pass);
  const mismatch = Boolean(reported && manifest?.exe?.sha256 && reported.executableSha256!==manifest.exe.sha256);
  const state = ready ? "VERIFIED" : mismatch ? "ARTIFACT_MISMATCH" : reported ? "WAITING_FOR_FRESH_HEARTBEAT_OR_CURRENT_RELEASE" : "WAITING_FOR_WINDOWS_CLIENT";
  return {
    schemaVersion:1,
    ready,
    state,
    environment:"DEV" as const,
    productionAccess:"DENY" as const,
    expected:{ version, gitCommit:expectedHead || null, buildId:expectedBuildId || null, exeFile:manifest?.exe?.file || null, exeSha256:manifest?.exe?.sha256 || null, exeBytes:Number(manifest?.exe?.bytes)||null },
    reported: reported ? { version:reported.version, exeSha256:reported.executableSha256, exeBytes:reported.executableBytes, reportedAt:reported.reportedAt } : null,
    device:{ deviceId:device.deviceId, agentId:device.agentId, deviceLabel:device.deviceLabel, lastSeenAt:device.lastSeenAt },
    attestationProbe: probe,
    checks,
    evaluatedAt:new Date().toISOString(),
  };
}
