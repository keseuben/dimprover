import { createHash } from "node:crypto";
import { sendDimproMail } from "@/app/lib/license/mail-profiles";
import { getDropFeatureFlags } from "../dropFeatureFlags";
import { createDropS3DownloadUrl, deleteDropS3Object, openDropS3Object, putDropS3Object } from "../storage/dropS3Storage";
import { renderDropFinalReport } from "./dropFinalReportRenderer";
import {
  ensureDropFinalReportRecord,
  getLatestDropFinalReport,
  isDropReportFresh,
  listDropFinalReportEmailRecipients,
  listSentDropFinalReportEmails,
  loadDropFinalReportBundle,
  updateDropFinalReportRecord,
  updateDropPackageFinalReportStatus,
  writeDropFinalReportEmailLog,
  writeDropReportEvent,
  type DropFinalReportBundle,
  type DropReportRecord,
} from "./dropReportRepository";

const FINAL_REPORT_READY_STATUSES = new Set(["upload_closed", "expiring", "reporting", "expired", "deleting"]);

export class DropReportError extends Error {
  code: string;
  status: number;
  retryable: boolean;

  constructor(message: string, code: string, status = 500, retryable = true) {
    super(message);
    this.name = "DropReportError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Ismeretlen DROP riport hiba.").slice(0, 2000);
}

function clampInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
}

function reportStorageKey(packageId: string, reportId: string) {
  return `reports/${packageId}/final/${reportId}.pdf`;
}

function ensureReportGenerationAllowed(bundle: DropFinalReportBundle) {
  const flags = getDropFeatureFlags();
  if (!flags.pdfReportEnabled) {
    throw new DropReportError("A DROP automatikus PDF-riport funkció nincs aktiválva.", "DROP_PDF_REPORT_DISABLED", 503, false);
  }
  if (!FINAL_REPORT_READY_STATUSES.has(bundle.packageRow.status)) {
    throw new DropReportError(
      "Végleges riport csak lezárt, lejáró vagy törlésre váró csomagból készíthető.",
      "DROP_REPORT_PACKAGE_NOT_FINAL",
      409,
      false,
    );
  }
  const unsafe = bundle.files.filter((file) => !file.deleted_at && !(
    file.security_status === "clean"
    && file.virus_scan_status === "clean"
    && file.upload_status === "ready"
    && file.processing_status === "ready"
  ) && !(file.security_status === "infected" || file.virus_scan_status === "infected"));
  if (unsafe.length) {
    throw new DropReportError(
      `${unsafe.length} fájl biztonsági feldolgozása még nem fejeződött be, ezért a végleges riport nem készíthető el.`,
      "DROP_REPORT_FILES_NOT_READY",
      409,
      true,
    );
  }
}

