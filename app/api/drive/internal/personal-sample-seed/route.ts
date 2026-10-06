import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { type NextRequest, NextResponse } from "next/server";
import { authQuery } from "@/app/lib/dimpro-auth/db";
import { ensurePersonalDriveCanonicalUser } from "@/app/lib/content-core/personalIdentity";
import { ensureUserContentRef, findContentObjectByHash, upsertContentObject } from "@/app/lib/content-core/repository";
import { buildPersonalDriveStorageKey, putDriveObjectStream } from "@/app/lib/drive-core/s3ObjectStorage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SeedAuthRow = { id: string; email_normalized: string; display_name: string | null };

const SAMPLE_SPECS = [
  { fileName: "A-101_Foldszinti_alaprajz_REV00.pdf", planNo: "A-101", title: "Foldszinti alaprajz", discipline: "EPITESZET", scale: "M 1:100", revision: "Rev. 0", variant: "arch" },
  { fileName: "G-201_Gepeszeti_alaprajz_REV01.pdf", planNo: "G-201", title: "Gepeszeti alaprajz", discipline: "GEPESZET", scale: "M 1:50", revision: "Rev. 1", variant: "mech" },
  { fileName: "V-301_Villamos_alaprajz_REV02.pdf", planNo: "V-301", title: "Villamos alaprajz", discipline: "VILLAMOSSAG", scale: "M 1:50", revision: "Rev. 2", variant: "elec" },
] as const;

function isInternalDevRequest(request: NextRequest) {
  const host = (request.headers.get("host") || "").trim().toLowerCase();
  const loopback = /^127\.0\.0\.1:\d+$/.test(host) || /^localhost:\d+$/.test(host);
  return loopback
    && process.env.DIMPRO_PRODUCTION_ACCESS?.trim().toUpperCase() === "DENY"
    && process.env.DIMPRO_AUTH_ENVIRONMENT?.trim().toUpperCase() === "DEV";
}

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function makeSamplePdf(spec: typeof SAMPLE_SPECS[number]) {
  const width = 1191;
  const height = 842;
  const ops: string[] = [
    "0.15 0.22 0.30 RG 0.8 w 34 34 1123 774 re S",
    "0.55 0.65 0.72 RG 0.5 w 34 105 m 1157 105 l S",
    "34 34 m 34 105 l S", "350 34 m 350 105 l S", "760 34 m 760 105 l S", "985 34 m 985 105 l S",
  ];
  const ox = 80, oy = 155, pw = 930, ph = 560;
  ops.push(`0.18 0.28 0.38 RG 1.2 w ${ox} ${oy} ${pw} ${ph} re S`);
  for (const x of [ox + 250, ox + 510, ox + 730]) ops.push(`0.18 0.28 0.38 RG 0.6 w ${x} ${oy} m ${x} ${oy + ph} l S`);
  for (const y of [oy + 205, oy + 405]) ops.push(`0.18 0.28 0.38 RG 0.6 w ${ox} ${y} m ${ox + pw} ${y} l S`);
  if (spec.variant === "arch") {
    for (let i = 0; i < 8; i++) { const x = ox + 30 + i * 105; ops.push(`0.15 0.45 0.75 RG 0.8 w ${x} ${oy + 25} m ${x} ${oy + ph - 25} l S`); }
  } else if (spec.variant === "mech") {
    const pts = [[ox + 45, oy + 75], [ox + 300, oy + 75], [ox + 300, oy + 300], [ox + 675, oy + 300], [ox + 675, oy + 480]];
    for (let i = 0; i < pts.length - 1; i++) ops.push(`0.75 0.20 0.18 RG 2.4 w ${pts[i][0]} ${pts[i][1]} m ${pts[i + 1][0]} ${pts[i + 1][1]} l S`);
  } else {
    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
      const x = ox + 130 + col * 160, y = oy + 100 + row * 165;
      ops.push(`0.18 0.45 0.18 RG 1.3 w ${x - 10} ${y} m ${x + 10} ${y} l S`, `${x} ${y - 10} m ${x} ${y + 10} l S`);
    }
  }
  const texts: Array<[string, number, number, number, string]> = [
    ["F2", 16, 50, 67, "DIMPRO MINTATERV"],
    ["F1", 8, 50, 51, "DEV tesztfajl - Sajat Drive feluletellenorzeshez"],
    ["F2", 11, 380, 82, spec.planNo], ["F1", 9, 380, 63, spec.title], ["F1", 8, 380, 48, spec.discipline],
    ["F2", 10, 790, 76, spec.scale], ["F2", 10, 790, 52, spec.revision], ["F1", 7, 1010, 75, "MINTA"],
    ["F1", 7, 1010, 54, "2026-10-06"], ["F2", 13, 80, 750, `${spec.planNo} - ${spec.title}`],
    ["F1", 8, 80, 732, `${spec.discipline} | ${spec.scale} | ${spec.revision} | DIMPRO DEV mintadokumentum`],
  ];
  for (const [font, size, x, y, text] of texts) ops.push(`0.10 0.16 0.24 rg BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET`);
  ops.push("0.92 g BT /F2 58 Tf 0.82 0.48 -0.48 0.82 330 300 Tm (DIMPRO DEV MINTA) Tj ET");
  const stream = Buffer.from(ops.join("\n"), "ascii");
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"),
    Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from("\nendstream")]),
  ];
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%DIMPRO\n")];
  const offsets: number[] = [0];
  let length = chunks[0].length;
  objects.forEach((object, index) => { offsets.push(length); const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]); chunks.push(chunk); length += chunk.length; });
  const xref = length;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

