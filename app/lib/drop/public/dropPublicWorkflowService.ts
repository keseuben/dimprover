import { getDimproSendContextByEntitlementId, recordDimproUploadRulesAcceptance, verifyDimproProjectCode } from "@/app/lib/identity-core/repository";
import { DROP_UPLOAD_RULES_VERSION } from "@/app/lib/drop/dropUploadRules";
import type { DimproSendRecipient } from "@/app/lib/identity-core/types";
import { createDropPackage, findDropPackageById, getDropSupabaseClient, listDropRecipientsForPackage, reissueDropAccessTokenAtomic, writeDropEvent } from "../dropRepository";
import type { DropRecipientInput } from "../dropTypes";
import {
  bindDropPublicSessionPackage,
  getDropPackageWorkflow,
  getDropPublicDefaults,
  getDropSendCodeById,
  getDropSubmissionGateById,
  getDropSubmissionGateBySlug,
  normalizeDropDownloadProtection,
  resolveDropPublicSession,
  saveDropPackageWorkflow,
} from "./dropPublicRepository";
import type { DropPackageWorkflowRecord, DropPublicRecipient, DropPublicWorkflowType, DropSendEntitlementProfile } from "./dropPublicTypes";
import { getDropPublicDeliveryEmailAvailability } from "./dropPublicEmail";

function workflowError(message: string, code: string, status: number) {
  const error = new Error(message); Object.assign(error, { code, status }); return error;
}
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : ""; }
function longText(value: unknown, max: number) { return typeof value === "string" ? value.trim().replace(/\r\n/g, "\n").slice(0, max) : ""; }
function email(value: unknown) {
  const normalized = text(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}
function retention(value: unknown, fallback: number) {
  const parsed = Number(value); return [1, 3, 5, 7, 14, 30].includes(parsed) ? parsed : fallback;
}
function normalizeRecipientInputs(value: unknown, max: number): DropRecipientInput[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, DropRecipientInput>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const recipientEmail = email(row.email);
    const name = text(row.name, 120);
    if (!recipientEmail || !name || unique.has(recipientEmail)) continue;
    unique.set(recipientEmail, {
      name,
      email: recipientEmail,
      company: text(row.company, 160) || undefined,
      role: "invitee",
      receiveInvitation: false,
      receiveActivityNotifications: false,
      receiveFinalReport: false,
    });
    if (unique.size >= max) break;
  }
  return [...unique.values()];
}
function recipientInput(item: DropPublicRecipient): DropRecipientInput {
  return {
    name: item.name,
    email: item.email,
    company: item.company,
    role: "invitee",
    receiveInvitation: false,
    receiveActivityNotifications: false,
    receiveFinalReport: false,
  };
}
function entitlementRecipients(
  entitlement: DropSendEntitlementProfile,
  value: unknown,
  quickRecipientEmail: unknown,
  quickImageSend: boolean,
  maxRecipients: number,
): DropRecipientInput[] {
  const approved = new Map(entitlement.approvedRecipients.map((item) => [item.email.toLowerCase(), item]));
  if (entitlement.defaultRecipient) approved.set(entitlement.defaultRecipient.email.toLowerCase(), entitlement.defaultRecipient);
  const requested = normalizeRecipientInputs(value, maxRecipients);

  if (quickImageSend) {
    const selfRecipient: DropRecipientInput = {
      name: entitlement.userFullName,
      email: entitlement.userEmail.toLowerCase(),
      role: "invitee",
      receiveInvitation: false,
      receiveActivityNotifications: false,
      receiveFinalReport: false,
    };
    const fallbackEmail = email(quickRecipientEmail);
    const requestedExtras = (requested.length
      ? requested
      : fallbackEmail
        ? [{ name: "További címzett", email: fallbackEmail, role: "invitee" as const, receiveInvitation: false, receiveActivityNotifications: false, receiveFinalReport: false }]
        : [])
      .filter((item) => item.email.toLowerCase() !== selfRecipient.email);
    if (entitlement.recipientMode === "approved_list") {
      const selected = requestedExtras
        .map((item) => approved.get(item.email.toLowerCase()))
        .filter((item): item is DropPublicRecipient => Boolean(item));
      if (selected.length !== requestedExtras.length) throw workflowError("Ez a további címzett nem szerepel a Send-jogosultság engedélyezett listáján.", "DROP_SEND_RECIPIENT_NOT_APPROVED", 403);
      return [selfRecipient, ...selected.map(recipientInput)]
        .filter((item, index, all) => all.findIndex((candidate) => candidate.email.toLowerCase() === item.email.toLowerCase()) === index)
        .slice(0, Math.min(maxRecipients, 6));
    }
    return [selfRecipient, ...requestedExtras]
      .filter((item, index, all) => all.findIndex((candidate) => candidate.email.toLowerCase() === item.email.toLowerCase()) === index)
      .slice(0, Math.min(maxRecipients, 6));
  }

  if (entitlement.recipientMode === "locked_default") {
    if (!entitlement.defaultRecipient) throw workflowError("A Send-jogosultsághoz nincs alapértelmezett címzett beállítva.", "DROP_SEND_DEFAULT_RECIPIENT_MISSING", 409);
    return [recipientInput(entitlement.defaultRecipient)];
  }

  if (entitlement.recipientMode === "approved_list") {
    const selected = requested.map((item) => approved.get(item.email.toLowerCase())).filter((item): item is DropPublicRecipient => Boolean(item));
    if (!selected.length || selected.length !== requested.length) throw workflowError("Csak a Send-jogosultság engedélyezett címzettjei választhatók.", "DROP_SEND_RECIPIENT_NOT_APPROVED", 403);
    return selected.map(recipientInput);
  }
  return requested;
}

