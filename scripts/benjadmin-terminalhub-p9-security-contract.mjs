import fs from "node:fs";
import path from "node:path";
import { scanSensitiveText } from "../app/lib/dev-center/ai-worker/secret-scanner.ts";

const root=process.cwd(); const read=(f)=>fs.readFileSync(path.join(root,f),"utf8");
const types=read("app/lib/dev-center/terminal-hub/session-types.ts");
const registry=read("app/lib/dev-center/terminal-hub/session-registry.ts");
const inputRoute=read("app/api/dev/terminal-hub/sessions/[sessionId]/input/route.ts");
const sanitizedRoute=read("app/api/dev/terminal-hub/sessions/[sessionId]/sanitized/route.ts");
const auditRoute=read("app/api/dev/terminal-hub/sessions/[sessionId]/audit-view/route.ts");
const visibilityRoute=read("app/api/dev/terminal-hub/sessions/[sessionId]/ai-visibility/route.ts");
const securityAudit=read("app/lib/dev-center/terminal-hub/security-audit.ts");
const dataPolicy=read("app/lib/dev-center/terminal-hub/data-policy.ts");
const scanner=read("app/lib/dev-center/ai-worker/secret-scanner.ts");
const vault=read("app/lib/dev-center/terminal-hub/secret-vault.ts");
const vaultRoute=read("app/api/dev/terminal-hub/secret-vault/readiness/route.ts");
const coreUi=read("components/admin/developer-console/TerminalCorePanel.tsx");
const vaultUi=read("components/admin/developer-console/SecretVaultPanel.tsx");
const hub=read("components/admin/developer-console/TerminalHubWorkspace.tsx");
const css=read("components/admin/developer-console/DeveloperConsole.module.css");
let pass=0,fail=0; function check(name,ok){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}`)}}

check("Session AI visibility típus",types.includes('TerminalAiVisibility = "FILTERED" | "BLOCKED"'));
check("Session summary AI visibility",types.includes('aiVisibility: TerminalAiVisibility'));
check("Új session alapból FILTERED",registry.includes('aiVisibility: "FILTERED"'));
check("Server-side visibility setter",registry.includes('setTerminalSessionAiVisibility'));
check("Visibility csak FILTERED/BLOCKED",registry.includes('["FILTERED", "BLOCKED"].includes(mode)'));
check("AI visibility endpoint admin-only",visibilityRoute.includes('isDevCenterAuthorized(request.headers,false)'));
check("Visibility váltás auditált",visibilityRoute.includes('TERMINAL_AI_VISIBILITY_CHANGED'));
check("Visibility audit a state váltás előtt",visibilityRoute.indexOf('await recordTerminalSecurityEvent') < visibilityRoute.indexOf('return NextResponse.json({ok:true,session:setTerminalSessionAiVisibility'));
check("Sanitized endpoint BLOCKED esetén 403",sanitizedRoute.includes('TERMINAL_AI_VISIBILITY_BLOCKED')&&sanitizedRoute.includes('status:403'));
check("Audit-view BLOCKED mellett is meta nézet",!auditRoute.includes('TERMINAL_AI_VISIBILITY_BLOCKED')&&auditRoute.includes('toTerminalAuditChunks'));

check("Private input request flag",types.includes('private?: boolean'));
check("Private input admin-only",inputRoute.includes('isDevCenterAuthorized(request.headers, false)'));
check("Private input audit action",inputRoute.includes('TERMINAL_PRIVATE_INPUT_USED'));
check("Private input audit tartalom nélkül",inputRoute.includes('byteLength: Buffer.byteLength')&&!inputRoute.includes('metadata: { data'));
check("Private input audit a write előtt",inputRoute.indexOf('recordTerminalSecurityEvent') < inputRoute.indexOf('writeTerminalSession(OWNER'));
check("XTerm input privát módban blokkolt",coreUi.includes('if (privateInputRef.current) return'));
check("XTerm disableStdin privát módban",coreUi.includes('terminalRef.current.options.disableStdin = privateInput'));
check("Privát input type=password",coreUi.includes('type="password"'));
check("Privát mező autocomplete off",coreUi.includes('autoComplete="off"'));
check("Privát érték küldés után törlődik",coreUi.includes('setPrivateValue("")'));
check("Privát input nem browser storage",!coreUi.includes('localStorage.setItem("private')&&!coreUi.includes('sessionStorage.setItem("private'));
check("Privát input UI nem írja ki a secretet",coreUi.includes('TARTALOM NEM NAPLÓZVA')&&!coreUi.includes('terminalRef.current?.write(value'));
check("AI hide gomb server endpointot használ",coreUi.includes('/ai-visibility')&&coreUi.includes('AI: {session?.aiVisibility'));

check("Security audit service role backend",securityAudit.includes('SUPABASE_SERVICE_ROLE_KEY'));
check("Security audit summary sanitizált",securityAudit.includes('sanitizeTerminalText(input.summary)'));
check("Security audit metadata secret-scan",securityAudit.includes('scanSensitiveText(metadataText)'));
check("Security audit metadata fail-safe redacted",securityAudit.includes('{ redacted: true, findingCount: metadataFindings.length }'));
check("Redaction finding audit action",securityAudit.includes('TERMINAL_SECRET_REDACTED'));
check("Redaction audit per session+sequence dedupe",securityAudit.includes('`${sessionId}:${chunk.sequence}`')&&securityAudit.includes('findingAudit.has(key)'));
check("Sanitized route finding audit fail-closed",sanitizedRoute.includes('await auditTerminalRedactionFindings(sessionId,chunks)'));

const samples=[
  ['connection','postgresql://demo:supersecretvalue@db.example.com/app'],
  ['github','ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'],
  ['openai','sk-abcdefghijklmnopqrstuvwxyz1234567890'],
  ['aws','AKIAABCDEFGHIJKLMNOP'],
  ['jwt','eyJabcdefghijk.abcdefghijk.abcdefghijk'],
];
for(const [name,value] of samples) check(`Secret scanner ${name}`,scanSensitiveText(value).length>0);
check("Secret scanner normál parancs nem false positive",scanSensitiveText('npm run build -- --mode development').length===0);
check("Data policy teljes redaction konstans",dataPolicy.includes('const REDACTED = "[REDACTED_SENSITIVE_TERMINAL_DATA]"'));
check("Data policy finding esetén teljes chunk redaction",dataPolicy.includes('sanitized: REDACTED')&&dataPolicy.includes('replacement: REDACTED'));
check("Data policy audit sanitizált inputból készül",dataPolicy.includes('return sanitizeTerminalText(raw).replace'));
check("P9 scanner új minták forrásban",['Credentialed connection string','GitHub token','OpenAI-style API key','AWS access key','JWT token'].every(x=>scanner.includes(x)));

check("Vault skeleton flag ON esetén SKELETON_ONLY",vault.includes('enabled?"SKELETON_ONLY":"DISABLED"'));
check("Vault storage nincs",vault.includes('storageConfigured:false'));
check("Vault raw secret AI false",vault.includes('rawSecretReadableByAi:false'));
check("Vault browser storage tiltott",vault.includes('browserSecretStorageAllowed:false'));
check("Vault AI referencia-only",vault.includes('referenceOnlyAiPolicy:true'));
check("Vault GET/PUT nincs",vault.includes('putApiAvailable:false')&&vault.includes('getApiAvailable:false'));
check("Vault readiness admin-only GET",vaultRoute.includes('isDevCenterAuthorized(request.headers,false)')&&vaultRoute.includes('export async function GET'));
check("Vaultnak nincs secret get/put route",!fs.existsSync(path.join(root,'app/api/dev/terminal-hub/secret-vault/get'))&&!fs.existsSync(path.join(root,'app/api/dev/terminal-hub/secret-vault/put')));
check("Vault UI raw secret soha",vaultUi.includes('Raw secret AI: SOHA'));
check("Vault UI GET/PUT nincs",vaultUi.includes('GET/PUT API: NINCS'));
check("Vault UI Terminal Hubba kötve",hub.includes('import SecretVaultPanel')&&hub.includes('<SecretVaultPanel />'));
check("P9 footer fail-closed",hub.includes('P9 foundation:')&&hub.includes('Secret Vault storage továbbra is fail-closed'));
const p9css=css.slice(css.indexOf('BENJADMIN Terminal Hub P9'));
check("P9 CSS blokk létezik",p9css.length>100);
check("P9 tipográfia minimum 12px",!/font-size:\s*(?:[0-9]|1[01])px/.test(p9css));
check("Secret Vault forrásban nincs raw secret storage",!vault.includes('localStorage')&&!vault.includes('sessionStorage')&&!vault.includes('secretValue'));

console.log(`SUMMARY ${pass}/${pass+fail} PASS`); if(fail)process.exit(1);
