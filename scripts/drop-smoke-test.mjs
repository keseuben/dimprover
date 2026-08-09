#!/usr/bin/env node

import http from "node:http";
import https from "node:https";

const baseUrl = new URL(process.env.DROP_SMOKE_BASE_URL || "https://drop.dimpro.hu");
const hostHeader = process.env.DROP_SMOKE_HOST_HEADER?.trim() || baseUrl.host;
const expectedVersion = process.env.DROP_SMOKE_VERSION || "DROP 0.2.0";
const expectedReleaseGateEnabled = (process.env.DROP_SMOKE_RELEASE_GATE_ENABLED || "false").trim().toLowerCase() === "true";

function request(pathname) {
  return new Promise((resolve, reject) => {
    const transport = baseUrl.protocol === "https:" ? https : http;
    const request = transport.request(
      {
        protocol: baseUrl.protocol,
        hostname: baseUrl.hostname,
        port: baseUrl.port || undefined,
        path: pathname,
        method: "GET",
        headers: {
          Host: hostHeader,
          Accept: "text/html,application/json",
          "User-Agent": "DIMPRO-Drop-Smoke/0.2.0",
        },
        rejectUnauthorized: process.env.DROP_SMOKE_INSECURE_TLS !== "true",
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode || 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.on("error", reject);
    request.setTimeout(20_000, () => request.destroy(new Error(`Timeout: ${pathname}`)));
    request.end();
  });
}

const tests = [
  {
    name: "Nyilvános Drop kezdőlap",
    path: "/",
    verify: (result) => result.status === 200 && result.body.includes("DIMPRO") && result.body.includes("KépDrop"),
  },
  {
    name: "Csomagkód és PIN shell",
    path: "/open",
    verify: (result) => result.status === 200 && result.body.includes("Csomag megnyitása"),
  },
  {
    name: "Hibás feltöltési token védett elutasítása",
    path: "/u/smoke-upload-token",
    verify: (result) => result.status === 200 && result.body.includes("A hivatkozás nem használható"),
  },
  {
    name: "Hibás megtekintési token védett elutasítása",
    path: "/p/smoke-preview-token",
    verify: (result) => result.status === 200 && result.body.includes("A hivatkozás nem használható"),
  },
  {
    name: "Hibás letöltési token védett elutasítása",
    path: "/d/smoke-download-token",
    verify: (result) => result.status === 200 && result.body.includes("A hivatkozás nem használható"),
  },
  {
    name: "Hibás riporttoken védett elutasítása",
    path: "/report/smoke-report-token",
    verify: (result) => result.status === 200 && result.body.includes("A hivatkozás nem használható"),
  },
  {
    name: "Drop health API",
    path: "/api/drop/health",
    verify: (result) => {
      if (result.status !== 200) return false;
      const payload = JSON.parse(result.body);
      return payload.ok === true && payload.version === expectedVersion && payload.uploadEnabled === false && payload.safety?.secretsExposed === false;
    },
  },
  {
    name: "Feature flag API",
    path: "/api/drop/features",
    verify: (result) => {
      if (result.status !== 200) return false;
      const payload = JSON.parse(result.body);
      return payload.ok === true && payload.releaseGateEnabled === expectedReleaseGateEnabled && payload.uploadEnabled === false;
    },
  },
  {
    name: "Drop admin API tiltása a nyilvános hoston",
    path: "/api/drop/admin/packages",
    verify: (result) => result.status === 404 && result.body.includes("nem érhető el"),
  },
  {
    name: "Belső adminoldal tiltása a Drop hoston",
    path: "/admin/dev",
    verify: (result) => result.status === 404 && result.body.includes("nem érhető el"),
  },
  {
    name: "Belső licenc API tiltása a Drop hoston",
    path: "/api/license/admin",
    verify: (result) => result.status === 404 && result.body.includes("nem érhető el"),
  },
];

let failed = 0;
for (const test of tests) {
  try {
    const result = await request(test.path);
    const passed = Boolean(test.verify(result));
    if (!passed) failed += 1;
    console.log(`${passed ? "PASS" : "FAIL"} | ${test.name} | HTTP ${result.status} | ${test.path}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL | ${test.name} | ${error instanceof Error ? error.message : String(error)} | ${test.path}`);
  }
}

console.log(`\nDIMPRO Drop smoke: ${tests.length - failed}/${tests.length} sikeres.`);
if (failed) process.exit(1);
