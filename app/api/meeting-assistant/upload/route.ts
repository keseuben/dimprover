import { randomUUID } from "node:crypto";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer, meetingTokenIsEditor } from "@/app/lib/meeting-assistant/access";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import Busboy from "busboy";
import { NextResponse } from "next/server";
import {
  appendMeetingAttachments,
  getMeetingUploadDir,
  readMeetingWorkspace,
  sanitizeMeetingId,
} from "@/app/lib/meeting-assistant/store";
import type { MeetingAttachment, MeetingViewRole } from "@/app/lib/meeting-assistant/types";
import { requireMeetingAssistantEntitlement } from "@/app/lib/meeting-assistant/entitlements";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function cleanFileName(value: string) {
  const base = path.basename(value || "fajl");
  return base
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180) || "fajl";
}

function extensionOf(fileName: string) {
  return path.extname(fileName).replace(/^\./, "").toLowerCase();
}

function formatMb(bytes: number) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

export async function POST(request: Request) {
  try {
    await requireMeetingAssistantEntitlement();
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A modul nem érhető el." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "Multipart fájlfeltöltés szükséges." }, { status: 415 });
  }
  if (!request.body) {
    return NextResponse.json({ ok: false, error: "A feltöltési kérés üres." }, { status: 400 });
  }

  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const actorName = String(url.searchParams.get("actorName") || "Résztvevő").trim().slice(0, 160) || "Résztvevő";
  const roleParam = url.searchParams.get("role");
  const requestedRole: MeetingViewRole = roleParam === "organizer" ? "organizer" : roleParam === "editor" ? "editor" : "participant";
  const auth = await authorizeMeetingRequest(request, meetingId);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  const workspace = await readMeetingWorkspace(meetingId);
  const organizerAuthorized = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  const editorAuthorized = auth.mode === "token"
    && meetingTokenIsEditor(auth.payload)
    && workspace.editorAccess.status === "active"
    && workspace.editorAccess.grantId === auth.payload.grantId
    && Boolean(workspace.editorAccess.accessExpiresAt)
    && new Date(workspace.editorAccess.accessExpiresAt).getTime() > Date.now();
  const role: MeetingViewRole = requestedRole === "organizer" && organizerAuthorized
    ? "organizer"
    : requestedRole === "editor" && editorAuthorized
      ? "editor"
      : "participant";

  if (requestedRole === "editor" && role !== "editor") {
    return NextResponse.json({ ok: false, error: "A jegyzőkönyv-szerkesztői jogosultság lejárt vagy visszavonták." }, { status: 403 });
  }

  if (role === "participant" && !workspace.settings.participantUploadsEnabled) {
    return NextResponse.json({ ok: false, error: "A résztvevői feltöltés ennél az értekezletnél ki van kapcsolva." }, { status: 403 });
  }

  const maxBytes = workspace.settings.maxFileSizeBytes;
  const allowed = new Set(workspace.settings.allowedExtensions.map((item) => item.toLowerCase()));
  const uploadDir = getMeetingUploadDir(meetingId);
  await mkdir(uploadDir, { recursive: true });

  const attachments: MeetingAttachment[] = [];
  const fileJobs: Promise<void>[] = [];
  const errors: string[] = [];

  const busboy = Busboy({
    headers: Object.fromEntries(request.headers.entries()),
    limits: {
      fileSize: maxBytes,
      files: 10,
      fields: 20,
      parts: 30,
    },
  });

  busboy.on("file", (_fieldName, file, info) => {
    const originalName = cleanFileName(info.filename);
    const extension = extensionOf(originalName);
    const isZip = extension === "zip";

    if (!extension || !allowed.has(extension)) {
      errors.push(`${originalName}: ez a fájltípus nem engedélyezett.`);
      file.resume();
      return;
    }
    if (isZip && !workspace.settings.zipUploadEnabled) {
      errors.push(`${originalName}: ZIP feltöltés ennél az értekezletnél nincs engedélyezve.`);
      file.resume();
      return;
    }

    const id = `file-${randomUUID()}`;
    const storedName = `${id}-${originalName}`;
    const filePath = path.join(uploadDir, storedName);
    let truncated = false;
    let sizeBytes = 0;

    file.on("data", (chunk: Buffer) => {
      sizeBytes += chunk.length;
    });
    file.on("limit", () => {
      truncated = true;
    });

    const job = pipeline(file, createWriteStream(filePath, { flags: "wx" }))
      .then(async () => {
        if (truncated || sizeBytes > maxBytes) {
          await unlink(filePath).catch(() => undefined);
          errors.push(`${originalName}: meghaladja a ${formatMb(maxBytes)} MB-os maximális méretet.`);
          return;
        }
        attachments.push({
          id,
          meetingId,
          originalName,
          storedName,
          mimeType: info.mimeType || "application/octet-stream",
          sizeBytes,
          extension,
          isZip,
          uploadedAt: new Date().toISOString(),
          uploadedBy: actorName,
          status: role === "organizer" && !workspace.settings.requireOrganizerApproval ? "approved" : "pending",
          caption: "",
        });
      })
      .catch(async (error) => {
        await unlink(filePath).catch(() => undefined);
        errors.push(`${originalName}: ${error instanceof Error ? error.message : "feltöltési hiba"}`);
      });

    fileJobs.push(job);
  });

  const parsePromise = new Promise<void>((resolve, reject) => {
    busboy.on("finish", resolve);
    busboy.on("error", reject);
    busboy.on("filesLimit", () => errors.push("Egyszerre legfeljebb 10 fájl tölthető fel."));
  });

  try {
    Readable.fromWeb(request.body as never).pipe(busboy);
    await parsePromise;
    await Promise.all(fileJobs);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "A fájlfeltöltés feldolgozása sikertelen." },
      { status: 400 },
    );
  }

  if (attachments.length > 0) {
    await appendMeetingAttachments(meetingId, attachments);
  }

  return NextResponse.json({
    ok: attachments.length > 0,
    attachments,
    errors,
    maxFileSizeBytes: maxBytes,
    allowedExtensions: [...allowed],
    message: attachments.length > 0
      ? role === "participant"
        ? `A szervező megkapta a feltöltést (${attachments.length} fájl). Jóváhagyás után a kép vagy melléklet minden résztvevő felületén megjelenik.`
        : `${attachments.length} fájl az értekezleti bejövőbe került.`
      : "Nem került feltöltésre elfogadott fájl.",
  }, { status: attachments.length > 0 ? 200 : 400 });
}
