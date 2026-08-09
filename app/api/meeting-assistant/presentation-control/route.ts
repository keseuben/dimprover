import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  authorizeMeetingRequest,
  createMeetingAccessToken,
  meetingTokenAllowsOrganizer,
  meetingTokenIsEditor,
  meetingTokenIsPresentationController,
  type MeetingAccessTokenPayload,
} from "@/app/lib/meeting-assistant/access";
import { sendMeetingPresentationCodeEmail } from "@/app/lib/meeting-assistant/email";
import {
  consumeMeetingPresentationPairingCode,
  createMeetingPresentationPairingCode,
  presentationAccessTtlSeconds,
  revokeMeetingPresentationPairingCode,
} from "@/app/lib/meeting-assistant/presentation-pairing";
import { readMeetingWorkspace, sanitizeMeetingId, updateMeetingWorkspace } from "@/app/lib/meeting-assistant/store";
import type { MeetingAuditEvent, MeetingPresentationMode, MeetingViewRole, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Operation = "create" | "consume" | "update_state" | "release" | "reclaim";
type RequestBody = {
  operation?: Operation;
  meetingId?: string;
  accessToken?: string;
  presentationToken?: string;
  code?: string;
  recipientName?: string;
  recipientEmail?: string;
  controllerName?: string;
  controllerEmail?: string;
  actorName?: string;
  mode?: MeetingPresentationMode;
  enabled?: boolean;
  activeSectionId?: string;
  activeAgendaItemId?: string;
  activeAttachmentId?: string;
  documentAnchor?: string;
  scrollTop?: number;
};

function text(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function audit(input: { type: string; actorName: string; actorRole: MeetingViewRole | "system"; message: string; operation: string }): MeetingAuditEvent {
  return { id: `audit-${randomUUID()}`, type: input.type, at: new Date().toISOString(), actorName: text(input.actorName, 160) || "Rendszer", actorRole: input.actorRole, message: text(input.message, 1000), operation: input.operation };
}

function organizerAuthorized(auth: Awaited<ReturnType<typeof authorizeMeetingRequest>>) {
  return auth.ok && (auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload)));
}

function editorAuthorized(payload: MeetingAccessTokenPayload | null | undefined, workspace: MeetingWorkspace) {
  if (!meetingTokenIsEditor(payload)) return false;
  if (workspace.editorAccess.status !== "active" || !workspace.editorAccess.grantId || payload?.grantId !== workspace.editorAccess.grantId) return false;
  return Boolean(workspace.editorAccess.accessExpiresAt && new Date(workspace.editorAccess.accessExpiresAt).getTime() > Date.now());
}

function controllerAuthorized(payload: MeetingAccessTokenPayload | null | undefined, workspace: MeetingWorkspace) {
  if (!meetingTokenIsPresentationController(payload)) return false;
  if (workspace.presentationControl.status !== "active" || !workspace.presentationControl.grantId || payload?.grantId !== workspace.presentationControl.grantId) return false;
  return Boolean(workspace.presentationControl.accessExpiresAt && new Date(workspace.presentationControl.accessExpiresAt).getTime() > Date.now());
}

