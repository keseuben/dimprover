import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRIVE_ROOT = path.join(process.cwd(), ".dimprover", "drive", "property-survey");
const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;

function sanitizeSegment(value: unknown, fallback: string) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
  return normalized || fallback;
}

async function getAuthenticatedUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const cookieStore = await cookies();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => undefined,
    },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return Response.json({ ok: false, error: "A DIMPRO Drive mentéshez bejelentkezett DIMPRO felhasználó szükséges." }, { status: 401 });

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_PAYLOAD_BYTES) return Response.json({ ok: false, error: "A DIMPRO munkafájl meghaladja a 25 MB-os Drive MVP korlátot." }, { status: 413 });

    const body = await request.json() as { projectId?: string; surveyId?: string; fileName?: string; payload?: unknown };
    const payload = body.payload as { schema?: string; fileType?: string; revision?: { number?: number } } | undefined;
    if (!payload?.schema?.startsWith("dimpro.property-survey.") || payload.fileType !== "DIMPRO_SURVEY_WORKFILE") {
      return Response.json({ ok: false, error: "Érvénytelen DIMPRO Felmérő munkafájl." }, { status: 400 });
    }

    const serialized = JSON.stringify(payload, null, 2);
    if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) return Response.json({ ok: false, error: "A DIMPRO munkafájl meghaladja a 25 MB-os Drive MVP korlátot." }, { status: 413 });

    const userId = sanitizeSegment(user.id, "user");
    const projectId = sanitizeSegment(body.projectId, "projectless");
    const surveyId = sanitizeSegment(body.surveyId, "survey");
    const requestedFileName = sanitizeSegment(body.fileName, `dimpro_felmeres_v${String(payload.revision?.number || 1).padStart(3, "0")}.dimpro`);
    const fileName = requestedFileName.toLowerCase().endsWith(".dimpro") ? requestedFileName : `${requestedFileName}.dimpro`;
    const directory = path.join(DRIVE_ROOT, userId, projectId, surveyId);
    const targetPath = path.join(directory, fileName);
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;

    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, targetPath);

    const relativePath = path.relative(path.join(process.cwd(), ".dimprover", "drive"), targetPath).split(path.sep).join("/");
    return Response.json({ ok: true, relativePath, fileName, revisionNumber: payload.revision?.number || null, savedAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "A DIMPRO Drive mentés sikertelen." }, { status: 500 });
  }
}
