#!/usr/bin/env node
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const mail = read("app/lib/field-capture/reportEmail.ts");
const route = read("app/api/field-capture/sessions/[sessionId]/report-email/route.ts");
const repo = read("app/lib/field-capture/serverRepository.ts");
const panel = read("components/field-capture/FieldCaptureReportPanel.tsx");
const shell = read("components/field-capture/FieldCaptureShell.tsx");
const session = read("app/lib/field-capture/captureSessionService.ts");
const finalizeRoute = read("app/api/field-capture/sessions/[sessionId]/finalize/route.ts");
const version = read("app/lib/field-capture/types.ts");

const checks = [];
function check(name, condition) {
  if (!condition) {
    console.error(`FAIL ${checks.length + 1}: ${name}`);
    process.exit(2);
  }
  checks.push(name);
  console.log(`PASS ${checks.length}: ${name}`);
}

check("P9.1 increments client version to 0.4.5-dev", version.includes('FIELD_CAPTURE_VERSION = "0.4.5-dev"'));
check("central DIMPRO Drop profile is reused", mail.includes('REPORT_MAIL_PROFILE = "drop"') && mail.includes("sendDimproMail"));
check("SMTP credentials never appear in F5 client panel", !/SMTP_(HOST|USER|PASS)|smtpHost|smtpPort|password/i.test(panel));
check("report-email route requires Field Capture bearer authorization", route.includes("authorizeFieldCaptureRequest(request)"));
check("report-email route verifies session ownership", route.includes("assertFieldCaptureSessionOwner"));
check("recipient policy supports locked approved and free modes", ["locked_default","approved_list","free_entry"].every((mode) => mail.includes(mode)));
check("recipient count is server-side limited", mail.includes("maxRecipients") && mail.includes("FIELD_CAPTURE_REPORT_EMAIL_RECIPIENT_LIMIT"));
check("PDF attachment is limited to 15 MB and validated by PDF signature", mail.includes("15 * 1024 * 1024") && mail.includes('header !== "%PDF-"'));
check("sent retry and failed e-mail attempts are audit events", route.includes("REPORT_EMAIL_SENT") && route.includes("REPORT_EMAIL_RETRY_SENT") && route.includes("REPORT_EMAIL_FAILED") && repo.includes("recordFieldCaptureEvent"));
check("audit payload does not persist message body or SMTP secrets", !route.includes("payload: { message:") && !route.includes("smtpHost") && !route.includes("smtpPass"));
check("client reuses existing F4 PDF engine", panel.includes("createFieldCaptureSummaryPdf") && panel.includes("downloadFieldCaptureSummaryPdf"));
check("e-mail is explicit manual action", panel.includes("Nem automatikus") && panel.includes("PDF elkészítése és e-mail küldése") && panel.includes("data-terep-report-email-send"));
check("finalize route does not send e-mail", !/reportEmail|sendFieldCaptureReportEmail|sendDimproMail/i.test(finalizeRoute));
check("server session id is persisted after sync", session.includes("bindFieldCaptureServerSession") && shell.includes("bindFieldCaptureServerSession(session, result.serverSessionId)"));
check("raw Send token is only passed in memory to report panel", shell.includes("sessionToken={identity?.sessionToken}") && !session.includes("sessionToken"));
check("F5 retains the whole-project readiness disclaimer in e-mail", mail.includes("nem igazolja a teljes projekt készültségi fokát") && panel.includes("FIELD_CAPTURE_REPORT_DISCLAIMER"));

console.log(`FIELD_CAPTURE_F5_EMAIL_CONTRACT ${checks.length}/${checks.length} PASS`);
