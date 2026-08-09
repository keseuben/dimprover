import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEETING_DATA_ROOT } from "./store";

const COUNTER_ROOT = path.join(MEETING_DATA_ROOT, "counters");

function safePart(value: string, fallback: string) {
  const normalized = String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function reserveProjectMeetingNumber(input: {
  projectCode: string;
  meetingTypeCode: string;
  year?: number;
}) {
  const projectCode = String(input.projectCode || "PROJEKT").trim().slice(0, 120) || "PROJEKT";
  const displayTypeCode = String(input.meetingTypeCode || "ÁLT").trim().slice(0, 40) || "ÁLT";
  const year = Number.isFinite(input.year) ? Number(input.year) : new Date().getFullYear();
  const key = `${safePart(projectCode, "PROJEKT")}-${safePart(displayTypeCode, "ALT")}-${year}`;
  const counterFile = path.join(COUNTER_ROOT, `${key}.json`);
  const lockFile = path.join(COUNTER_ROOT, `${key}.lock`);
  await mkdir(COUNTER_ROOT, { recursive: true });

  let handle: Awaited<ReturnType<typeof open>> | null = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      handle = await open(lockFile, "wx");
      break;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") throw error;
      await sleep(25 + attempt * 5);
    }
  }
  if (!handle) throw new Error("A jegyzőkönyv sorszáma jelenleg nem foglalható le. Próbáld újra.");

  try {
    let current = 0;
    try {
      const parsed = JSON.parse(await readFile(counterFile, "utf8")) as { sequence?: number };
      current = Math.max(0, Number(parsed.sequence || 0));
    } catch {
      current = 0;
    }
    const sequence = current + 1;
    await writeFile(counterFile, `${JSON.stringify({ projectCode, meetingTypeCode: displayTypeCode, year, sequence, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
    return {
      sequence,
      minuteNumber: `${projectCode}/${displayTypeCode}/${year}/${String(sequence).padStart(3, "0")}`,
    };
  } finally {
    await handle.close().catch(() => undefined);
    await import("node:fs/promises").then(({ unlink }) => unlink(lockFile).catch(() => undefined));
  }
}
