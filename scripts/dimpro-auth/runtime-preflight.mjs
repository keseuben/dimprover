#!/usr/bin/env node
import fs from "node:fs";
import { X509Certificate, createHash } from "node:crypto";

function requireValue(name){const v=process.env[name]?.trim();if(!v)throw new Error(`${name} kötelező.`);return v;}
function safeUrl(name){const raw=requireValue(name);let url;try{url=new URL(raw);}catch{throw new Error(`${name} nem érvényes URL.`)}return {raw,url};}
function secret(name){const v=requireValue(name);if(v.length<32||v.includes('<')||v.includes('>'))throw new Error(`${name} nem elég erős.`);return v;}

const environment=requireValue("DIMPRO_AUTH_ENVIRONMENT").toUpperCase();
if(!["DEV","PROD"].includes(environment))throw new Error("DIMPRO_AUTH_ENVIRONMENT csak DEV vagy PROD lehet.");
const expectedDatabase=environment==="DEV"?"dimpro_auth_dev":"dimpro_auth_prod";
const expectedRuntimeUser=environment==="DEV"?"dimpro_auth_app_dev":"dimpro_auth_app_prod";
const expectedMigratorUser=environment==="DEV"?"dimpro_auth_migrator_dev":"dimpro_auth_migrator_prod";

const runtime=safeUrl("DIMPRO_AUTH_DATABASE_URL").url;
const migrator=safeUrl("DIMPRO_AUTH_MIGRATION_DATABASE_URL").url;
for(const [kind,url,user] of [["runtime",runtime,expectedRuntimeUser],["migrator",migrator,expectedMigratorUser]]){
  const db=decodeURIComponent(url.pathname.replace(/^\//,""));
  if(!/^postgres(ql)?:$/.test(url.protocol))throw new Error(`${kind}: csak PostgreSQL URL engedélyezett.`);
  if(url.hostname!=="db.dimpro.hu")throw new Error(`${kind}: kötelező host db.dimpro.hu.`);
  if((url.port||"5432")!=="5432")throw new Error(`${kind}: kötelező port 5432.`);
  if(db!==expectedDatabase)throw new Error(`${kind}: várt adatbázis ${expectedDatabase}, kapott ${db||"(üres)"}.`);
  if(decodeURIComponent(url.username)!==user)throw new Error(`${kind}: várt role ${user}.`);
  if(!url.password)throw new Error(`${kind}: adatbázis-jelszó hiányzik.`);
  for(const name of ["sslmode","sslcert","sslkey","sslrootcert"]){
    if(url.searchParams.has(name))throw new Error(`${kind}: a DB URL nem tartalmazhat ${name} paramétert.`);
  }
}
if(runtime.href===migrator.href)throw new Error("A runtime és migrator connection string nem lehet azonos.");

const otp=secret("DIMPRO_AUTH_OTP_PEPPER");
const session=secret("DIMPRO_AUTH_SESSION_PEPPER");
const audit=secret("DIMPRO_AUTH_AUDIT_PEPPER");
const sso=secret("DIMPRO_AUTH_SSO_STATE_SECRET");
const invitation=secret("DIMPRO_AUTH_INVITATION_PEPPER");
if(new Set([otp,session,audit,sso,invitation]).size!==5)throw new Error("Az OTP/session/audit/SSO/invitation titkoknak egymástól függetlennek kell lenniük.");

const sslMode=(process.env.DIMPRO_AUTH_DB_SSL_MODE||"").trim().toLowerCase();
if(sslMode!=="verify-full")throw new Error("DIMPRO_AUTH_DB_SSL_MODE=verify-full kötelező az aktiválási preflightban.");
const caFile=requireValue("DIMPRO_AUTH_DB_CA_FILE");
const st=fs.statSync(caFile);
if(!st.isFile())throw new Error("A PostgreSQL CA útvonal nem fájl.");
if((st.mode&0o002)!==0)throw new Error("A PostgreSQL CA fájl world-writable; aktiválás tiltva.");
const caPem=fs.readFileSync(caFile,"utf8");
const cert=new X509Certificate(caPem);
if(!cert.ca)throw new Error("A megadott PostgreSQL trust anchor nem CA tanúsítvány.");
if(Date.parse(cert.validTo)<=Date.now())throw new Error("A PostgreSQL CA tanúsítvány lejárt.");

if(environment==="DEV"){
  if(requireValue("DIMPRO_AUTH_DEV_ORIGIN")!=="https://auth.dev.dimpro.hu")throw new Error("DEV auth origin eltér az authoritative címtől.");
  if(requireValue("DIMPRO_AUTH_DEV_DRIVE_REDIRECT_URI")!=="https://drive.dev.dimpro.hu/api/dimpro-auth/callback")throw new Error("DEV Drive redirect URI eltér az allowlist címtől.");
}

console.log(JSON.stringify({
  ok:true,
  environment,
  databaseHost:runtime.hostname,
  databaseName:expectedDatabase,
  runtimeRole:expectedRuntimeUser,
  migratorRole:expectedMigratorUser,
  sslMode,
  ca:{subject:cert.subject,issuer:cert.issuer,validTo:cert.validTo,sha256:createHash("sha256").update(cert.raw).digest("hex")},
  secrets:{otpDistinct:true,sessionDistinct:true,auditDistinct:true,ssoDistinct:true,invitationDistinct:true},
  productionAccess:environment==="DEV"?"DENY":"SEPARATE_PROD_AUTHORITY_REQUIRED",
},null,2));
