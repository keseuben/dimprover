#!/usr/bin/env node
import pg from "pg";
import { assertDevAuthDatabaseUrl, requireDevAuthEnvironment, strictDevAuthPgSsl } from "./strict-dev-db.mjs";

function arg(name){const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||"").trim():"";}
const email=arg("email").toLowerCase();
const displayName=arg("display-name") || null;
const level=(arg("level")||"SIMPLE").toUpperCase();
const grantDrive=process.argv.includes("--grant-drive");
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Érvényes --email szükséges.");
if(level!=="SIMPLE") throw new Error("AUTH V0.1 bootstrap kizárólag SIMPLE biztonsági szintet enged; magasabb szinthez erős hitelesítés szükséges.");
if(process.env.DIMPRO_AUTH_BOOTSTRAP_CONFIRM!=="BOOTSTRAP_DEV_AUTH_USER") throw new Error("DIMPRO_AUTH_BOOTSTRAP_CONFIRM=BOOTSTRAP_DEV_AUTH_USER szükséges.");
requireDevAuthEnvironment();
const connectionString=process.env.DIMPRO_AUTH_MIGRATION_DATABASE_URL?.trim();
if(!connectionString) throw new Error("DIMPRO_AUTH_MIGRATION_DATABASE_URL szükséges.");
assertDevAuthDatabaseUrl(connectionString,"dimpro_auth_migrator_dev");
const ssl=await strictDevAuthPgSsl();
const client=new pg.Client({connectionString,ssl,application_name:"dimpro-auth-bootstrap"});
await client.connect();
try{
  await client.query("BEGIN");
  const userResult=await client.query(`INSERT INTO auth_users(email_original,email_normalized,display_name,status,security_level,login_enabled)
    VALUES($1,$2,$3,'ACTIVE',$4,true)
    ON CONFLICT(email_normalized) DO UPDATE SET email_original=EXCLUDED.email_original,display_name=COALESCE(EXCLUDED.display_name,auth_users.display_name),status='ACTIVE',security_level=EXCLUDED.security_level,login_enabled=true,updated_at=now()
    RETURNING id,email_normalized,security_level`,[email,email,displayName,level]);
  const user=userResult.rows[0];
  if(grantDrive){
    await client.query(`INSERT INTO auth_access_grants(user_id,role_id,product_id)
      SELECT $1,r.id,p.id FROM auth_roles r CROSS JOIN auth_products p
      WHERE r.code='DRIVE_USER' AND p.code='DRIVE'
        AND NOT EXISTS(SELECT 1 FROM auth_access_grants g WHERE g.user_id=$1 AND g.role_id=r.id AND g.product_id=p.id AND g.revoked_at IS NULL)`,[user.id]);
  }
  await client.query(`INSERT INTO auth_audit_events(event_type,user_id,method,result,correlation_id,metadata)
    VALUES('ADMIN_USER_BOOTSTRAP',$1,'DEV_BOOTSTRAP_SCRIPT','SUCCESS',gen_random_uuid()::text,$2::jsonb)`,
    [user.id,JSON.stringify({securityLevel:level,driveAccessRequested:grantDrive})]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ok:true,user,driveAccessGranted:grantDrive},null,2));
}catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{await client.end();}
