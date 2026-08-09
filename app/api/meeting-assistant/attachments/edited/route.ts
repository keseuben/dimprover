import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import {
  authorizeMeetingRequest,
  meetingTokenAllowsOrganizer,
} from "@/app/lib/meeting-assistant/access";
import { requireMeetingAssistantEntitlement } from "@/app/lib/meeting-assistant/entitlements";
import {
  findMeetingAttachment,
  getMeetingUploadDir,
  readMeetingWorkspace,
  sanitizeMeetingId,
  updateMeetingWorkspace,
} from "@/app/lib/meeting-assistant/store";
import type { MeetingAttachment } from "@/app/lib/meeting-assistant/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_EDITED_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_MARKUP_JSON_LENGTH = 2_000_000;

function cleanFileName(value: string) {
  const base = path.basename(value || "ertekezleti_kep_szerkesztett.jpg");
  return base
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180) || "ertekezleti_kep_szerkesztett.jpg";
}

function formText(formData: FormData, key: string, max = 4000) {
  return String(formData.get(key) || "").trim().slice(0, max);
}


export async function POST(request: Request) {
  try {
    await requireMeetingAssistantEntitlement();
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A modul nem érhető el." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "Multipart mentési kérés szükséges." }, { status: 415 });
  }

  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const actorName = String(url.searchParams.get("actorName") || "Szerkesztő").trim().slice(0, 160) || "Szerkesztő";
  const auth = await authorizeMeetingRequest(request, meetingId, url.searchParams.get("accessToken") || "");
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const workspace = await readMeetingWorkspace(meetingId);
  const organizerAuthorized = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  if (!organizerAuthorized) {
    return NextResponse.json({ ok: false, error: "A képre rajzolni, képmetszést készíteni és új képi változatot menteni kizárólag az értekezlet szervezője jogosult." }, { status: 403 });
  }
  if (workspace.status === "published" || workspace.status === "archived") {
    return NextResponse.json({ ok: false, error: "A lezárt értekezlet mellékletei csak újranyitás után szerkeszthetők." }, { status: 409 });
  }

  const formData = await request.formData();
  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) {
    return NextResponse.json({ ok: false, error: "Hiányzik a szerkesztett képfájl." }, { status: 400 });
  }
  if (!fileValue.type.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "A szerkesztett kimenetnek képfájlnak kell lennie." }, { status: 415 });
  }
  if (fileValue.size <= 0 || fileValue.size > MAX_EDITED_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: "A szerkesztett kép üres vagy meghaladja a 30 MB-os mentési korlátot." }, { status: 413 });
  }

  const parentFileId = formText(formData, "parentFileId", 180);
  const parentAttachment = parentFileId ? await findMeetingAttachment(meetingId, parentFileId) : null;
  if (parentFileId && !parentAttachment) {
    return NextResponse.json({ ok: false, error: "Az eredeti melléklet nem található." }, { status: 404 });
  }

  const id = `file-${randomUUID()}`;
  const originalName = cleanFileName(fileValue.name || "ertekezleti_kep_szerkesztett.jpg");
  const storedName = `${id}-${originalName}`;
  const markupStoredName = `${id}-markup.json`;
  const uploadDir = getMeetingUploadDir(meetingId);
  const filePath = path.join(uploadDir, storedName);
  const markupPath = path.join(uploadDir, markupStoredName);
  await mkdir(uploadDir, { recursive: true });

  const markupData = formText(formData, "markupData", MAX_MARKUP_JSON_LENGTH);
  try {
    const bytes = Buffer.from(await fileValue.arrayBuffer());
    await writeFile(filePath, bytes, { flag: "wx" });
    if (markupData) {
      let normalizedMarkup = markupData;
      try {
        normalizedMarkup = `${JSON.stringify(JSON.parse(markupData), null, 2)}\n`;
      } catch {
        normalizedMarkup = `${JSON.stringify({ version: 1, raw: markupData.slice(0, MAX_MARKUP_JSON_LENGTH) }, null, 2)}\n`;
      }
      await writeFile(markupPath, normalizedMarkup, { encoding: "utf8", flag: "wx" });
    }
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    await unlink(markupPath).catch(() => undefined);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A szerkesztett fájl nem menthető." }, { status: 500 });
  }

  const sourceTypeValue = formText(formData, "sourceType", 40);
  const sourceType: NonNullable<MeetingAttachment["sourceType"]> = ["upload", "screen_capture", "pdf_crop", "image_edit"].includes(sourceTypeValue)
    ? sourceTypeValue as NonNullable<MeetingAttachment["sourceType"]>
    : parentAttachment?.mimeType === "application/pdf" ? "pdf_crop" : parentAttachment ? "image_edit" : "screen_capture";
  const sourcePageValue = Number(formText(formData, "sourcePage", 20));
  const now = new Date().toISOString();
  const title = formText(formData, "title", 180) || originalName.replace(/\.[^.]+$/, "");
  const description = formText(formData, "description", 2000);
  const agendaItemId = formText(formData, "agendaItemId", 180) || undefined;

  const attachment: MeetingAttachment = {
    id,
    meetingId,
    originalName,
    storedName,
    mimeType: fileValue.type || "image/jpeg",
    sizeBytes: fileValue.size,
    extension: path.extname(originalName).replace(/^\./, "").toLowerCase() || "jpg",
    isZip: false,
    uploadedAt: now,
    uploadedBy: actorName,
    status: parentAttachment?.status === "shared" ? "shared" : "approved",
    caption: description,
    title,
    description,
    includeInAi: formText(formData, "includeInAi", 10) === "1",
    sourceType,
    parentAttachmentId: parentAttachment?.id,
    sourcePage: Number.isFinite(sourcePageValue) && sourcePageValue > 0 ? Math.floor(sourcePageValue) : undefined,
    editedBy: actorName,
    editedAt: now,
    editorVersion: "meeting-attachment-editor-v0.1.0",
    markupStoredName: markupData ? markupStoredName : undefined,
    agendaItemId,
  };

  try {
    const nextWorkspace = await updateMeetingWorkspace(meetingId, (current) => ({
      ...current,
      attachments: [...current.attachments, attachment],
      auditLog: [...current.auditLog, {
        id: `audit-${randomUUID()}`,
        type: "meeting_attachment_edited",
        at: now,
        actorName,
        actorRole: "organizer" as const,
        message: `${actorName} szerkesztett értekezleti mellékletet mentett: ${title}.`,
        operation: "save_edited_attachment",
      }].slice(-1000),
    }));
    return NextResponse.json({ ok: true, attachment, workspace: nextWorkspace });
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    await unlink(markupPath).catch(() => undefined);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A mellékletadat nem menthető." }, { status: 500 });
  }
}