async function resolveSeedUser(email: string) {
  const result = await authQuery<SeedAuthRow>(
    `SELECT u.id,u.email_normalized,u.display_name
       FROM auth_users u
      WHERE u.email_normalized=$1
        AND u.status='ACTIVE'
        AND u.login_enabled=true
        AND EXISTS (
          SELECT 1 FROM auth_access_grants g
          JOIN auth_roles r ON r.id=g.role_id
          JOIN auth_products p ON p.id=g.product_id
          WHERE g.user_id=u.id AND r.code='DRIVE_PERSONAL_USER' AND p.code='DRIVE'
            AND g.project_id IS NULL AND g.revoked_at IS NULL AND g.valid_from<=now()
            AND (g.valid_until IS NULL OR g.valid_until>=now())
        )
      LIMIT 2`,
    [email],
  );
  if (result.rows.length !== 1) throw new Error("PERSONAL_SAMPLE_SEED_TARGET_NOT_UNIQUE");
  return result.rows[0];
}

export async function POST(request: NextRequest) {
  if (!isInternalDevRequest(request)) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404, headers: { "cache-control": "no-store" } });
  try {
    const body = await request.json().catch(() => ({})) as { email?: unknown };
    const email = normalizeEmail(body.email);
    if (!email) return NextResponse.json({ ok: false, error: "VALID_EMAIL_REQUIRED" }, { status: 400, headers: { "cache-control": "no-store" } });
    const authUser = await resolveSeedUser(email);
    const canonical = await ensurePersonalDriveCanonicalUser({ authUserId: authUser.id, email: authUser.email_normalized, displayName: authUser.display_name });
    const results: Array<{ name: string; created: boolean }> = [];
    for (const spec of SAMPLE_SPECS) {
      const pdf = makeSamplePdf(spec);
      const sha256 = createHash("sha256").update(pdf).digest("hex");
      let object = await findContentObjectByHash({ sha256, sizeBytes: pdf.length });
      let created = false;
      if (!object) {
        const storageKey = buildPersonalDriveStorageKey({ userId: canonical.id, uploadId: sha256, fileName: spec.fileName });
        const stored = await putDriveObjectStream({ storageKey, body: Readable.from([pdf]), contentType: "application/pdf", contentLength: pdf.length, metadata: { "dimpro-source": "dev-personal-sample", "dimpro-scope": "personal" } });
        object = await upsertContentObject({ sha256, sizeBytes: pdf.length, mimeType: "application/pdf", originalName: spec.fileName, displayName: spec.fileName, storageBucket: stored.bucket, storageKey: stored.storageKey, sourceSystem: "IMPORT", sourceObjectId: `DEV_SAMPLE_PDF_20261006:${spec.fileName}` });
        created = true;
      }
      await ensureUserContentRef({ contentObjectId: object.id, userId: canonical.id, sourceSystem: "IMPORT", sourceRef: `DEV_SAMPLE_PDF_20261006:${spec.fileName}`, displayName: spec.fileName });
      results.push({ name: spec.fileName, created });
    }
    return NextResponse.json({ ok: true, seeded: results.length, files: results }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "PERSONAL_SAMPLE_SEED_FAILED" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
