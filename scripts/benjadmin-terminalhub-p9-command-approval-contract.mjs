import fs from "node:fs";
import path from "node:path";
const root=process.cwd(); const read=(f)=>fs.readFileSync(path.join(root,f),"utf8");
const approval=read("app/lib/dev-center/control-plane-approvals.ts");
const control=read("app/lib/dev-center/control-plane-commands.ts");
const requestRoute=read("app/api/dev/engine/control-plane/approvals/route.ts");
const approveRoute=read("app/api/dev/engine/control-plane/approvals/[approvalId]/approve/route.ts");
const commandRoute=read("app/api/dev/engine/control-plane/commands/route.ts");
const ui=read("components/admin/developer-console/TerminalManagedCommands.tsx");
const css=read("components/admin/developer-console/DeveloperConsole.module.css");
const sql=read("supabase/migrations/20260815083000_benjadmin_terminalhub_p9_command_approval.sql");
const rollback=read("supabase/rollback/20260815083000_benjadmin_terminalhub_p9_command_approval_rollback.sql");
let pass=0,fail=0; function check(n,o){if(o){pass++;console.log(`PASS ${n}`)}else{fail++;console.error(`FAIL ${n}`)}}

check("DEV destruktív műveletek pontosan migration/restart/deploy",approval.includes('DEV_DESTRUCTIVE_OPERATIONS: DevDestructiveOperation[] = ["migration", "restart", "deploy"]')&&control.includes('DEV_DESTRUCTIVE_OPERATIONS: ControlOperation[] = ["migration", "restart", "deploy"]'));
check("Build/test nincs destruktív approval listában",!approval.match(/DEV_DESTRUCTIVE_OPERATIONS[^\n]*build/)&&!approval.match(/DEV_DESTRUCTIVE_OPERATIONS[^\n]*test/));
check("DEV approval TTL 300s",approval.includes('DEV_APPROVAL_TTL_SECONDS = 300'));
check("Approval type scope külön DEV típus",["dev_migration","dev_restart","dev_deploy"].every(x=>approval.includes(x)&&sql.includes(`'${x}'`)));
check("Approval request BENJADMIN session-ID validáció",approval.includes("devSessionIdLike")&&approval.includes("^dev-session-"));
check("Approval request READY session validáció",approval.includes('await assertDevEngineOperation(sessionId, operation as DevEngineOperation)'));
check("Approval request exact command-operation scope",approval.includes('COMMAND_OPERATION')&&approval.includes('CONTROL_DEV_APPROVAL_COMMAND_MISMATCH'));
check("Approval metadata command+session+singleUse",approval.includes('metadata: { commandName, sessionId, origin: "TERMINAL_HUB_MANAGED_COMMAND", singleUse: true }'));
check("Approval explicit confirmation",["APPROVE_DEV_MIGRATION","APPROVE_DEV_RESTART","APPROVE_DEV_DEPLOY"].every(x=>approval.includes(x))&&approval.includes('CONTROL_DEV_APPROVAL_CONFIRMATION_REQUIRED'));
check("Approval approve előtt session revalidáció",approval.split('export async function approveDevDestructiveApproval')[1].includes('await assertDevEngineOperation(sessionId, operation as DevEngineOperation)'));
check("Approval approve conditional pending",approval.includes('.eq("id", approvalId).eq("status", "pending")'));
check("Lejárt pending expired-re vált",approval.includes('status: "expired"')&&approval.includes('CONTROL_DEV_APPROVAL_EXPIRED'));
check("Request API admin mutation auth",requestRoute.includes('getDevCenterMutationSubject(request.headers,false)')&&requestRoute.includes('requestDevDestructiveApproval'));
check("Approve API admin mutation auth",approveRoute.includes('getDevCenterMutationSubject(request.headers,false)')&&approveRoute.includes('approveDevDestructiveApproval'));
check("Command API továbbra is admin mutation auth",commandRoute.includes('getDevCenterMutationSubject(request.headers, false)'));

