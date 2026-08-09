import { NextRequest, NextResponse } from "next/server";
import {
  archiveDevNote,
  createDevNote,
  filterDevNotes,
  getDevNoteOptions,
  getDevNotesFilePath,
  readDevNoteStore,
  removeDevNote,
  restoreDevNote,
  toDevNoteLite,
  updateDevNote,
  type DevNoteDraft,
} from "@/app/lib/license/dev-notes";
import {
  getLicenseAdminKeyFilePath,
  isLicenseAdminAuthorized,
} from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a Fejlesztési Napló API használatához.",
      adminKeyHint: getLicenseAdminKeyFilePath(),
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function buildListResponse(request: NextRequest) {
  const store = await readDevNoteStore();
  const searchParams = request.nextUrl.searchParams;
  const notes = filterDevNotes(store.notes, {
    search: searchParams.get("search") ?? "",
    type: searchParams.get("type") ?? "all",
    status: searchParams.get("status") ?? "all",
    module: searchParams.get("module") ?? "all",
    priority: searchParams.get("priority") ?? "all",
    surface: searchParams.get("surface") ?? "all",
    epic: searchParams.get("epic") ?? "all",
    includeArchived: searchParams.get("includeArchived") === "1",
  });

  return {
    ok: true,
    store: { ...store, notes },
    allCount: store.notes.length,
    filteredCount: notes.length,
    activeCount: store.notes.filter((note) => note.status !== "archived").length,
    archivedCount: store.notes.filter((note) => note.status === "archived").length,
    options: getDevNoteOptions(store.notes),
    allNotes: store.notes.map(toDevNoteLite),
    storage: {
      file: getDevNotesFilePath(),
    },
  };
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  return jsonResponse(await buildListResponse(request));
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  try {
    const body = (await request.json()) as {
      action?: string;
      noteId?: string;
      draft?: DevNoteDraft;
    };

    const action = body.action ?? "";
    const noteId = body.noteId ?? "";
    const draft = body.draft ?? {};

    let result;
    if (action === "create") {
      result = await createDevNote(draft);
    } else if (action === "update") {
      if (!noteId) return jsonResponse({ ok: false, error: "Hiányzik a bejegyzés azonosítója." }, 400);
      result = await updateDevNote(noteId, draft);
    } else if (action === "archive") {
      if (!noteId) return jsonResponse({ ok: false, error: "Hiányzik a bejegyzés azonosítója." }, 400);
      result = await archiveDevNote(noteId);
    } else if (action === "restore") {
      if (!noteId) return jsonResponse({ ok: false, error: "Hiányzik a bejegyzés azonosítója." }, 400);
      result = await restoreDevNote(noteId);
    } else if (action === "remove") {
      if (!noteId) return jsonResponse({ ok: false, error: "Hiányzik a bejegyzés azonosítója." }, 400);
      result = await removeDevNote(noteId);
    } else {
      return jsonResponse({ ok: false, error: "Ismeretlen fejlesztési napló művelet." }, 400);
    }

    const requestUrl = new URL(request.url);
    const listRequest = new NextRequest(requestUrl, { headers: request.headers });
    const list = await buildListResponse(listRequest);

    return jsonResponse({
      ...list,
      affectedNote: result.note,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ismeretlen fejlesztési napló hiba.",
      },
      500,
    );
  }
}
