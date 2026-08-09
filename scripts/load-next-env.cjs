const fs = require("node:fs");
const { loadEnvConfig } = require("@next/env");

const projectDir = process.env.NEXT_ENV_PROJECT_DIR || process.cwd();
loadEnvConfig(projectDir);

// A DIMPRO Identity Core érzékeny runtime secretjei nem kerülnek a repóba vagy
// .env.local fájlba. A root-only secretfájlból kizárólag az engedélyezett kulcsokat
// töltjük be, és egy explicit process env mindig elsőbbséget élvez (candidate E2E).
const identitySecretFile = process.env.DIMPRO_IDENTITY_CORE_SECRET_FILE
  || "/root/.dimpro-secrets/dimpro-identity-core.env";
const allowedIdentityKeys = new Set([
  "DIMPRO_IDENTITY_CORE_ENABLED",
  "DIMPRO_SEND_CODE_PEPPER",
  "DIMPRO_ACCESS_HASH_PEPPER",
  "DIMPRO_SEND_SESSION_SECRET",
  "DIMPRO_SEND_SESSION_TTL_SECONDS",
]);

if (fs.existsSync(identitySecretFile)) {
  const source = fs.readFileSync(identitySecretFile, "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!allowedIdentityKeys.has(key) || process.env[key] !== undefined) continue;
    process.env[key] = line.slice(separator + 1).trim();
  }
}
