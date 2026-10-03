#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const templatePath = path.join(root, "ops/nginx/dimpro-auth/dev-vhosts.conf.template");

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} kötelező a DEV nginx renderhez.`);
  return value;
}

function safeTlsPath(name) {
  const value = required(name);
  if (!/^\/(?:etc|srv)\/[A-Za-z0-9._/+\-]+$/.test(value) || value.includes("..")) {
    throw new Error(`${name} csak abszolút /etc vagy /srv alatti tanúsítványútvonal lehet.`);
  }
  return value;
}

function safeLoopbackUpstream() {
  const raw = required("DIMPRO_AUTH_DEV_UPSTREAM");
  let url;
  try { url = new URL(raw); } catch { throw new Error("DIMPRO_AUTH_DEV_UPSTREAM nem érvényes URL."); }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("DIMPRO_AUTH_DEV_UPSTREAM kizárólag loopback HTTP upstream lehet.");
  }
  const port = Number(url.port);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("DIMPRO_AUTH_DEV_UPSTREAM formátum: http://127.0.0.1:<1024-65535>.");
  }
  return `http://${url.hostname}:${port}`;
}

const certificate = safeTlsPath("DIMPRO_AUTH_DEV_TLS_CERTIFICATE");
const certificateKey = safeTlsPath("DIMPRO_AUTH_DEV_TLS_CERTIFICATE_KEY");
const upstream = safeLoopbackUpstream();
let rendered = fs.readFileSync(templatePath, "utf8")
  .replaceAll("__DIMPRO_AUTH_DEV_TLS_CERTIFICATE__", certificate)
  .replaceAll("__DIMPRO_AUTH_DEV_TLS_CERTIFICATE_KEY__", certificateKey)
  .replaceAll("__DIMPRO_AUTH_DEV_UPSTREAM__", upstream);

if (/__[A-Z0-9_]+__/.test(rendered)) throw new Error("A DEV nginx template-ben feloldatlan placeholder maradt.");
process.stdout.write(rendered);
