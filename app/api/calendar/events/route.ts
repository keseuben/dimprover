import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
} from "@/app/lib/calendar/db";
import {
  logCalendarDbFallback,
  shouldFallbackToCalendarFileStore,
} from "@/app/lib/calendar/db-fallback";
import {
  readCalendarFileStore,
  writeCalendarFileStore,
} from "@/app/lib/calendar/file-store";
import { listGoogleCalendarEvents } from "@/app/lib/calendar/google-events";
import { initialCalendarEvents } from "@/components/calendar/calendarInitialEvents";
import type { CalendarEvent } from "@/app/lib/calendar/types";
import { validateCalendarEventInput } from "@/app/lib/calendar/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function shouldUseDatabaseStorage() {
  return process.env.DIMPROVER_CALENDAR_STORAGE === "database";
}

function sortCalendarEvents(events: CalendarEvent[]) {
  return [...events].sort((a, b) => a.start.localeCompare(b.start));
}

export async function GET() {
  if (!shouldUseDatabaseStorage()) {
    return NextResponse.json(
      {
        ok: true,
        events: (await readCalendarFileStore(initialCalendarEvents)).events,
        storage: "file",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const supabase = await createClient();
    const events = await listCalendarEvents(supabase);
    const google = await listGoogleCalendarEvents(supabase);

    return NextResponse.json(
      {
        ok: true,
        events: sortCalendarEvents([...events, ...google.events]),
        storage: "database",
        integrations: {
          google: {
            events: google.events.length,
            errors: google.errors,
          },
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (!shouldFallbackToCalendarFileStore(error)) {
      return jsonError("A naptáresemények adatbázis lekérése sikertelen.", 500);
    }
    logCalendarDbFallback("GET", error);
    return NextResponse.json(
      {
        ok: true,
        events: (await readCalendarFileStore(initialCalendarEvents)).events,
        storage: "file-fallback",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }
}

export async function POST(request: NextRequest) {
  const input = validateCalendarEventInput(
    await request.json().catch(() => null),
  );
  if (!input) return jsonError("Érvénytelen eseményadatok.");

  if (!shouldUseDatabaseStorage()) {
    const event: CalendarEvent = {
      ...input,
      id: `event-${crypto.randomUUID()}`,
    };
    const store = await readCalendarFileStore(initialCalendarEvents);
    const nextStore = { events: [event, ...store.events] };
    await writeCalendarFileStore(nextStore);
    return NextResponse.json(
      { ok: true, event, storage: "file" },
      { status: 201 },
    );
  }

  try {
    const supabase = await createClient();
    const event = await createCalendarEvent(supabase, input);
    return NextResponse.json(
      { ok: true, event, storage: "database" },
      { status: 201 },
    );
  } catch (error) {
    if (!shouldFallbackToCalendarFileStore(error))
      return jsonError("Az esemény adatbázis mentése sikertelen.", 500);
    logCalendarDbFallback("POST", error);
    const event: CalendarEvent = {
      ...input,
      id: `event-${crypto.randomUUID()}`,
    };
    const store = await readCalendarFileStore(initialCalendarEvents);
    const nextStore = { events: [event, ...store.events] };
    await writeCalendarFileStore(nextStore);
    return NextResponse.json(
      { ok: true, event, storage: "file-fallback" },
      { status: 201 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object")
    return jsonError("Érvénytelen kérés.");
  const { id, ...rest } = payload as Partial<CalendarEvent>;
  if (!id) return jsonError("Hiányzó esemény azonosító.");
  const input = validateCalendarEventInput(rest);
  if (!input) return jsonError("Érvénytelen eseményadatok.");

  if (!shouldUseDatabaseStorage()) {
    const store = await readCalendarFileStore(initialCalendarEvents);
    const index = store.events.findIndex((event) => event.id === id);
    if (index === -1) return jsonError("Az esemény nem található.", 404);
    const event: CalendarEvent = { ...input, id };
    const nextStore = {
      events: store.events.map((item) => (item.id === id ? event : item)),
    };
    await writeCalendarFileStore(nextStore);
    return NextResponse.json({ ok: true, event, storage: "file" });
  }

  try {
    const supabase = await createClient();
    const event = await updateCalendarEvent(supabase, id, input);
    return NextResponse.json({ ok: true, event, storage: "database" });
  } catch (error) {
    if (!shouldFallbackToCalendarFileStore(error))
      return jsonError("Az esemény adatbázis módosítása sikertelen.", 500);
    logCalendarDbFallback("PATCH", error);
    const store = await readCalendarFileStore(initialCalendarEvents);
    const index = store.events.findIndex((event) => event.id === id);
    if (index === -1) return jsonError("Az esemény nem található.", 404);
    const event: CalendarEvent = { ...input, id };
    const nextStore = {
      events: store.events.map((item) => (item.id === id ? event : item)),
    };
    await writeCalendarFileStore(nextStore);
    return NextResponse.json({ ok: true, event, storage: "file-fallback" });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return jsonError("Hiányzó esemény azonosító.");

  if (!shouldUseDatabaseStorage()) {
    const store = await readCalendarFileStore(initialCalendarEvents);
    const nextStore = {
      events: store.events.filter((event) => event.id !== id),
    };
    if (nextStore.events.length === store.events.length)
      return jsonError("Az esemény nem található.", 404);
    await writeCalendarFileStore(nextStore);
    return NextResponse.json({ ok: true, id, storage: "file" });
  }

  try {
    const supabase = await createClient();
    await deleteCalendarEvent(supabase, id);
    return NextResponse.json({ ok: true, id, storage: "database" });
  } catch (error) {
    if (!shouldFallbackToCalendarFileStore(error))
      return jsonError("Az esemény adatbázis törlése sikertelen.", 500);
    logCalendarDbFallback("DELETE", error);
    const store = await readCalendarFileStore(initialCalendarEvents);
    const nextStore = {
      events: store.events.filter((event) => event.id !== id),
    };
    if (nextStore.events.length === store.events.length)
      return jsonError("Az esemény nem található.", 404);
    await writeCalendarFileStore(nextStore);
    return NextResponse.json({ ok: true, id, storage: "file-fallback" });
  }
}