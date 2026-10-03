import { readFile } from "node:fs/promises";

export function requireDevAuthEnvironment() {
  const environment=(process.env.DIMPRO_AUTH_ENVIRONMENT||"").trim().toUpperCase();
  if(environment!=="DEV") throw new Error("DIMPRO_AUTH_ENVIRONMENT=DEV kötelező ehhez a DEV művelethez.");
  return environment;
}

export function assertDevAuthDatabaseUrl(raw, allowedUsers) {
  if(!raw) throw new Error("A DIMPRO AUTH DEV PostgreSQL connection string hiányzik.");
  let url;
  try { url=new URL(raw); } catch { throw new Error("A DIMPRO AUTH DEV PostgreSQL connection string érvénytelen."); }
  if(!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("Csak PostgreSQL connection string engedélyezett.");
  if(url.hostname!=="db.dimpro.hu") throw new Error("A DEV AUTH DB host kizárólag db.dimpro.hu lehet.");
  if(decodeURIComponent(url.pathname.replace(/^\//,""))!=="dimpro_auth_dev") throw new Error("A DEV AUTH adatbázis kizárólag dimpro_auth_dev lehet.");
  const users=Array.isArray(allowedUsers)?allowedUsers:[allowedUsers];
  const user=decodeURIComponent(url.username);
  if(!users.includes(user)) throw new Error(`Nem engedélyezett DEV AUTH DB role: ${user||"(üres)"}.`);
  if(!url.password) throw new Error("A DEV AUTH DB connection string nem tartalmaz jelszót.");
  return { url, user };
}

export async function strictDevAuthPgSsl() {
  const mode=(process.env.DIMPRO_AUTH_DB_SSL_MODE||"verify-full").trim().toLowerCase();
  if(mode!=="verify-full") throw new Error("DIMPRO_AUTH_DB_SSL_MODE=verify-full kötelező minden DEV AUTH DB kapcsolathoz.");
  const caInline=process.env.DIMPRO_AUTH_DB_CA_PEM?.trim();
  const caFile=process.env.DIMPRO_AUTH_DB_CA_FILE?.trim();
  const ca=caInline?caInline.replace(/\\n/g,"\n"):caFile?await readFile(caFile,"utf8"):"";
  if(!ca) throw new Error("DIMPRO_AUTH_DB_CA_FILE vagy DIMPRO_AUTH_DB_CA_PEM szükséges verify-full módban.");
  return { rejectUnauthorized:true, ca };
}