check("Control parser DEV approval nélkül 409",control.includes('CONTROL_DEV_APPROVAL_REQUIRED')&&control.includes('targetEnvironment === "DEV" && DEV_DESTRUCTIVE_OPERATIONS.includes(operation) && !approvalId'));
check("Control approval DB scope target+operation",control.includes('row.target_environment')&&control.includes('row.operation'));
check("Control DEV approval type egyeztetés",control.includes('CONTROL_DEV_APPROVAL_TYPE_MISMATCH'));
check("Control DEV metadata command/session scope",control.includes('CONTROL_DEV_APPROVAL_SCOPE_MISMATCH')&&control.includes('metadata.commandName')&&control.includes('metadata.sessionId'));
check("Approvalos queue RPC-t használ",control.includes('client.rpc("dev_center_queue_approved_command"'));
check("Nem-approvalos command továbbra is közvetlen queue",control.includes('approval_id: null')&&control.includes('requires_approval: false'));
check("RPC replay unique violation mapping",control.includes('23505')&&control.includes('CONTROL_APPROVAL_ALREADY_USED'));
check("RPC schema-missing fail closed",control.includes('PGRST202')&&control.includes('CONTROL_SCHEMA_NOT_READY'));
check("Raw shell tiltás változatlan",["command","shell","script","argv","executable"].every(x=>control.includes(`"${x}"`))&&control.includes('CONTROL_RAW_COMMAND_FORBIDDEN'));

check("SQL approval type constraint kiterjesztett",sql.includes('dev_center_approvals_approval_type_check')&&["dev_restart","dev_migration","dev_deploy"].every(x=>sql.includes(x)));
check("SQL egy approval egy command unique index",sql.includes('create unique index if not exists dev_center_command_queue_approval_once_idx')&&sql.includes('where approval_id is not null'));
check("SQL atomikus function security definer",sql.includes('dev_center_queue_approved_command')&&sql.includes('security definer')&&sql.includes('for update'));
check("SQL approval approved státuszt követel",sql.includes("v_approval.status <> 'approved'"));
check("SQL expiry ellenőrzés",sql.includes("APPROVAL_EXPIRED")&&sql.includes('v_approval.expires_at <= now()'));
check("SQL target/operation scope",sql.includes('v_approval.target_environment <> p_target_environment')&&sql.includes('v_approval.operation <> p_operation'));
check("SQL metadata command/session scope",sql.includes("metadata->>'commandName'")&&sql.includes("metadata->>'sessionId'"));
check("SQL insert+consume egy functionben",sql.indexOf('insert into public.dev_center_command_queue') < sql.indexOf("set status='consumed'"));
check("SQL public/anon/auth execute revoke",['from public','from anon','from authenticated'].every(x=>sql.includes(x))&&sql.includes('to service_role'));
check("SQL schema marker",sql.includes("benjadmin-terminal-security-approval")&&sql.includes("'0.1.0'"));
check("Rollback function/index/marker",rollback.includes('drop function if exists public.dev_center_queue_approved_command')&&rollback.includes('drop index if exists public.dev_center_command_queue_approval_once_idx')&&rollback.includes("benjadmin-terminal-security-approval"));
check("Rollback DEV approval sor esetén fail closed",rollback.includes('P9_DEV_APPROVAL_ROWS_EXIST'));

check("UI restart destructiveApproval",ui.includes('restart_service')&&ui.includes('destructiveApproval: true'));
check("UI első lépés approval request",ui.includes('/api/dev/engine/control-plane/approvals')&&ui.includes('command még NINCS queue-zva'));
check("UI második lépés approve",ui.includes('/approve')&&ui.includes('JÓVÁHAGYOM ÉS QUEUE-ZOM'));
check("UI approve után approvalId-val queue",ui.includes('queueAction(action, pending.id)'));
check("UI pending scope sessionhez kötött",ui.includes('pendingApproval.sessionId !== sessionId')&&ui.includes('Az approval scope megváltozott'));
check("UI lejáratot ellenőriz",ui.includes('approvalRemaining')&&ui.includes('Az approval lejárt'));
check("UI rawCommand false",ui.includes('rawCommand: false'));
check("UI nem futtat processzt",!/(child_process|spawn\(|execFile\(|exec\()/.test(ui));
check("UI P9 approval CSS minimum 12px",css.includes('destructive Managed Command approval')&&!/terminalDestructiveApproval[^}]*font-size:\s*(?:[0-9]|1[01])px/.test(css));

console.log(`SUMMARY ${pass}/${pass+fail} PASS`); if(fail)process.exit(1);