function identityRecipientInput(item: DimproSendRecipient): DropRecipientInput {
  return {
    name: item.name,
    email: item.email,
    company: item.organizationName || undefined,
    role: "invitee",
    receiveInvitation: false,
    receiveActivityNotifications: false,
    receiveFinalReport: false,
  };
}

function identityEntitlementRecipients(
  context: Awaited<ReturnType<typeof getDimproSendContextByEntitlementId>>,
  value: unknown,
  quickRecipientEmail: unknown,
  quickImageSend: boolean,
): DropRecipientInput[] {
  const approved = new Map(context.recipients.map((item) => [item.email.toLowerCase(), item]));
  if (context.defaultRecipient) approved.set(context.defaultRecipient.email.toLowerCase(), context.defaultRecipient);
  const requested = normalizeRecipientInputs(value, context.entitlement.maxRecipients);

  if (quickImageSend) {
    const selfRecipient: DropRecipientInput = {
      name: context.user.fullName,
      email: context.user.email.toLowerCase(),
      role: "invitee",
      receiveInvitation: false,
      receiveActivityNotifications: false,
      receiveFinalReport: false,
    };
    const fallbackEmail = email(quickRecipientEmail);
    const requestedExtras = (requested.length
      ? requested
      : fallbackEmail
        ? [{ name: "További címzett", email: fallbackEmail, role: "invitee" as const, receiveInvitation: false, receiveActivityNotifications: false, receiveFinalReport: false }]
        : [])
      .filter((item) => item.email.toLowerCase() !== selfRecipient.email);

    if (context.entitlement.recipientMode === "approved_list") {
      const selected = requestedExtras
        .map((item) => approved.get(item.email.toLowerCase()))
        .filter((item): item is DimproSendRecipient => Boolean(item));
      if (selected.length !== requestedExtras.length) {
        throw workflowError("Ez a további címzett nem szerepel a központi Send-jogosultság engedélyezett listáján.", "DROP_SEND_RECIPIENT_NOT_APPROVED", 403);
      }
      return [selfRecipient, ...selected.map(identityRecipientInput)]
        .filter((item, index, all) => all.findIndex((candidate) => candidate.email.toLowerCase() === item.email.toLowerCase()) === index)
        .slice(0, Math.min(context.entitlement.maxRecipients, 6));
    }

    return [selfRecipient, ...requestedExtras]
      .filter((item, index, all) => all.findIndex((candidate) => candidate.email.toLowerCase() === item.email.toLowerCase()) === index)
      .slice(0, Math.min(context.entitlement.maxRecipients, 6));
  }

  if (context.entitlement.recipientMode === "locked_default") {
    if (!context.defaultRecipient) {
      throw workflowError("A Send-jogosultsághoz nincs alapértelmezett címzett beállítva.", "DROP_SEND_DEFAULT_RECIPIENT_MISSING", 409);
    }
    return [identityRecipientInput(context.defaultRecipient)];
  }

  if (context.entitlement.recipientMode === "approved_list") {
    const selected = requested
      .map((item) => approved.get(item.email.toLowerCase()))
      .filter((item): item is DimproSendRecipient => Boolean(item));
    if (!selected.length || selected.length !== requested.length) {
      throw workflowError("Csak a központi Send-jogosultság engedélyezett címzettjei választhatók.", "DROP_SEND_RECIPIENT_NOT_APPROVED", 403);
    }
    return selected.map(identityRecipientInput);
  }
  return requested;
}