async function loadReportBuffer(report: DropReportRecord) {
  if (!report.storage_key) throw new DropReportError("A DROP végleges riport tárhelyhivatkozása hiányzik.", "DROP_REPORT_STORAGE_KEY_MISSING", 500);
  const opened = await openDropS3Object({ storageKey: report.storage_key });
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of opened.body as unknown as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > 40 * 1024 * 1024) {
      throw new DropReportError("A DROP végleges riport váratlanul nagy.", "DROP_REPORT_TOO_LARGE", 500, false);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function buildFinalReportMessage(input: {
  bundle: DropFinalReportBundle;
  recipientName: string;
  fileName: string;
  downloadUrl: string | null;
  attached: boolean;
}) {
  const packageRow = input.bundle.packageRow;
  const subject = `DIMPRO Drop - végleges riport: ${packageRow.title}`;
  const text = [
    `Tisztelt ${input.recipientName || "Címzett"}!`,
    "",
    "Elkészült a DIMPRO Drop csomag végleges PDF-riportja.",
    "",
    `Csomag: ${packageRow.title}`,
    ...(packageRow.project_name_snapshot ? [`Projekt: ${packageRow.project_name_snapshot}`] : []),
    `Csomagkód: ${packageRow.public_code}`,
    `Fájlok: ${input.bundle.files.length} db`,
    `Megjegyzések: ${input.bundle.comments.length} db`,
    `Lejárat: ${formatDate(packageRow.expires_at)}`,
    "",
    input.attached
      ? `A ${input.fileName} dokumentumot csatoltuk ehhez az üzenethez.`
      : `A riport biztonságos, időkorlátos letöltése: ${input.downloadUrl}`,
    "",
    "A csomag ideiglenes tárhelyének törlése csak a riport sikeres elkészítése és kézbesítése után történhet meg.",
    "",
    "Üdvözlettel:",
    "DIMPRO Drop",
  ].join("\n");
  const deliveryHtml = input.attached
    ? `<p>A <strong>${escapeHtml(input.fileName)}</strong> dokumentumot csatoltuk ehhez az üzenethez.</p>`
    : `<p><a href="${escapeHtml(input.downloadUrl)}" style="display:inline-block;background:#0f766e;color:white;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:10px">Végleges riport letöltése</a></p><p style="font-size:12px;color:#64748b">A letöltési link időkorlátos.</p>`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:720px;margin:auto">
      <div style="border:1px solid #99f6e4;background:#f0fdfa;border-radius:18px;padding:24px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0f766e">DIMPRO Drop végleges riport</p>
        <h1 style="margin:0 0 16px;font-size:25px">${escapeHtml(packageRow.title)}</h1>
        <p>Tisztelt ${escapeHtml(input.recipientName || "Címzett")}!</p>
        <p>Elkészült a Drop csomag végleges PDF-riportja.</p>
        <div style="margin:18px 0;border:1px solid #ccfbf1;background:white;border-radius:14px;padding:16px">
          ${packageRow.project_name_snapshot ? `<p style="margin:0 0 7px"><strong>Projekt:</strong> ${escapeHtml(packageRow.project_name_snapshot)}</p>` : ""}
          <p style="margin:0 0 7px"><strong>Csomagkód:</strong> ${escapeHtml(packageRow.public_code)}</p>
          <p style="margin:0 0 7px"><strong>Fájlok:</strong> ${input.bundle.files.length} db</p>
          <p style="margin:0 0 7px"><strong>Megjegyzések:</strong> ${input.bundle.comments.length} db</p>
          <p style="margin:0"><strong>Lejárat:</strong> ${escapeHtml(formatDate(packageRow.expires_at))}</p>
        </div>
        ${deliveryHtml}
        <p style="font-size:13px;color:#475569">A csomag ideiglenes tárhelyének törlése csak a riport sikeres elkészítése és kézbesítése után történhet meg.</p>
      </div>
      <p style="font-size:12px;color:#64748b">Automatikus DIMPRO Drop rendszerüzenet.</p>
    </div>
  `;
  return { subject, text, html };
}

async function generateReport(bundle: DropFinalReportBundle, report: DropReportRecord) {
  await updateDropFinalReportRecord(report.id, { status: "generating", error_message: null });
  await updateDropPackageFinalReportStatus(bundle.packageRow.id, "generating");
  const rendered = await renderDropFinalReport(bundle);
  const sha256 = createHash("sha256").update(rendered.buffer).digest("hex");
  const storageKey = reportStorageKey(bundle.packageRow.id, report.id);
  try {
    await putDropS3Object({
      storageKey,
      body: rendered.buffer,
      contentType: "application/pdf",
      metadata: {
        "dimpro-report-type": "final",
        "dimpro-report-id": report.id,
        "dimpro-package-id": bundle.packageRow.id,
        "dimpro-sha256": sha256,
      },
    });
    const updated = await updateDropFinalReportRecord(report.id, {
      status: "generated",
      storage_key: storageKey,
      page_count: rendered.pageCount,
      file_size_bytes: rendered.buffer.length,
      generated_at: rendered.generatedAt,
      error_message: null,
    });
    await updateDropPackageFinalReportStatus(bundle.packageRow.id, "generated");
    await writeDropReportEvent({
      packageId: bundle.packageRow.id,
      eventType: "report.generated",
      payload: {
        reportId: report.id,
        storageKey,
        pageCount: rendered.pageCount,
        fileSizeBytes: rendered.buffer.length,
        sha256,
        includedImageCount: rendered.includedImageCount,
        eligibleImageCount: rendered.eligibleImageCount,
        truncatedImageCount: rendered.truncatedImageCount,
      },
    });
    return { report: updated, rendered, sha256 };
  } catch (error) {
    await deleteDropS3Object({ storageKey }).catch(() => undefined);
    throw error;
  }
}

async function sendReport(bundle: DropFinalReportBundle, report: DropReportRecord, preferredBuffer?: Buffer, preferredName?: string) {
  const recipients = await listDropFinalReportEmailRecipients(bundle);
  if (!recipients.length) {
    const now = new Date().toISOString();
    const completed = await updateDropFinalReportRecord(report.id, { status: "completed", sent_at: now, error_message: null });
    await updateDropPackageFinalReportStatus(bundle.packageRow.id, "completed");
    await writeDropReportEvent({ packageId: bundle.packageRow.id, eventType: "report.completed_without_recipients", payload: { reportId: report.id } });
    return { report: completed, attempted: 0, sent: 0, failed: 0, skipped: 0, noRecipients: true };
  }

  const alreadySent = await listSentDropFinalReportEmails(bundle.packageRow.id, report.id);
  const pending = recipients.filter((recipient) => !alreadySent.has(recipient.email));
  if (!pending.length) {
    const now = report.sent_at || new Date().toISOString();
    const sent = await updateDropFinalReportRecord(report.id, { status: "sent", sent_at: now, error_message: null });
    await updateDropPackageFinalReportStatus(bundle.packageRow.id, "sent");
    return { report: sent, attempted: 0, sent: 0, failed: 0, skipped: recipients.length, noRecipients: false };
  }

  await updateDropFinalReportRecord(report.id, { status: "sending", error_message: null });
  await updateDropPackageFinalReportStatus(bundle.packageRow.id, "sending");
  const buffer = preferredBuffer || await loadReportBuffer(report);
  const attachmentLimit = clampInteger(process.env.DIMPRO_DROP_REPORT_EMAIL_ATTACHMENT_MB, 12, 1, 20) * 1024 * 1024;
  const attach = buffer.length <= attachmentLimit;
  const signed = attach || !report.storage_key
    ? null
    : await createDropS3DownloadUrl({
        storageKey: report.storage_key,
        displayName: preferredName || `${bundle.packageRow.public_code}_vegleges_riport.pdf`,
        contentType: "application/pdf",
        expiresIn: 7 * 24 * 60 * 60,
      });
  const fileName = preferredName || `${bundle.packageRow.public_code}_vegleges_riport.pdf`;
  let sentCount = 0;
  const failures: Array<{ email: string; error: string }> = [];
  for (const recipient of pending) {
    try {
      const message = buildFinalReportMessage({
        bundle,
        recipientName: recipient.name,
        fileName,
        downloadUrl: signed?.url || null,
        attached: attach,
      });
      const delivery = await sendDimproMail({
        profileId: "drop",
        to: [recipient.email],
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: attach ? [{ filename: fileName, content: buffer, contentType: "application/pdf" }] : undefined,
      });
      await writeDropFinalReportEmailLog({
        packageId: bundle.packageRow.id,
        reportId: report.id,
        recipientEmail: recipient.email,
        status: "sent",
        messageId: delivery.messageId,
      });
      sentCount += 1;
    } catch (error) {
      const message = errorMessage(error);
      failures.push({ email: recipient.email, error: message });
      await writeDropFinalReportEmailLog({
        packageId: bundle.packageRow.id,
        reportId: report.id,
        recipientEmail: recipient.email,
        status: "failed",
        error: message,
      }).catch(() => undefined);
    }
  }
  const sentAfter = await listSentDropFinalReportEmails(bundle.packageRow.id, report.id);
  const allSent = recipients.every((recipient) => sentAfter.has(recipient.email));
  if (allSent) {
    const now = new Date().toISOString();
    const sent = await updateDropFinalReportRecord(report.id, { status: "sent", sent_at: now, error_message: null });
    await updateDropPackageFinalReportStatus(bundle.packageRow.id, "sent");
    await writeDropReportEvent({
      packageId: bundle.packageRow.id,
      eventType: "report.sent",
      payload: { reportId: report.id, recipients: recipients.length, attached: attach, fileSizeBytes: buffer.length },
    });
    return { report: sent, attempted: pending.length, sent: sentCount, failed: 0, skipped: alreadySent.size, noRecipients: false };
  }
  const failureMessage = failures.length
    ? `${failures.length} címzettnek nem sikerült elküldeni a riportot.`
    : "A végleges riport kézbesítése nem teljes.";
  await updateDropFinalReportRecord(report.id, { status: "generated", error_message: failureMessage });
  await updateDropPackageFinalReportStatus(bundle.packageRow.id, "generated");
  await writeDropReportEvent({
    packageId: bundle.packageRow.id,
    eventType: "report.delivery_partial_failure",
    severity: "warning",
    payload: { reportId: report.id, sent: sentCount, failed: failures.length, failures },
  });
  throw new DropReportError(failureMessage, "DROP_REPORT_DELIVERY_INCOMPLETE", 502, true);
}

export async function processDropFinalReport(packageId: string) {
  const bundle = await loadDropFinalReportBundle(packageId);
  ensureReportGenerationAllowed(bundle);
  let report = await ensureDropFinalReportRecord(bundle);
  try {
    if (isDropReportFresh(report, bundle) && ["sent", "completed"].includes(report.status)) {
      await updateDropPackageFinalReportStatus(packageId, report.status);
      return { ok: true as const, packageId, reportId: report.id, status: report.status, idempotent: true };
    }

    let generatedBuffer: Buffer | undefined;
    let generatedName: string | undefined;
    if (!isDropReportFresh(report, bundle) || !report.storage_key || !["generated", "sending", "sent", "completed"].includes(report.status)) {
      const generated = await generateReport(bundle, report);
      report = generated.report;
      generatedBuffer = generated.rendered.buffer;
      generatedName = generated.rendered.fileName;
    }

    const freshBundle = await loadDropFinalReportBundle(packageId);
    if (!isDropReportFresh(report, freshBundle)) {
      await updateDropFinalReportRecord(report.id, { status: "failed", error_message: "A csomagtartalom a riport készítése közben megváltozott." });
      await updateDropPackageFinalReportStatus(packageId, "failed");
      throw new DropReportError("A csomagtartalom a riport készítése közben megváltozott; új riport szükséges.", "DROP_REPORT_CONTENT_CHANGED", 409, true);
    }

    const delivery = await sendReport(freshBundle, report, generatedBuffer, generatedName);
    return {
      ok: true as const,
      packageId,
      reportId: delivery.report.id,
      status: delivery.report.status,
      attempted: delivery.attempted,
      sent: delivery.sent,
      failed: delivery.failed,
      skipped: delivery.skipped,
      noRecipients: delivery.noRecipients,
      idempotent: false,
    };
  } catch (error) {
    const message = errorMessage(error);
    const latest = await getLatestDropFinalReport(packageId).catch(() => null);
    if (latest && !["sent", "completed"].includes(latest.status)) {
      await updateDropFinalReportRecord(latest.id, { status: latest.storage_key ? "generated" : "failed", error_message: message }).catch(() => undefined);
      await updateDropPackageFinalReportStatus(packageId, latest.storage_key ? "generated" : "failed").catch(() => undefined);
    }
    await writeDropReportEvent({ packageId, eventType: "report.error", severity: "error", payload: { error: message } }).catch(() => undefined);
    throw error;
  }
}

export async function getDropFinalReportPublicState(packageId: string) {
  const bundle = await loadDropFinalReportBundle(packageId);
  const report = await getLatestDropFinalReport(packageId);
  const fresh = isDropReportFresh(report, bundle);
  const reportEnabled = getDropFeatureFlags().pdfReportEnabled;
  const downloadable = Boolean(reportEnabled && report?.storage_key && fresh && ["generated", "sending", "sent", "completed"].includes(report.status));
  const signed = downloadable && report?.storage_key
    ? await createDropS3DownloadUrl({
        storageKey: report.storage_key,
        displayName: `${bundle.packageRow.public_code}_vegleges_riport.pdf`,
        contentType: "application/pdf",
        expiresIn: 10 * 60,
      })
    : null;
  return {
    version: "DROP 1.2.12",
    enabled: reportEnabled,
    packageStatus: bundle.packageRow.status,
    finalReportStatus: bundle.packageRow.final_report_status || "not_requested",
    report: report ? {
      id: report.id,
      status: report.status,
      pageCount: report.page_count,
      fileSizeBytes: report.file_size_bytes,
      generatedAt: report.generated_at,
      sentAt: report.sent_at,
      errorMessage: report.error_message,
      fresh,
      downloadUrl: signed?.url || null,
      downloadExpiresAt: signed?.expiresAt || null,
    } : null,
    automatic: true,
    note: FINAL_REPORT_READY_STATUSES.has(bundle.packageRow.status)
      ? "A végleges riport automatikusan készül és a törlés előtt kötelezően kézbesítésre kerül."
      : "A végleges riport a feltöltés lezárása vagy a csomag lejárata után készül el automatikusan.",
  };
}
