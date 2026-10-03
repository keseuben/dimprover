#!/usr/bin/env node
import tls from "node:tls";
import dns from "node:dns/promises";

const hosts = ["auth.dev.dimpro.hu", "login.dev.dimpro.hu", "drive.dev.dimpro.hu"];
const results = [];
let failed = 0;

function sanNames(subjectAltName = "") {
  return subjectAltName
    .split(/,\s*/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("DNS:"))
    .map((entry) => entry.slice(4).toLowerCase());
}

function connectTls(host) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: true, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate();
      const sans = sanNames(cert.subjectaltname || "");
      const authorized = socket.authorized === true;
      const sanCovered = sans.includes(host.toLowerCase());
      resolve({
        ok: authorized && sanCovered,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher()?.name || null,
        subject: cert.subject || null,
        issuer: cert.issuer || null,
        validTo: cert.valid_to || null,
        sanCovered,
        sans,
        authorizationError: socket.authorizationError || null,
      });
      socket.end();
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve({ ok: false, error: "TLS_TIMEOUT" });
    });
    socket.once("error", (error) => {
      resolve({
        ok: false,
        error: error.code || "TLS_ERROR",
        message: error.message,
      });
    });
  });
}

for (const host of hosts) {
  let addresses = [];
  try {
    addresses = (await dns.resolve4(host)).sort();
  } catch (error) {
    failed += 1;
    results.push({ host, ok: false, addresses, error: error instanceof Error ? error.message : String(error) });
    continue;
  }
  const tlsResult = await connectTls(host);
  if (!tlsResult.ok) failed += 1;
  results.push({ host, addresses, ...tlsResult });
}

console.log(JSON.stringify({
  ok: failed === 0,
  environment: "DEV",
  productionAccess: "DENY",
  expectedAddress: "213.160.68.32",
  failed,
  results,
}, null, 2));
process.exitCode = failed === 0 ? 0 : 2;
