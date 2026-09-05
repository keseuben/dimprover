#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import https from "node:https";

const DEFAULT_BASE_URL = "https://mcp.dimprover.hu/build-gateway/v1";
const DEFAULT_TOKEN_FILE = "/srv/dimpro-dev/secrets/benjadmin/build-gateway-token";

function fail(code, message, status = 500) {
  const error = new Error(message);
  Object.assign(error, { code, status });
  throw error;
}
function resolveConfig() {
  const baseUrl = new URL(process.env.DIMPRO_BUILD_GATEWAY_BASE_URL?.trim() || DEFAULT_BASE_URL);
  if (baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && ["127.0.0.1","localhost","::1"].includes(baseUrl.hostname))) {
    fail("BUILD_GATEWAY_URL_INSECURE", "A Build Transport Gateway csak HTTPS-en, illetve lokális contract fixture-ben HTTP-n érhető el.");
  }
  const tokenFile = process.env.DIMPRO_BUILD_GATEWAY_TOKEN_FILE?.trim() || DEFAULT_TOKEN_FILE;
  let token = "";
  try { token = fs.readFileSync(tokenFile, "utf8").trim(); } catch {}
  if (token && (token.length < 32 || token.length > 256)) fail("BUILD_GATEWAY_TOKEN_INVALID", "A Build Transport Gateway token konfiguráció érvénytelen.");
  return { baseUrl, token };
}
function requestTransport(url) { return url.protocol === "https:" ? https : http; }
function requestJson(method, pathname, options = {}) {
  const { baseUrl, token } = resolveConfig();
  const url = new URL(`${baseUrl.pathname.replace(/\/$/, "")}/${String(pathname || "").replace(/^\//, "")}`, baseUrl);
  const headers = { accept:"application/json", ...(token ? { authorization:`Bearer ${token}` } : {}), ...(options.headers || {}) };
  const bodyFile = options.bodyFile || null;
  if (bodyFile) {
    const stat = fs.statSync(bodyFile);
    if (!stat.isFile() || stat.size < 1) fail("BUILD_GATEWAY_UPLOAD_INVALID", "A gateway feltöltési fájl érvénytelen.");
    headers["content-type"] = "application/octet-stream";
    headers["content-length"] = String(stat.size);
  }
  return new Promise((resolve, reject) => {
    const req = requestTransport(url).request(url, { method, headers }, (res) => {
      const chunks = [];
      let bytes = 0;
      res.on("data", (chunk) => { bytes += chunk.length; if (bytes <= 2*1024*1024) chunks.push(chunk); });
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        let payload = null;
        try { payload = raw ? JSON.parse(raw) : null; } catch {}
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300 || payload?.ok !== true) {
          const code = String(payload?.code || `BUILD_GATEWAY_HTTP_${res.statusCode || 0}`).slice(0,160);
          const message = String(payload?.error || `Build gateway HTTP ${res.statusCode || 0}.`).slice(0,500);
          return reject(Object.assign(new Error(message), { code, status:res.statusCode || 502 }));
        }
        resolve(payload);
      });
    });
    req.setTimeout(Number(process.env.DIMPRO_BUILD_GATEWAY_HTTP_TIMEOUT_MS || 120_000), () => req.destroy(Object.assign(new Error("Build gateway request timeout."), { code:"BUILD_GATEWAY_TIMEOUT" })));
    req.on("error", reject);
    if (bodyFile) fs.createReadStream(bodyFile).on("error", reject).pipe(req); else req.end();
  });
}

export async function getBuildGatewayNodes() {
  return requestJson("GET", "nodes");
}
export async function dispatchBuildGatewayRun(input) {
  const query = new URLSearchParams({
    runId:String(input.runId), taskId:String(input.taskId), sessionId:String(input.sessionId), workerCode:String(input.workerCode),
    sourceCommit:String(input.sourceCommit), sourceBranch:String(input.sourceBranch), runnerId:String(input.runnerId),
  });
  return requestJson("POST", `dispatch?${query.toString()}`, { bodyFile:input.bundleFile });
}
export async function getBuildGatewayRun(runId) {
  return requestJson("GET", `runs/${encodeURIComponent(String(runId))}`);
}
