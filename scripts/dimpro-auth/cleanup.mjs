#!/usr/bin/env node
import pg from "pg";
import { assertDevAuthDatabaseUrl, requireDevAuthEnvironment, strictDevAuthPgSsl } from "./strict-dev-db.mjs";

const apply=process.argv.includes("--apply");
requireDevAuthEnvironment();
const connectionString=process.env.DIMPRO_AUTH_MIGRATION_DATABASE_URL?.trim();
if(!connectionString) throw new Error("DIMPRO_AUTH_MIGRATION_DATABASE_URL szükséges.");
if(apply && process.env.DIMPRO_AUTH_CLEANUP_CONFIRM!=="APPLY_DEV_AUTH_CLEANUP") {
  throw new Error("DIMPRO_AUTH_CLEANUP_CONFIRM=APPLY_DEV_AUTH_CLEANUP szükséges az --apply futtatáshoz.");
}
assertDevAuthDatabaseUrl(connectionString,"dimpro_auth_migrator_dev");
const ssl=await strictDevAuthPgSsl();
const client=new pg.Client({connectionString,ssl,application_name:"dimpro-auth-cleanup"});
await client.connect();
const counts={};
try{
  const plans=[
    ["emailChallenges",`DELETE FROM auth_email_challenges WHERE created_at < now()-interval '7 days' RETURNING 1`],
    ["authorizationRequests",`DELETE FROM auth_authorization_requests WHERE created_at < now()-interval '1 day' RETURNING 1`],
    ["authorizationCodes",`DELETE FROM auth_authorization_codes WHERE created_at < now()-interval '1 day' RETURNING 1`],
    ["revokedAppSessions",`DELETE FROM auth_app_sessions WHERE revoked_at IS NOT NULL AND revoked_at < now()-interval '30 days' RETURNING 1`],
    ["expiredAppSessions",`DELETE FROM auth_app_sessions WHERE absolute_expires_at < now()-interval '30 days' RETURNING 1`],
    ["revokedAuthSessions",`DELETE FROM auth_sessions WHERE revoked_at IS NOT NULL AND revoked_at < now()-interval '30 days' RETURNING 1`],
    ["expiredAuthSessions",`DELETE FROM auth_sessions WHERE absolute_expires_at < now()-interval '30 days' RETURNING 1`],
    ["auditEvents",`DELETE FROM auth_audit_events WHERE created_at < now()-interval '365 days' RETURNING 1`],
  ];
  await client.query("BEGIN");
  for(const [name,sql] of plans){const result=await client.query(sql);counts[name]=result.rowCount||0;}
  if(apply) await client.query("COMMIT"); else await client.query("ROLLBACK");
  console.log(JSON.stringify({ok:true,mode:apply?"apply":"dry-run",retention:{otpDays:7,ssoDays:1,sessionDaysAfterEnd:30,auditDays:365},counts},null,2));
}catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{await client.end();}
