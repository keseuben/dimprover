import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  authorizeMeetingRequest,
  createMeetingAccessToken,
  meetingTokenAllowsOrganizer,
  meetingTokenIsEditor,
} from "@/app/lib/meeting-assistant/access";
import {
  consumeMeetingEditorPairingCode,
  createMeetingEditorPairingCode,
  editorAccessTtlSeconds,
  revokeMeetingEditorPairingCode,
} from "@/app/lib/meeting-assistant/editor-pairing";
import { requireMeetingAssistantEntitlement } from "@/app/lib/meeting-assistant/entitlements";
import {
  readMeetingWorkspace,
  sanitizeMeetingId,
  updateMeetingWorkspace,
} from "@/app/lib/meeting-assistant/store";
import type { MeetingAccessTokenPayload } from "@/app/lib/meeting-assistant/access";
import type { MeetingAuditEvent, MeetingViewRole, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EditorAccessOperation = "create" | "consume" | "revoke" | "leave";

type EditorAccessRequest = {
  operation?: EditorAccessOperation;
  meetingId?: string;
  accessToken?: string;
  code?: string;
  recipientName?: string;
  recipientEmail?: string;
  editorName?: string;
  editorEmail?: string;
  actorName?: string;
};

function text(value: unknown, max = 400) {
  return String(value ?? "").trim().slice(0, max);
}

function auditEvent(input: {
  type: string;
  actorName: string;
  actorRole: MeetingViewRole | "system";
  message: string;
  operation: string;
}): MeetingAuditEvent {
  return {
    id: `audit-${randomUUID()}`,
    type: input.type,
    at: new Date().toISOString(),
    actorName: text(input.actorName, 160) || "Rendszer",
    actorRole: input.actorRole,
    message: text(input.message, 1000),
    operation: input.operation,
  };
}

function organizerAuthorized(
  auth: Awaited<ReturnType<typeof authorizeMeetingRequest>>,
) {
  return auth.ok && (auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload)));
}

function editorAuthorized(payload: MeetingAccessTokenPayload | null | undefined, workspace: MeetingWorkspace) {
  if (!meetingTokenIsEditor(payload)) return false;
  if (workspace.editorAccess.status !== "active") return false;
  if (!workspace.editorAccess.grantId || payload?.grantId !== workspace.editorAccess.grantId) return false;
  if (!workspace.editorAccess.accessExpiresAt) return false;
  return new Date(workspace.editorAccess.accessExpiresAt).getTime() > Date.now();
}

