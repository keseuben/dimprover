#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const args=new Set(process.argv.slice(2));
const mode=args.has("--apply-migrations")?"apply":args.has("--preflight")?"preflight":"plan";
const emailIndex=process.argv.indexOf("--bootstrap-email");
const bootstrapEmail=emailIndex>=0?String(process.argv[emailIndex+1]||"").trim().toLowerCase():"";

function fail(message){throw new Error(message);}
function run(label,script,scriptArgs=[]){
  const result=spawnSync(process.execPath,[path.join(root,script),...scriptArgs],{
    cwd:root,
    env:process.env,
    encoding:"utf8",
    stdio:["ignore","pipe","pipe"],
  });
  const stdout=String(result.stdout||"").trim();
  const stderr=String(result.stderr||"").trim();
  if(result.status!==0){
    const error=new Error(`${label} FAILED${stderr?`: ${stderr.split("\n").slice(-4).join(" | ")}`:""}`);
    error.code=`DIMPRO_AUTH_ACTIVATION_${label.replace(/[^A-Z0-9]+/gi,"_").toUpperCase()}_FAILED`;
    throw error;
  }
  console.log(`PASS ${label}${stdout?`\n${stdout}`:""}`);
  return stdout;
}
function git(...gitArgs){
  const result=spawnSync("git",gitArgs,{cwd:root,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  if(result.status!==0)fail(`Git ellenőrzés sikertelen: ${String(result.stderr||"").trim()}`);
  return String(result.stdout||"").trim();
}

const branch=git("branch","--show-current");
const head=git("rev-parse","HEAD");
const dirty=git("status","--porcelain");
if(dirty)fail("Az AUTH worktree nem tiszta; aktiválás előtt commit/push szükséges.");
if(branch!=="worker/arminai/dimpro-auth-v01-own-postgres-20261002")fail(`Váratlan AUTH branch: ${branch}`);

console.log(JSON.stringify({
  ok:true,
  mode,
  environment:"DEV",
  productionAccess:"DENY",
  branch,
  head,
  bootstrapEmail:bootstrapEmail||null,
},null,2));

run("contract-v010","scripts/dimpro-auth/auth-v010-contract.mjs");
run("contract-v020","scripts/dimpro-auth/auth-v020-sso-contract.mjs");
run("contract-v021","scripts/dimpro-auth/auth-v021-security-contract.mjs");
run("contract-v030","scripts/dimpro-auth/auth-v030-invitation-contract.mjs");
run("contract-v031","scripts/dimpro-auth/auth-v031-project-scope-contract.mjs");

if(mode==="plan"){
  console.log(JSON.stringify({
    readyFor:"PRE_ACTIVATION",
    next:[
      "DB pg_hba + dimpro_auth_dev roles/database bootstrap on db.dimpro.hu",
      "authoritative DIMPRO Internal PostgreSQL CA install",
      "DEV runtime/migrator URLs + independent OTP/session/audit/SSO/invitation secrets",
      "node scripts/dimpro-auth/activate-dev.mjs --preflight",
      "backup confirmation",
      "node scripts/dimpro-auth/activate-dev.mjs --apply-migrations",
      "optional first pilot user bootstrap",
      "browser/email E2E",
    ],
    productionAccess:"DENY",
  },null,2));
  process.exit(0);
}

if((process.env.DIMPRO_AUTH_ENVIRONMENT||"").trim().toUpperCase()!=="DEV")fail("DIMPRO_AUTH_ENVIRONMENT=DEV kötelező.");
run("runtime-preflight","scripts/dimpro-auth/runtime-preflight.mjs");
run("db-readiness-before","scripts/dimpro-auth/db-readiness.mjs");
run("migration-dry-run","scripts/dimpro-auth/migrate.mjs");

if(mode==="preflight"){
  console.log(JSON.stringify({ok:true,stage:"DEV_PREFLIGHT_COMPLETE",applyPerformed:false,productionAccess:"DENY"},null,2));
  process.exit(0);
}

if(process.env.DIMPRO_AUTH_ACTIVATION_CONFIRM!=="APPLY_DEV_AUTH_ACTIVATION")fail("DIMPRO_AUTH_ACTIVATION_CONFIRM=APPLY_DEV_AUTH_ACTIVATION szükséges.");
if(process.env.DIMPRO_AUTH_MIGRATION_CONFIRM!=="APPLY_DEV_AUTH_MIGRATIONS")fail("DIMPRO_AUTH_MIGRATION_CONFIRM=APPLY_DEV_AUTH_MIGRATIONS szükséges.");
if(process.env.DIMPRO_AUTH_BACKUP_CONFIRMED!=="YES")fail("DIMPRO_AUTH_BACKUP_CONFIRMED=YES szükséges a migráció előtt.");
run("migration-apply","scripts/dimpro-auth/migrate.mjs",["--apply"]);
const after=run("db-readiness-after","scripts/dimpro-auth/db-readiness.mjs");
let readiness=null;
try{readiness=JSON.parse(after.slice(after.indexOf("{")));}catch{}
if(!readiness||Number(readiness.migrationCount)!==6)fail(`Migráció utáni migrationCount nem 6: ${readiness?.migrationCount??"ismeretlen"}`);

if(bootstrapEmail){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bootstrapEmail))fail("A --bootstrap-email értéke nem érvényes e-mail.");
  if(process.env.DIMPRO_AUTH_BOOTSTRAP_CONFIRM!=="BOOTSTRAP_DEV_AUTH_USER")fail("DIMPRO_AUTH_BOOTSTRAP_CONFIRM=BOOTSTRAP_DEV_AUTH_USER szükséges a pilot userhez.");
  run("bootstrap-user","scripts/dimpro-auth/bootstrap-user.mjs",["--email",bootstrapEmail,"--grant-drive"]);
}

console.log(JSON.stringify({
  ok:true,
  stage:"DEV_DATABASE_ACTIVATED",
  migrationCount:6,
  bootstrapUserCreated:Boolean(bootstrapEmail),
  productionAccess:"DENY",
  next:"Deploy AUTH DEV runtime secrets/config, then execute physical email + browser E2E.",
},null,2));