function selectedGateRecipients(all: DropPublicRecipient[], selected: unknown, organization: boolean) {
  if (!organization) return all;
  const ids = new Set(Array.isArray(selected) ? selected.filter((item): item is string => typeof item === "string") : []);
  const rows = all.filter((item) => ids.has(item.id));
  if (!rows.length) throw workflowError("Válasszon legalább egy engedélyezett szervezeti címzettet.", "DROP_GATE_RECIPIENT_SELECTION_REQUIRED", 400);
  return rows;
}
async function rollbackUnboundPublicPackage(packageId: string, originalError: unknown): Promise<never> {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_packages")
    .delete()
    .eq("id", packageId)
    .select("id")
    .maybeSingle();
  if (error || !data?.id) {
    const rollbackError = workflowError(
      "A párhuzamos küldeménykérés visszagörgetése sikertelen. Kézi ellenőrzés szükséges.",
      "DROP_PUBLIC_PACKAGE_COMPENSATION_FAILED",
      500,
    );
    Object.assign(rollbackError, {
      cause: originalError,
      compensationDetail: error?.message || "A létrehozott csomag nem volt törölhető.",
      packageId,
    });
    throw rollbackError;
  }
  throw originalError;
}

async function disablePublicWorkflowUploadNotifications(packageId: string) {
  const client = getDropSupabaseClient();
  const { error } = await client.from("drop_packages").update({
    notify_on_upload_complete: false,
    notify_on_first_open: false,
    updated_at: new Date().toISOString(),
  }).eq("id", packageId);
  if (error) {
    throw workflowError(
      "A publikus küldemény értesítési szabályai nem állíthatók be biztonságosan.",
      error.code || "DROP_PUBLIC_NOTIFICATION_POLICY_FAILED",
      500,
    );
  }
}

async function insertPackageNote(input: { packageId: string; authorName: string; authorEmail: string; commentText: string }) {
  if (!input.commentText) return null;
  const client = getDropSupabaseClient();
  const { data, error } = await client.from("drop_comments").insert({
    package_id: input.packageId,
    file_id: null,
    parent_comment_id: null,
    author_recipient_id: null,
    author_user_id: "drop-public-sender",
    author_name: input.authorName,
    author_email: input.authorEmail || null,
    comment_text: input.commentText,
    status: "active",
  }).select("id").single();
  if (error) throw error;
  return data;
}

