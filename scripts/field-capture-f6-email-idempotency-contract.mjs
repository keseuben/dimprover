import assert from "node:assert/strict";
import fs from "node:fs";
const migration=fs.readFileSync("supabase/migrations/20260821173500_field_capture_report_email_delivery_f6_v010.sql","utf8");
const delivery=fs.readFileSync("app/lib/field-capture/reportEmailDelivery.ts","utf8");
const route=fs.readFileSync("app/api/field-capture/sessions/[sessionId]/report-email/route.ts","utf8");
const panel=fs.readFileSync("components/field-capture/FieldCaptureReportPanel.tsx","utf8");
const types=fs.readFileSync("app/lib/field-capture/types.ts","utf8");
const finalize=fs.readFileSync("app/api/field-capture/sessions/[sessionId]/finalize/route.ts","utf8");
const checks=[
 ["P9.1 version 0.4.5-dev",/FIELD_CAPTURE_VERSION = "0\.4\.5-dev"/.test(types)],
 ["server-only delivery table exists",migration.includes("field_capture_report_email_deliveries")&&migration.includes("enable row level security")],
 ["anon/authenticated access revoked",migration.includes("revoke all on table public.field_capture_report_email_deliveries from anon")&&migration.includes("from authenticated")],
 ["unique session + idempotency hash",migration.includes("unique (session_id, idempotency_key_hash)")],
 ["raw idempotency key is not persisted",migration.includes("idempotency_key_hash")&&!migration.match(/\bidempotency_key\s+text/)],
 ["recipient address and message body are not persisted",!migration.includes("recipient_email")&&!migration.includes("message_body")],
 ["delivery state is sending sent failed",migration.includes("'SENDING','SENT','FAILED'")],
 ["retry count is bounded to five",migration.includes("attempt_count between 1 and 5")&&delivery.includes("MAX_ATTEMPTS = 5")],
 ["idempotency key is required by route",route.includes('request.headers.get("idempotency-key")')&&route.includes("normalizeFieldCaptureReportEmailIdempotencyKey")],
 ["payload hash includes PDF digest",fs.readFileSync("app/lib/field-capture/reportEmail.ts","utf8").includes("pdfSha256")],
 ["sent duplicate skips SMTP",route.includes('claim.state === "SENT"')&&route.includes("REPORT_EMAIL_DUPLICATE_SKIPPED")],
 ["failed delivery can be claimed for retry",delivery.includes('.eq("status", "FAILED")')&&delivery.includes("attempt_count: existing.attempt_count + 1")],
 ["in-flight duplicate is blocked",delivery.includes("FIELD_CAPTURE_REPORT_EMAIL_DELIVERY_IN_PROGRESS")],
 ["SMTP accepted but state uncertain is fail-closed",route.includes("smtpAccepted ? \"REPORT_EMAIL_DELIVERY_STATE_UNCERTAIN\"")&&route.includes("claimed && !smtpAccepted")],
 ["client reuses unchanged idempotency key and PDF",panel.includes("emailRetryRef")&&panel.includes("retry.fingerprint !== fingerprint")&&panel.includes('"Idempotency-Key": retry.idempotencyKey')],
 ["changed payload produces a new key",panel.includes("currentEmailFingerprint")&&panel.includes("createEmailIdempotencyKey()")],
 ["UI waits for delivery readiness",panel.includes("deliveryReady")&&panel.includes("idempotencia aktív")],
 ["finalize still does not send email",!finalize.includes("report-email")&&!finalize.includes("sendPreparedFieldCaptureReportEmail")],
];
let n=0; for(const [name,ok] of checks){assert.ok(ok,name); console.log(`PASS ${++n}: ${name}`)}
console.log(`FIELD_CAPTURE_F6_EMAIL_IDEMPOTENCY_CONTRACT ${n}/${checks.length} PASS`);
