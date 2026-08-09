import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CalendarEvent } from "./types";

type CalendarStore = { events: CalendarEvent[] };

const calendarDataFile = path.join(
  process.cwd(),
  ".dimprover",
  "data",
  "calendar-events.json",
);

const globalCalendarStore = globalThis as typeof globalThis & {
  dimproverCalendarStore?: CalendarStore;
};

export async function readCalendarFileStore(initialEvents: CalendarEvent[]) {
  if (globalCalendarStore.dimproverCalendarStore) {
    return globalCalendarStore.dimproverCalendarStore;
  }

  try {
    const raw = await readFile(calendarDataFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<CalendarStore>;
    if (Array.isArray(parsed.events)) {
      globalCalendarStore.dimproverCalendarStore = { events: parsed.events };
      return globalCalendarStore.dimproverCalendarStore;
    }
  } catch {
    // Első induláskor még nincs fájl; ilyenkor a mintaeseményeket mentjük el.
  }

  globalCalendarStore.dimproverCalendarStore = { events: [...initialEvents] };
  await writeCalendarFileStore(globalCalendarStore.dimproverCalendarStore);
  return globalCalendarStore.dimproverCalendarStore;
}

export async function writeCalendarFileStore(store: CalendarStore) {
  await mkdir(path.dirname(calendarDataFile), { recursive: true });
  await writeFile(
    calendarDataFile,
    `${JSON.stringify(store, null, 2)}\n`,
    "utf8",
  );
  globalCalendarStore.dimproverCalendarStore = store;
}

export function getCalendarDataFilePath() {
  return calendarDataFile;
}
