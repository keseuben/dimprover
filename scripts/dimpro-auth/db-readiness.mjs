#!/usr/bin/env node
import pg from "pg";
import { assertDevAuthDatabaseUrl, requireDevAuthEnvironment, strictDevAuthPgSsl } from "./strict-dev-db.mjs";

requireDevAuthEnvironment();
const connectionString=process.env.DIMPRO_AUTH_MIGRATION_DATABASE_URL?.trim() || process.env.DIMPRO_AUTH_DATABASE_URL?.trim();
if(!connectionString) throw new Error("DIMPRO_AUTH_MIGRATION_DATABASE_URL vagy DIMPRO_AUTH_DATABASE_URL szükséges.");
assertDevAuthDatabaseUrl(connectionString,["dimpro_auth_migrator_dev","dimpro_auth_app_dev"]);
const ssl=await strictDevAuthPgSsl();
const client=new pg.Client({connectionString,ssl,application_name:"dimpro-auth-readiness"});
await client.connect();
try{
  const env=await client.query(`SELECT current_database() AS db,current_user AS usr,current_setting('server_version') AS version,current_setting('password_encryption') AS password_encryption`);
  const ext=await client.query(`SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pgcrypto') AS pgcrypto`);
  const schema=await client.query(`SELECT to_regclass('public.auth_schema_migrations') IS NOT NULL AS migration_table`);
  let migrations=0;
  if(schema.rows[0]?.migration_table){const r=await client.query('SELECT count(*)::int AS count FROM auth_schema_migrations');migrations=Number(r.rows[0]?.count||0);}
  const roles=await client.query(`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname IN ('dimpro_auth_app_dev','dimpro_auth_migrator_dev') ORDER BY rolname`);
  console.log(JSON.stringify({ok:true,database:env.rows[0]?.db,user:env.rows[0]?.usr,serverVersion:env.rows[0]?.version,passwordEncryption:env.rows[0]?.password_encryption,pgcrypto:Boolean(ext.rows[0]?.pgcrypto),migrationTable:Boolean(schema.rows[0]?.migration_table),migrationCount:migrations,roles:roles.rows.map(r=>({name:r.rolname,superuser:r.rolsuper,createDb:r.rolcreatedb,createRole:r.rolcreaterole}))},null,2));
}finally{await client.end();}