function publicControl(workspace: MeetingWorkspace) {
  return {
    presentation: workspace.presentation,
    presentationControl: {
      ...workspace.presentationControl,
      grantId: "",
      controllerEmail: "",
    },
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const accessToken = url.searchParams.get("accessToken") || undefined;
  const auth = await authorizeMeetingRequest(request, meetingId, accessToken);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  const workspace = await readMeetingWorkspace(meetingId);
  return NextResponse.json({ ok: true, ...publicControl(workspace) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body?.operation) return NextResponse.json({ ok: false, error: "Hiányzik a prezentációs művelet." }, { status: 400 });
  const meetingId = sanitizeMeetingId(body.meetingId);
  const auth = await authorizeMeetingRequest(request, meetingId, body.accessToken || body.presentationToken);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  const workspace = await readMeetingWorkspace(meetingId);
  const tokenPayload = auth.mode === "token" ? auth.payload : null;
  const isOrganizer = organizerAuthorized(auth);
  const isEditor = editorAuthorized(tokenPayload, workspace);
  const isController = controllerAuthorized(tokenPayload, workspace);

  try {
    if (body.operation === "create") {
      if (!isOrganizer && !isEditor) return NextResponse.json({ ok: false, error: "Vezérlőkódot csak a szervező vagy az aktív jegyzőkönyv-szerkesztő hozhat létre." }, { status: 403 });
      const issuedBy = text(body.actorName, 160) || (isOrganizer ? workspace.organizerName : workspace.editorAccess.editorName) || "Szervező";
      const pairing = await createMeetingPresentationPairingCode({ meetingId, issuedBy, recipientName: text(body.recipientName, 160), recipientEmail: text(body.recipientEmail, 240) });
      const updated = await updateMeetingWorkspace(meetingId, (current) => ({
        ...current,
        presentationControl: {
          ...current.presentationControl,
          status: "pending",
          grantId: "",
          controllerName: pairing.recipientName,
          controllerEmail: pairing.recipientEmail,
          controllerRole: "participant",
          issuedBy,
          issuedAt: new Date().toISOString(),
          pairingExpiresAt: pairing.expiresAt,
          activatedAt: "",
          accessExpiresAt: "",
          revokedAt: "",
          revokedBy: "",
        },
        auditLog: [...current.auditLog, audit({ type: "presentation_pairing_created", actorName: issuedBy, actorRole: isOrganizer ? "organizer" : "editor", message: `${issuedBy} prezentációs vezérlőkódot hozott létre${pairing.recipientName ? ` ${pairing.recipientName} részére` : ""}.`, operation: "create_presentation_pairing" })].slice(-1000),
      }));
      let emailSent = false;
      let emailError = "";
      if (pairing.recipientEmail) {
        try {
          const origin = new URL(request.url).origin;
          await sendMeetingPresentationCodeEmail({ workspace: updated, recipientEmail: pairing.recipientEmail, recipientName: pairing.recipientName, code: pairing.code, expiresAt: pairing.expiresAt, issuedBy, activationUrl: `${origin}/teams/meeting-assistant?meetingId=${encodeURIComponent(meetingId)}` });
          emailSent = true;
        } catch (error) {
          emailError = error instanceof Error ? error.message : "A vezérlőkód e-mailben nem küldhető el.";
        }
      }
      return NextResponse.json({ ok: true, pairing, emailSent, emailError, ...publicControl(updated) });
    }

    if (body.operation === "consume") {
      const consumed = await consumeMeetingPresentationPairingCode({ meetingId, code: body.code || "", controllerName: text(body.controllerName, 160), controllerEmail: text(body.controllerEmail, 240) });
      if (!consumed.ok) return NextResponse.json({ ok: false, error: consumed.error }, { status: 400 });
      const activatedAt = new Date().toISOString();
      const updated = await updateMeetingWorkspace(meetingId, (current) => ({
        ...current,
        presentationControl: {
          status: "active",
          grantId: consumed.grantId,
          controllerName: consumed.controllerName,
          controllerEmail: consumed.controllerEmail,
          controllerRole: "participant",
          issuedBy: consumed.record.issuedBy,
          issuedAt: consumed.record.createdAt,
          pairingExpiresAt: consumed.record.expiresAt,
          activatedAt,
          accessExpiresAt: consumed.accessExpiresAt,
          revokedAt: "",
          revokedBy: "",
        },
        presentation: {
          ...current.presentation,
          enabled: true,
          mode: "follow",
          controllerName: consumed.controllerName,
          controllerRole: "participant",
          controllerGrantId: consumed.grantId,
          controllerLastSeenAt: activatedAt,
          sequence: current.presentation.sequence + 1,
          updatedAt: activatedAt,
        },
        auditLog: [...current.auditLog, audit({ type: "presentation_control_activated", actorName: consumed.controllerName, actorRole: "participant", message: `${consumed.controllerName} aktiválta a közös nézet vezérlését.`, operation: "consume_presentation_pairing" })].slice(-1000),
      }));
      const presentationToken = createMeetingAccessToken(meetingId, "teams-presentation-controller", { ttlSeconds: presentationAccessTtlSeconds(), grantId: consumed.grantId, subjectName: consumed.controllerName, subjectEmail: consumed.controllerEmail });
      return NextResponse.json({ ok: true, presentationToken, ...publicControl(updated) });
    }

    if (body.operation === "reclaim") {
      if (!isOrganizer) return NextResponse.json({ ok: false, error: "A közös nézet vezérlését csak a szervező veheti vissza azonnal." }, { status: 403 });
      await revokeMeetingPresentationPairingCode(meetingId);
      const actorName = text(body.actorName, 160) || workspace.organizerName || "Szervező";
      const now = new Date().toISOString();
      const updated = await updateMeetingWorkspace(meetingId, (current) => ({
        ...current,
        presentationControl: { ...current.presentationControl, status: "revoked", grantId: "", revokedAt: now, revokedBy: actorName },
        presentation: { ...current.presentation, enabled: true, mode: "follow", controllerName: actorName, controllerRole: "organizer", controllerGrantId: "", controllerLastSeenAt: now, sequence: current.presentation.sequence + 1, updatedAt: now },
        auditLog: [...current.auditLog, audit({ type: "presentation_control_reclaimed", actorName, actorRole: "organizer", message: `${actorName} azonnal visszavette a közös nézet vezérlését.`, operation: "reclaim_presentation_control" })].slice(-1000),
      }));
      return NextResponse.json({ ok: true, ...publicControl(updated) });
    }

    if (body.operation === "release") {
      if (!isOrganizer && !isEditor && !isController) return NextResponse.json({ ok: false, error: "Nincs aktív közösnézet-vezérlési jogosultság." }, { status: 403 });
      if (isController) await revokeMeetingPresentationPairingCode(meetingId);
      const actorName = text(body.actorName, 160) || (isController ? workspace.presentationControl.controllerName : isEditor ? workspace.editorAccess.editorName : workspace.organizerName) || "Előadó";
      const now = new Date().toISOString();
      const updated = await updateMeetingWorkspace(meetingId, (current) => ({
        ...current,
        presentationControl: { ...current.presentationControl, status: "revoked", grantId: "", revokedAt: now, revokedBy: actorName },
        presentation: { ...current.presentation, enabled: false, mode: "fixed", controllerGrantId: "", controllerLastSeenAt: now, sequence: current.presentation.sequence + 1, updatedAt: now },
        auditLog: [...current.auditLog, audit({ type: "presentation_control_released", actorName, actorRole: isOrganizer ? "organizer" : isEditor ? "editor" : "participant", message: `${actorName} elengedte a közös nézet vezérlését.`, operation: "release_presentation_control" })].slice(-1000),
      }));
      return NextResponse.json({ ok: true, ...publicControl(updated) });
    }

    if (body.operation !== "update_state") return NextResponse.json({ ok: false, error: "Ismeretlen prezentációs művelet." }, { status: 400 });
    if (!isOrganizer && !isEditor && !isController) return NextResponse.json({ ok: false, error: "A közös nézetet csak az aktuális vezérlő módosíthatja." }, { status: 403 });
    const grantId = isController ? tokenPayload?.grantId || "" : "";
    if (workspace.presentation.controllerGrantId && workspace.presentation.controllerGrantId !== grantId) return NextResponse.json({ ok: false, error: "A közös nézetet jelenleg másik személy vezérli. A szervező a visszavétel művelettel veheti át az irányítást." }, { status: 409 });
    const actorRole: MeetingViewRole = isOrganizer ? "organizer" : isEditor ? "editor" : "participant";
    const actorName = text(body.actorName, 160) || (isOrganizer ? workspace.organizerName : isEditor ? workspace.editorAccess.editorName : workspace.presentationControl.controllerName) || "Előadó";
    const mode: MeetingPresentationMode = ["follow", "document", "fixed"].includes(String(body.mode || "")) ? body.mode as MeetingPresentationMode : workspace.presentation.mode;
    const now = new Date().toISOString();
    const updated = await updateMeetingWorkspace(meetingId, (current) => ({
      ...current,
      presentation: {
        ...current.presentation,
        enabled: typeof body.enabled === "boolean" ? body.enabled : current.presentation.enabled,
        mode,
        activeSectionId: text(body.activeSectionId, 180) || current.presentation.activeSectionId,
        activeAgendaItemId: text(body.activeAgendaItemId, 180) || current.presentation.activeAgendaItemId,
        activeAttachmentId: text(body.activeAttachmentId, 180),
        documentAnchor: text(body.documentAnchor, 180),
        scrollTop: Math.max(0, Number(body.scrollTop || 0)),
        controllerName: actorName,
        controllerRole: actorRole,
        controllerGrantId: grantId,
        controllerLastSeenAt: now,
        sequence: current.presentation.sequence + 1,
        updatedAt: now,
      },
    }));
    return NextResponse.json({ ok: true, ...publicControl(updated) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A prezentációs vezérlés kezelése sikertelen." }, { status: 400 });
  }
}
