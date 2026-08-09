import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { EventStoredData } from "@/components/events/storageTypes";

const DATA_DIR = path.join(process.cwd(), ".data", "events");
const DATA_FILE = path.join(DATA_DIR, "torta.json");

const EMPTY_DATA: EventStoredData = {
  eventMode: "together",
  registrations: [],
  guests: [],
  votes: [
    { title: "Esemény formája", options: ["Egy közös családi esemény", "Két külön esemény legyen"], votes: [0, 0], voters: [[], []] },
    { title: "Időpont", options: ["Aug. 23. szombat", "Aug. 24. vasárnap", "Aug. 30. szombat", "Aug. 31. vasárnap"], votes: [0, 0, 0, 0], voters: [[], [], [], []] },
    { title: "Helyszín", options: ["Mama kertje", "Apuéknál", "Másik családi kert", "Bérelhető helyszín"], votes: [0, 0, 0, 0], voters: [[], [], [], []] },
    { title: "Ajándék", options: ["Családi fotóalbum", "Emlékkönyv", "Közös élmény", "Egyéb ötlet"], votes: [0, 0, 0, 0], voters: [[], [], [], []] },
    { title: "Ha külön lesz – Mama időpontja", options: ["Aug. 23. szombat", "Aug. 24. vasárnap", "Aug. 30. szombat", "Aug. 31. vasárnap"], votes: [0, 0, 0, 0], voters: [[], [], [], []] },
    { title: "Ha külön lesz – Apu időpontja", options: ["Aug. 23. szombat", "Aug. 24. vasárnap", "Aug. 30. szombat", "Aug. 31. vasárnap"], votes: [0, 0, 0, 0], voters: [[], [], [], []] },
    { title: "Ha külön lesz – helyszín", options: ["Mama kertje", "Apuéknál", "Másik családi kert", "Bérelhető helyszín"], votes: [0, 0, 0, 0], voters: [[], [], [], []] },
  ],
  bringItems: [],
  messages: [],
  familyTreeNotes: [],
  familyTreePeople: [
    { id: 1, name: "Mama", nickname: "", relationType: "szulo", relationToMama: "Központi személy", relationToApu: "Édesanya", level: "center", column: 0, highlightedFor: "mama", locked: true, createdAt: new Date().toISOString(), createdByFullName: "Rendszer" },
    { id: 2, name: "Apu", nickname: "", relationType: "gyermek", relationToMama: "Fia", relationToApu: "Központi személy", level: "center", column: 1, highlightedFor: "apu", locked: true, createdAt: new Date().toISOString(), createdByFullName: "Rendszer" },
  ],
  intro: "",
  quote: "",
  updatedAt: new Date().toISOString(),
};

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readEventData(): Promise<EventStoredData> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<EventStoredData>;
    return {
      ...EMPTY_DATA,
      ...parsed,
      registrations: Array.isArray(parsed.registrations) ? parsed.registrations : [],
      guests: Array.isArray(parsed.guests) ? parsed.guests : [],
      votes: Array.isArray(parsed.votes) && parsed.votes.length ? parsed.votes : EMPTY_DATA.votes,
      bringItems: Array.isArray(parsed.bringItems) ? parsed.bringItems : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      familyTreeNotes: Array.isArray(parsed.familyTreeNotes) ? parsed.familyTreeNotes : [],
      familyTreePeople: Array.isArray(parsed.familyTreePeople) && parsed.familyTreePeople.length ? parsed.familyTreePeople : EMPTY_DATA.familyTreePeople,
    };
  } catch {
    return EMPTY_DATA;
  }
}

export async function GET() {
  const data = await readEventData();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<EventStoredData>;
  const current = await readEventData();
  const nextData: EventStoredData = {
    ...current,
    ...payload,
    registrations: Array.isArray(payload.registrations) ? payload.registrations : current.registrations,
    guests: Array.isArray(payload.guests) ? payload.guests : current.guests,
    votes: Array.isArray(payload.votes) ? payload.votes : current.votes,
    bringItems: Array.isArray(payload.bringItems) ? payload.bringItems : current.bringItems,
    messages: Array.isArray(payload.messages) ? payload.messages : current.messages,
    familyTreeNotes: Array.isArray(payload.familyTreeNotes) ? payload.familyTreeNotes : current.familyTreeNotes,
    familyTreePeople: Array.isArray(payload.familyTreePeople) ? payload.familyTreePeople : current.familyTreePeople,
    updatedAt: new Date().toISOString(),
  };

  await ensureDataDir();
  await writeFile(DATA_FILE, JSON.stringify(nextData, null, 2), "utf8");

  return NextResponse.json({ ok: true, data: nextData });
}