export async function POST(request: Request) {
  try {
    const entitlement = await requireMeetingAssistantEntitlement();
    const body = (await request.json().catch(() => null)) as EditorAccessRequest | null;
    if (!body?.operation) {
      return NextResponse.json({ ok: false, error: "Hiányzik a szerkesztői jogosultsági művelet." }, { status: 400 });
    }

    const meetingId = sanitizeMeetingId(body.meetingId);
    const auth = await authorizeMeetingRequest(request, meetingId, body.accessToken);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
    const workspace = await readMeetingWorkspace(meetingId);

    if (body.operation === "create") {
      if (!organizerAuthorized(auth)) {
        return NextResponse.json({ ok: false, error: "Csak a szervező adhat át jegyzőkönyv-szerkesztési jogot." }, { status: 403 });
      }
      const issuedBy = text(body.actorName, 160) || workspace.organizerName || "Szervező";
      const pairing = await createMeetingEditorPairingCode({
        meetingId,
        issuedBy,
        recipientName: text(body.recipientName, 160),
        recipientEmail: text(body.recipientEmail, 240),
      });
      const updated = await updateMeetingWorkspace(meetingId, (current) => ({
        ...current,
        editorAccess: {
          ...current.editorAccess,
          status: "pending",
          grantId: "",
          editorName: pairing.recipientName,
          editorEmail: pairing.recipientEmail,
          issuedBy,
          issuedAt: new Date().toISOString(),
          pairingExpiresAt: pairing.expiresAt,
          activatedAt: "",
          accessExpiresAt: "",
          revokedAt: "",
          revokedBy: "",
        },
        auditLog: [...current.auditLog, auditEvent({
          type: "editor_pairing_created",
          actorName: issuedBy,
          actorRole: "organizer",
          message: pairing.recipientName
            ? `Szerkesztői párosítókód létrehozva ${pairing.recipientName} részére.`
            : "Szerkesztői párosítókód létrehozva.",
          operation: "create_editor_pairing",
        })].slice(-1000),
      }));
      return NextResponse.json({
        ok: true,
        entitlement,
        pairing,
        editorAccess: { ...updated.editorAccess, grantId: "" },
      });
    }

    if (body.operation === "consume") {
      const consumed = await consumeMeetingEditorPairingCode({
        meetingId,
        code: body.code || "",
        editorName: text(body.editorName, 160),
        editorEmail: text(body.editorEmail, 240),
      });
      if (!consumed.ok) return NextResponse.json({ ok: false, error: consumed.error }, { status: 400 });

      const activatedAt = new Date().toISOString();
      const updated = await updateMeetingWorkspace(meetingId, (current) => ({
        ...current,
        editorAccess: {
          status: "active",
          grantId: consumed.grantId,
          editorName: consumed.editorName,
          editorEmail: consumed.editorEmail,
          issuedBy: consumed.record.issuedBy,
          issuedAt: consumed.record.createdAt,
          pairingExpiresAt: consumed.record.expiresAt,
          activatedAt,
          accessExpiresAt: consumed.accessExpiresAt,
          revokedAt: "",
          revokedBy: "",
        },
        auditLog: [...current.auditLog, auditEvent({
          type: "editor_access_activated",
          actorName: consumed.editorName,
          actorRole: "editor",
          message: `${consumed.editorName} aktiválta a jegyzőkönyv-szerkesztői módot.`,
          operation: "consume_editor_pairing",
        })].slice(-1000),
      }));

      const editorAccessToken = createMeetingAccessToken(meetingId, "teams-meeting-editor", {
        ttlSeconds: editorAccessTtlSeconds(),
        grantId: consumed.grantId,
        subjectName: consumed.editorName,
        subjectEmail: consumed.editorEmail,
      });
      return NextResponse.json({
        ok: true,
        entitlement,
        role: "editor",
        editorAccessToken,
        editorAccess: { ...updated.editorAccess, grantId: "" },
      });
    }

    const tokenPayload = auth.mode === "token" ? auth.payload : null;
    const isOrganizer = organizerAuthorized(auth);
    const isEditor = editorAuthorized(tokenPayload, workspace);
    if (body.operation === "revoke" && !isOrganizer) {
      return NextResponse.json({ ok: false, error: "Csak a szervező vonhatja vissza a szerkesztési jogot." }, { status: 403 });
    }
    if (body.operation === "leave" && !isEditor) {
      return NextResponse.json({ ok: false, error: "Nincs aktív szerkesztői jogosultság." }, { status: 403 });
    }

    await revokeMeetingEditorPairingCode(meetingId);
    const actorRole: MeetingViewRole = isOrganizer ? "organizer" : "editor";
    const actorName = text(body.actorName, 160)
      || (isOrganizer ? workspace.organizerName : workspace.editorAccess.editorName)
      || (isOrganizer ? "Szervező" : "Jegyzőkönyv-szerkesztő");
    const updated = await updateMeetingWorkspace(meetingId, (current) => ({
      ...current,
      editorAccess: {
        ...current.editorAccess,
        status: "revoked",
        grantId: "",
        revokedAt: new Date().toISOString(),
        revokedBy: actorName,
      },
      auditLog: [...current.auditLog, auditEvent({
        type: isOrganizer ? "editor_access_revoked" : "editor_access_left",
        actorName,
        actorRole,
        message: isOrganizer
          ? `${actorName} visszavonta a jegyzőkönyv-szerkesztési jogot.`
          : `${actorName} elhagyta a jegyzőkönyv-szerkesztői módot.`,
        operation: body.operation === "revoke" ? "revoke_editor_access" : "leave_editor_access",
      })].slice(-1000),
    }));
    return NextResponse.json({
      ok: true,
      entitlement,
      role: isOrganizer ? "organizer" : "participant",
      editorAccess: { ...updated.editorAccess, grantId: "" },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "A szerkesztői jogosultság kezelése sikertelen." },
      { status: 400 },
    );
  }
}