export async function createDropPublicWorkflowPackage(input: {
  rawSession: string;
  headers: Headers;
  body: Record<string, unknown>;
}) {
  const workflowType = input.body.workflowType === "submission_gate" ? "submission_gate" : "send";
  const quickImageSend = workflowType === "send" && input.body.quickImageSend === true;
  const session = await resolveDropPublicSession(input.rawSession, input.headers, workflowType);
  if (session.packageId) throw workflowError("Ezzel a munkamenettel már létrejött egy küldemény.", "DROP_PUBLIC_SESSION_ALREADY_BOUND", 409);
  let senderName = text(input.body.senderName, 120);
  let senderEmail = email(input.body.senderEmail);
  let subject = text(input.body.subject, 160);
  const senderMessage = longText(input.body.senderMessage, 2_000);
  const packageNote = quickImageSend ? "" : longText(input.body.packageNote, 10_000);
  const showRecipientsOnDownload = input.body.showRecipientsOnDownload !== false;
  const defaults = getDropPublicDefaults();
  let maxFileSizeBytes = defaults.limits.maxFileSizeBytes;
  let maxTotalSizeBytes = defaults.limits.maxTotalSizeBytes;
  let allowFileComments = true;
  let allowImageGroups = true;
  let allowQuickVoiceNote = false;
  let quickVoiceSecondsPerNote = 60;
  let recipients: DropRecipientInput[] = [];
  let retentionDays = 5;
  let requireDownloadPin = true;
  let workflow: Omit<DropPackageWorkflowRecord, "packageId" | "createdAt" | "updatedAt">;
  let projectId: string | undefined;
  let projectName: string | undefined;
  let centralRulesAcceptanceRequired = false;
  let centralRulesEntitlementId: string | null = null;

  if (workflowType === "send") {
    let centralEntitlementId: string | null = null;
    let centralProjectId: string | null = null;
    let centralProjectPublicCode: string | null = null;
    let centralTargetFolder: string | null = null;

    if (session.dimproSendEntitlementId) {
      const context = await getDimproSendContextByEntitlementId(session.dimproSendEntitlementId);
      centralEntitlementId = context.entitlement.id;
      centralRulesEntitlementId = context.entitlement.id;
      centralRulesAcceptanceRequired = context.entitlement.uploadRulesVersion !== DROP_UPLOAD_RULES_VERSION || context.entitlement.uploadRulesAcceptanceCount < 3;
      if (centralRulesAcceptanceRequired && (input.body.rulesAccepted !== true || text(input.body.rulesVersion, 120) !== DROP_UPLOAD_RULES_VERSION)) {
        throw workflowError("A feltöltési szabályokat az első három használatkor el kell fogadni.", "DROP_UPLOAD_RULES_NOT_ACCEPTED", 400);
      }
      if (quickImageSend && !context.entitlement.canUseQuickImageSend) {
        throw workflowError("A Gyors KépSend ehhez a központi jogosultsághoz nincs engedélyezve.", "DROP_QUICK_IMAGE_SEND_NOT_ALLOWED", 403);
      }
      if (!quickImageSend && !context.entitlement.canUseStandardSend) {
        throw workflowError("A Normál DIMPRO Send ehhez a központi jogosultsághoz nincs engedélyezve.", "DROP_STANDARD_SEND_NOT_ALLOWED", 403);
      }
      senderName = context.user.fullName;
      senderEmail = context.user.email;
      recipients = identityEntitlementRecipients(context, input.body.recipients, input.body.quickRecipientEmail, quickImageSend);
      allowFileComments = context.entitlement.canUseFileComments;
      allowImageGroups = context.entitlement.canUseImageGroups;
      allowQuickVoiceNote = quickImageSend && context.entitlement.canUseQuickVoiceNote;
      quickVoiceSecondsPerNote = context.entitlement.maxQuickVoiceSecondsPerNote;
      maxTotalSizeBytes = Math.min(defaults.limits.maxTotalSizeBytes, context.entitlement.maxPackageSizeBytes);
      maxFileSizeBytes = Math.min(defaults.limits.maxFileSizeBytes, context.entitlement.maxPackageSizeBytes);

      const requestedProjectCode = text(input.body.projectCode, 40).toUpperCase();
      if (requestedProjectCode) {
        if (!context.entitlement.canUseProjectDrop) {
          throw workflowError("A projektkód nem használható.", "DIMPRO_PROJECT_DROP_NOT_ALLOWED", 403);
        }
        const verifiedProject = await verifyDimproProjectCode(context.entitlement.id, requestedProjectCode, input.headers);
        if (!verifiedProject.ok) {
          throw workflowError("A projektkód nem használható.", "DIMPRO_PROJECT_CODE_NOT_ALLOWED", 403);
        }
        centralProjectId = verifiedProject.project.id;
        centralProjectPublicCode = verifiedProject.project.publicCode;
        centralTargetFolder = verifiedProject.destination.label;
        projectId = verifiedProject.project.publicCode;
        projectName = verifiedProject.project.name;
      }

      retentionDays = retention(input.body.retentionDays, 5);
      requireDownloadPin = quickImageSend ? false : normalizeDropDownloadProtection(input.body.downloadProtection) === "link_pin";
      if (quickImageSend) {
        subject = `Mobilfotók – ${new Date().toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" })}`;
      }
      if (senderName.length < 2 || !senderEmail) {
        throw workflowError("A központi feladói adatok hiányosak.", "DIMPRO_SEND_IDENTITY_INVALID", 500);
      }
      if (subject.length < 2) throw workflowError("A küldemény tárgya kötelező.", "DROP_PUBLIC_SUBJECT_REQUIRED", 400);
      if (!recipients.length || recipients.some((item) => !item.email)) {
        throw workflowError("Legalább egy címzett szükséges.", "DROP_SEND_RECIPIENT_REQUIRED", 400);
      }
      workflow = {
        workflowType,
        subject,
        senderMessage,
        packageNote,
        requireDownloadPin,
        sendCodeId: null,
        dimproSendEntitlementId: centralEntitlementId,
        gateId: null,
        gateType: null,
        projectId: centralProjectPublicCode,
        projectName: projectName || null,
        dimproProjectId: centralProjectId,
        projectPublicCode: centralProjectPublicCode,
        targetFolder: centralTargetFolder,
        selectedRecipientIds: [],
        recipientEmails: recipients.map((item) => item.email),
        showRecipientsOnDownload,
        exportGroupsAsFolders: false,
        appendGroupNameToFilename: true,
        finalizedAt: null,
        identityAccountedAt: null,
        notificationStatus: "not_requested",
        notificationDetail: null,
        downloadLinkHint: null,
      };
    } else if (session.sendCodeId) {
      // Csak meglévő, deploy előtt megnyitott legacy munkamenetek kompatibilitásához.
      const sendCode = await getDropSendCodeById(session.sendCodeId);
      const entitlement = sendCode.entitlement || null;
      if (entitlement) {
        if (quickImageSend && !entitlement.canUseQuickImageSend) throw workflowError("A Gyors KépSend ehhez a jogosultsághoz nincs engedélyezve.", "DROP_QUICK_IMAGE_SEND_NOT_ALLOWED", 403);
        if (!quickImageSend && !entitlement.canUseStandardSend) throw workflowError("A Normál DIMPRO Send ehhez a jogosultsághoz nincs engedélyezve.", "DROP_STANDARD_SEND_NOT_ALLOWED", 403);
        senderName = entitlement.userFullName;
        senderEmail = entitlement.userEmail;
        recipients = entitlementRecipients(entitlement, input.body.recipients, input.body.quickRecipientEmail, quickImageSend, sendCode.maxRecipients);
        allowFileComments = entitlement.canUseFileComments;
        allowImageGroups = entitlement.canUseImageGroups;
      } else {
        recipients = quickImageSend
          ? [{ name: "Címzett", email: email(input.body.quickRecipientEmail), role: "invitee" as const, receiveInvitation: false, receiveActivityNotifications: false, receiveFinalReport: false }]
          : normalizeRecipientInputs(input.body.recipients, sendCode.maxRecipients);
      }
      if (quickImageSend) subject = `Mobilfotók – ${new Date().toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" })}`;
      if (senderName.length < 2) throw workflowError("A feladó neve kötelező.", "DROP_PUBLIC_SENDER_NAME_REQUIRED", 400);
      if (!senderEmail) throw workflowError("Érvényes feladói e-mail-cím szükséges.", "DROP_PUBLIC_SENDER_EMAIL_REQUIRED", 400);
      if (subject.length < 2) throw workflowError("A küldemény tárgya kötelező.", "DROP_PUBLIC_SUBJECT_REQUIRED", 400);
      if (!recipients.length || recipients.some((item) => !item.email)) throw workflowError("Legalább egy címzett neve és e-mail-címe szükséges.", "DROP_SEND_RECIPIENT_REQUIRED", 400);
      retentionDays = retention(input.body.retentionDays, sendCode.defaultRetentionDays);
      requireDownloadPin = quickImageSend ? false : normalizeDropDownloadProtection(input.body.downloadProtection) === "link_pin";
      workflow = {
        workflowType,
        subject,
        senderMessage,
        packageNote,
        requireDownloadPin,
        sendCodeId: session.sendCodeId,
        dimproSendEntitlementId: null,
        gateId: null,
        gateType: null,
        projectId: null,
        projectName: null,
        dimproProjectId: null,
        projectPublicCode: null,
        targetFolder: null,
        selectedRecipientIds: [],
        recipientEmails: recipients.map((item) => item.email),
        showRecipientsOnDownload,
        exportGroupsAsFolders: false,
        appendGroupNameToFilename: true,
        finalizedAt: null,
        identityAccountedAt: null,
        notificationStatus: "not_requested",
        notificationDetail: null,
        downloadLinkHint: null,
      };
    } else {
      throw workflowError("A központi küldési jogosultság hiányzik.", "DROP_SEND_SESSION_INVALID", 403);
    }
  } else {
    if (senderName.length < 2) throw workflowError("A feladó neve kötelező.", "DROP_PUBLIC_SENDER_NAME_REQUIRED", 400);
    if (!senderEmail) throw workflowError("Érvényes feladói e-mail-cím szükséges.", "DROP_PUBLIC_SENDER_EMAIL_REQUIRED", 400);
    if (subject.length < 2) throw workflowError("A küldemény tárgya kötelező.", "DROP_PUBLIC_SUBJECT_REQUIRED", 400);
    if (!session.gateId) throw workflowError("A Beküldőkapu-jogosultság hiányzik.", "DROP_GATE_SESSION_INVALID", 403);
    const gate = await getDropSubmissionGateById(session.gateId);
    if (gate.requireSenderEmail && !senderEmail) throw workflowError("A Beküldőkapu érvényes e-mail-címet kér.", "DROP_GATE_SENDER_EMAIL_REQUIRED", 400);
    const selected = selectedGateRecipients(gate.recipients, input.body.selectedRecipientIds, gate.type === "organization");
    recipients = selected.map((item) => ({
      name: item.name,
      email: item.email,
      company: item.company,
      role: "invitee",
      receiveInvitation: false,
      receiveActivityNotifications: false,
      receiveFinalReport: false,
    }));
    retentionDays = gate.retentionDays;
    requireDownloadPin = gate.downloadProtection === "link_pin";
    projectId = gate.projectId || undefined;
    projectName = gate.projectName || undefined;
    workflow = {
      workflowType,
      subject,
      senderMessage,
      packageNote: gate.allowPackageComment ? packageNote : "",
      requireDownloadPin,
      sendCodeId: null,
      dimproSendEntitlementId: null,
      gateId: gate.id,
      gateType: gate.type,
      projectId: gate.projectId || null,
      projectName: gate.projectName || null,
      dimproProjectId: null,
      projectPublicCode: null,
      targetFolder: gate.targetFolder || null,
      selectedRecipientIds: selected.map((item) => item.id),
      recipientEmails: selected.map((item) => item.email),
      showRecipientsOnDownload: true,
      exportGroupsAsFolders: false,
      appendGroupNameToFilename: true,
      finalizedAt: null,
      identityAccountedAt: null,
      notificationStatus: "not_requested",
      notificationDetail: null,
      downloadLinkHint: null,
    };
  }

  const created = await createDropPackage({
    mode: quickImageSend ? "image" : "mixed",
    title: subject,
    description: senderMessage,
    projectId,
    projectName,
    uploaderName: senderName,
    uploaderEmail: senderEmail,
    retentionDays,
    recipients,
    groups: [],
    maxFileCount: quickImageSend ? 200 : defaults.limits.maxFileCount,
    maxFileSizeBytes,
    maxTotalSizeBytes,
  }, {
    userId: `drop-public:${session.id}`,
    name: senderName,
    email: senderEmail,
  });
  try {
    await disablePublicWorkflowUploadNotifications(created.package.id);
    await bindDropPublicSessionPackage(input.rawSession, created.package.id, maxTotalSizeBytes);
  } catch (error) {
    await rollbackUnboundPublicPackage(created.package.id, error);
  }
  await saveDropPackageWorkflow({ packageId: created.package.id, ...workflow });
  if (centralRulesEntitlementId && centralRulesAcceptanceRequired) {
    await recordDimproUploadRulesAcceptance(centralRulesEntitlementId, DROP_UPLOAD_RULES_VERSION);
  }
  await insertPackageNote({ packageId: created.package.id, authorName: senderName, authorEmail: senderEmail, commentText: workflow.packageNote });
  await writeDropEvent({
    packageId: created.package.id,
    eventType: `public.${workflowType}.package_created`,
    actorName: senderName,
    actorEmail: senderEmail,
    payload: {
      workflowType,
      recipientCount: recipients.length,
      retentionDays,
      requireDownloadPin,
      maxTotalSizeBytes,
      targetFolder: workflow.targetFolder || null,
      quickImageSend,
      allowQuickVoiceNote,
      quickVoiceSecondsPerNote,
    },
  });
  const emailDelivery = await getDropPublicDeliveryEmailAvailability();
  return {
    package: {
      id: created.package.id,
      publicCode: created.package.public_code,
      title: created.package.title,
      expiresAt: created.package.expires_at,
      maxFileCount: created.package.max_file_count,
      maxFileSizeBytes: created.package.max_file_size_bytes,
      maxTotalSizeBytes: created.package.max_total_size_bytes,
      mode: created.package.mode,
    },
    uploadToken: created.rawTokens.upload,
    uploadUrl: created.links.upload,
    workflow: {
      workflowType,
      requireDownloadPin,
      recipientCount: recipients.length,
      allowFileComments: workflowType === "send"
        ? allowFileComments
        : (await getDropSubmissionGateById(session.gateId || "")).allowFileComments,
      allowImageGroups: workflowType === "send" ? allowImageGroups : true,
      uploaderName: senderName,
      quickImageSend,
      allowQuickVoiceNote,
      quickVoiceSecondsPerNote,
      recipients: recipients.map((recipient) => ({ name: recipient.name, email: recipient.email, company: recipient.company || null })),
      retentionDays,
      emailDelivery,
    },
  };
}


