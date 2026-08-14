import fs from "node:fs";
const source = fs.readFileSync("scripts/benjadmin-b32-source-db-preflight.mjs", "utf8");
const checks = [];
function check(name, ok) { checks.push(Boolean(ok)); console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) throw new Error(name); }
check("API/direct Supabase project-ref támogatás megmarad", source.includes('.endsWith(".supabase.co")') && source.includes('parts[0] === "db"'));
check("Pooler Supabase host támogatott", source.includes('.endsWith(".pooler.supabase.com")'));
check("Pooler project-ref a postgres.<ref> userből jön", source.includes('username.startsWith("postgres.")') && source.includes('username.slice("postgres.".length)'));
check("URL username decode történik", source.includes("decodeURIComponent(parsed.username"));
check("DEV/PROD shared target gate megmarad", source.includes("SOURCE_DB_SHARED_WITH_PROD"));
check("DB target mismatch gate megmarad", source.includes("SOURCE_DB_TARGET_MISMATCH"));
console.log(`SUMMARY ${checks.filter(Boolean).length}/${checks.length} PASS`);
