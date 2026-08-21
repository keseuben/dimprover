import assert from "node:assert/strict";
import { DimproIdentityError } from "../app/lib/identity-core/types";
import { resolveFieldCaptureReportRecipients, validateFieldCaptureReportPdf } from "../app/lib/field-capture/reportEmail";

const checks: string[] = [];
function pass(name: string, condition: boolean) { assert.ok(condition, name); checks.push(name); console.log(`PASS ${checks.length}: ${name}`); }

function context(mode: "locked_default" | "approved_list" | "free_entry", maxRecipients = 3) {
  return {
    user: { id: "00000000-0000-4000-8000-000000000001", publicCode: "USER", fullName: "Teszt Elek", email: "sender@example.com", organizationName: "DIMPRO" },
    entitlement: { recipientMode: mode, maxRecipients },
    defaultRecipient: { id: "r1", name: "Alap", email: "default@example.com", organizationName: null, label: null, locked: true },
    recipients: [
      { id: "r1", name: "Alap", email: "default@example.com", organizationName: null, label: null, locked: true },
      { id: "r2", name: "Második", email: "approved@example.com", organizationName: null, label: null, locked: false },
    ],
  };
}

pass("locked_default falls back to default recipient", resolveFieldCaptureReportRecipients([], context("locked_default"))[0] === "default@example.com");
let lockedRejected = false;
try { resolveFieldCaptureReportRecipients(["other@example.com"], context("locked_default")); } catch (error) { lockedRejected = error instanceof DimproIdentityError && error.code === "FIELD_CAPTURE_REPORT_EMAIL_RECIPIENT_LOCKED"; }
pass("locked_default rejects changed recipient", lockedRejected);
pass("approved_list accepts known recipient", resolveFieldCaptureReportRecipients(["APPROVED@example.com"], context("approved_list"))[0] === "approved@example.com");
let unknownRejected = false;
try { resolveFieldCaptureReportRecipients(["unknown@example.com"], context("approved_list")); } catch (error) { unknownRejected = error instanceof DimproIdentityError && error.code === "FIELD_CAPTURE_REPORT_EMAIL_RECIPIENT_NOT_APPROVED"; }
pass("approved_list rejects unknown recipient", unknownRejected);
pass("free_entry accepts normalized external address", resolveFieldCaptureReportRecipients([" External@Example.COM "], context("free_entry"))[0] === "external@example.com");
let limitRejected = false;
try { resolveFieldCaptureReportRecipients(["a@example.com","b@example.com"], context("free_entry", 1)); } catch (error) { limitRejected = error instanceof DimproIdentityError && error.code === "FIELD_CAPTURE_REPORT_EMAIL_RECIPIENT_LIMIT"; }
pass("recipient limit is enforced", limitRejected);
const valid = new TextEncoder().encode("%PDF-1.7\nDIMPRO F5 test");
pass("valid PDF signature is accepted", validateFieldCaptureReportPdf(valid, "Terepi összesítő.pdf").endsWith(".pdf"));
let invalidRejected = false;
try { validateFieldCaptureReportPdf(new TextEncoder().encode("NOTPDF"), "x.pdf"); } catch (error) { invalidRejected = error instanceof DimproIdentityError && error.code === "FIELD_CAPTURE_REPORT_EMAIL_PDF_INVALID"; }
pass("invalid PDF signature is rejected", invalidRejected);
let oversizeRejected = false;
try { validateFieldCaptureReportPdf(new Uint8Array(15 * 1024 * 1024 + 1), "huge.pdf"); } catch (error) { oversizeRejected = error instanceof DimproIdentityError && error.status === 413; }
pass("oversized PDF is rejected", oversizeRejected);
console.log(`FIELD_CAPTURE_F5_EMAIL_SERVICE_E2E ${checks.length}/${checks.length} PASS`);