export async function resumeDropPublicWorkflowPackage(input: {
  rawSession: string;
  headers: Headers;
  expectedWorkflowType?: DropPublicWorkflowType;
  expectedGateSlug?: string;
}) {
  if (!input.rawSession) return null;
  const session = await resolveDropPublicSession(input.rawSession, input.headers, input.expectedWorkflowType, true);
  if (!session.packageId) return null;
  const packageRow = await findDropPackageById(session.packageId);
  if (!packageRow || packageRow.deleted_at || packageRow.status === "deleted") {
    throw workflowError("A korábbi küldemény már nem érhető el.", "DROP_PUBLIC_RESUME_PACKAGE_NOT_FOUND", 404);
  }
  const workflow = await getDropPackageWorkflow(packageRow.id);
  if (!workflow || workflow.workflowType === "package_drop" || workflow.workflowType !== session.workflowType) {
    throw workflowError("A korábbi küldemény workflow-adata nem érvényes.", "DROP_PUBLIC_RESUME_WORKFLOW_INVALID", 409);
  }
  if (workflow.workflowType === "submission_gate" && input.expectedGateSlug) {
    const expectedGate = await getDropSubmissionGateBySlug(input.expectedGateSlug);
    if (!workflow.gateId || workflow.gateId !== expectedGate.id) {
      throw workflowError("A korábbi munkamenet másik Beküldőkapuhoz tartozik.", "DROP_PUBLIC_RESUME_GATE_MISMATCH", 403);
    }
  }
  const expired = Date.parse(packageRow.expires_at) <= Date.now();
  const active = packageRow.status === "active" && !expired;
  let uploadToken: string | null = null;
  if (active) {
    const expiresAt = new Date(Math.min(Date.parse(packageRow.expires_at), Date.parse(session.expiresAt))).toISOString();
    if (Date.parse(expiresAt) <= Date.now() + 30_000) {
      throw workflowError("A küldemény feltöltési munkamenete hamarosan lejár. Indítson új küldeményt.", "DROP_PUBLIC_RESUME_SESSION_EXPIRING", 409);
    }
    const reissued = await reissueDropAccessTokenAtomic({
      packageId: packageRow.id,
      purpose: "upload",
      expiresAt,
      eventPayload: {
        source: "public_session_resume",
        workflowType: workflow.workflowType,
        sessionId: session.id,
        rawTokenPersisted: false,
      },
    });
    uploadToken = reissued.capability.rawToken;
  }
  let allowFileComments = workflow.workflowType === "send";
  let allowImageGroups = true;
  let allowQuickVoiceNote = false;
  let quickVoiceSecondsPerNote = 60;
  let uploaderName = packageRow.uploader_name || "Publikus Drop feladó";
  if (workflow.workflowType === "send" && workflow.dimproSendEntitlementId) {
    const context = await getDimproSendContextByEntitlementId(workflow.dimproSendEntitlementId);
    allowFileComments = context.entitlement.canUseFileComments;
    allowImageGroups = context.entitlement.canUseImageGroups;
    allowQuickVoiceNote = packageRow.mode === "image" && context.entitlement.canUseQuickVoiceNote;
    quickVoiceSecondsPerNote = context.entitlement.maxQuickVoiceSecondsPerNote;
    uploaderName = context.user.fullName || uploaderName;
  } else if (workflow.workflowType === "send" && workflow.sendCodeId) {
    const entitlement = await getDropSendCodeById(workflow.sendCodeId).then((code) => code.entitlement).catch(() => null);
    allowFileComments = entitlement?.canUseFileComments ?? true;
    allowImageGroups = entitlement?.canUseImageGroups ?? true;
    uploaderName = entitlement?.userFullName || uploaderName;
  }
  if (workflow.workflowType === "submission_gate" && workflow.gateId) {
    allowFileComments = await getDropSubmissionGateById(workflow.gateId).then((gate) => gate.allowFileComments).catch(() => false);
  }
  const [resumeRecipients, emailDelivery] = await Promise.all([
    listDropRecipientsForPackage(packageRow.id),
    getDropPublicDeliveryEmailAvailability(),
  ]);
  return {
    package: {
      id: packageRow.id,
      publicCode: packageRow.public_code,
      title: packageRow.title,
      expiresAt: packageRow.expires_at,
      maxFileCount: packageRow.max_file_count,
      maxFileSizeBytes: packageRow.max_file_size_bytes,
      maxTotalSizeBytes: packageRow.max_total_size_bytes,
      currentFileCount: packageRow.current_file_count,
      currentTotalSizeBytes: packageRow.current_total_size_bytes,
      status: packageRow.status,
      mode: packageRow.mode,
      retentionDays: packageRow.retention_days,
    },
    uploadToken,
    resumable: active,
    delivered: Boolean(workflow.finalizedAt) || packageRow.status === "upload_closed",
    workflow: {
      workflowType: workflow.workflowType,
      requireDownloadPin: workflow.requireDownloadPin,
      recipientCount: workflow.recipientEmails?.length || 0,
      allowFileComments,
      allowImageGroups,
      uploaderName,
      notificationStatus: workflow.notificationStatus || "not_requested",
      quickImageSend: workflow.workflowType === "send" && packageRow.mode === "image",
      dimproSendEntitlementId: workflow.dimproSendEntitlementId || null,
      allowQuickVoiceNote,
      quickVoiceSecondsPerNote,
      recipients: resumeRecipients.map((recipient) => ({ name: recipient.name, email: recipient.email, company: recipient.company || null })),
      retentionDays: packageRow.retention_days,
      emailDelivery,
    },
    security: {
      sessionCookieOnly: true,
      rawCredentialsPersisted: false,
      capabilityReissued: Boolean(uploadToken),
    },
  };
}
