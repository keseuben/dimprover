#!/usr/bin/env node
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

function arg(name){const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||"").trim():"";}
const email=arg("email").toLowerCase();
const action=arg("action").toLowerCase();
const allowed=new Set(["enable","disable","grant-drive","revoke-drive","revoke-sessions"]);
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Érvényes --email szükséges.");
if(!allowed.has(action))throw new Error(`Érvényes --action szükséges: ${[...allowed].join(", ")}.`);
if((process.env.DIMPRO_AUTH_ENVIRONMENT||"").trim().toUpperCase()!=="DEV")throw new Error("A manage-user script kizárólag DIMPRO_AUTH_ENVIRONMENT=DEV módban futtatható.");
if(process.env.DIMPRO_AUTH_ADMIN_CONFIRM!=="APPLY_DEV_AUTH_ADMIN_CHANGE")throw new Error("DIMPRO_AUTH_ADMIN_CONFIRM=APPLY_DEV_AUTH_ADMIN_CHANGE szükséges.");
const connectionString=process.env.DIMPRO_AUTH_DATABASE_URL?.trim();
if(!connectionString)throw new Error("DIMPRO_AUTH_DATABASE_URL szükséges.");
const url=new URL(connectionString);
if(url.hostname!=="db.dimpro.hu"||decodeURIComponent(url.pathname.replace(/^\//,""))!=="dimpro_auth_dev"||decodeURIComponent(url.username)!=="dimpro_auth_app_dev")throw new Error("Csak a dimpro_auth_dev / dimpro_auth_app_dev runtime kapcsolat engedélyezett.");
const sslMode=(process.env.DIMPRO_AUTH_DB_SSL_MODE||"verify-full").trim().toLowerCase();
let ssl=false;
if(sslMode!=="disable"){
  if(sslMode==="require")ssl={rejectUnauthorized:false};
  else{
    const caFile=process.env.DIMPRO_AUTH_DB_CA_FILE?.trim();
    const caInline=process.env.DIMPRO_AUTH_DB_CA_PEM?.trim();
    const ca=caInline?caInline.replace(/\\n/g,"\n"):caFile?await readFile(caFile,"utf8"):"";
    if(!ca)throw new Error("DIMPRO_AUTH_DB_CA_FILE vagy DIMPRO_AUTH_DB_CA_PEM szükséges verify-full módban.");
    ssl={rejectUnauthorized:true,ca};
  }
}
const client=new pg.Client({connectionString,ssl,application_name:"dimpro-auth-dev-user-admin"});
const correlationId=randomUUID();
await client.connect();
try{
  await client.query("BEGIN");
  const userResult=await client.query(`SELECT id,email_normalized,status,login_enabled,security_level FROM auth_users WHERE email_normalized=$1 LIMIT 1 FOR UPDATE`,[email]);
  const user=userResult.rows[0];
  if(!user)throw new Error("A felhasználó nem található a DIMPRO AUTH DEV adatbázisban.");
  let affected=0;
  if(action==="enable"){
    const r=await client.query(`UPDATE auth_users SET status='ACTIVE',login_enabled=true,updated_at=now() WHERE id=$1`,[user.id]);affected=r.rowCount||0;
  }else if(action==="disable"){
    const r=await client.query(`UPDATE auth_users SET status='DISABLED',login_enabled=false,updated_at=now() WHERE id=$1`,[user.id]);affected=r.rowCount||0;
  }else if(action==="grant-drive"){
    const r=await client.query(`INSERT INTO auth_access_grants(user_id,role_id,product_id)
      SELECT $1,r.id,p.id FROM auth_roles r CROSS JOIN auth_products p
       WHERE r.code='DRIVE_USER' AND p.code='DRIVE' AND p.status='ACTIVE'
         AND NOT EXISTS(SELECT 1 FROM auth_access_grants g WHERE g.user_id=$1 AND g.role_id=r.id AND g.product_id=p.id AND g.revoked_at IS NULL)
      RETURNING id`,[user.id]);affected=r.rowCount||0;
  }else if(action==="revoke-drive"){
    const r=await client.query(`UPDATE auth_access_grants g SET revoked_at=now()
      FROM auth_roles r,auth_products p
      WHERE g.user_id=$1 AND g.role_id=r.id AND g.product_id=p.id AND r.code='DRIVE_USER' AND p.code='DRIVE' AND g.revoked_at IS NULL`,[user.id]);affected=r.rowCount||0;
  }else if(action==="revoke-sessions"){
    const a=await client.query(`UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),revoke_reason=COALESCE(revoke_reason,'DEV_ADMIN_REVOKE') WHERE user_id=$1 AND revoked_at IS NULL`,[user.id]);
    const b=await client.query(`UPDATE auth_app_sessions SET revoked_at=COALESCE(revoked_at,now()),revoke_reason=COALESCE(revoke_reason,'DEV_ADMIN_REVOKE') WHERE user_id=$1 AND revoked_at IS NULL`,[user.id]);
    affected=(a.rowCount||0)+(b.rowCount||0);
  }
  await client.query(`INSERT INTO auth_audit_events(event_type,user_id,method,result,correlation_id,metadata)
    VALUES('ADMIN_USER_CHANGE',$1,'DEV_ADMIN_SCRIPT','SUCCESS',$2,$3::jsonb)`,[user.id,correlationId,JSON.stringify({action,affected})]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ok:true,environment:"DEV",email,userId:user.id,action,affected,correlationId},null,2));
}catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{await client.end();}
