import { NextResponse, type NextRequest } from "next/server";
import { buildDigestWorkbook } from "@/app/lib/drive-notifications/digestAttachment";
import { DigestAccessDenied, buildAuthorizedUserPreview } from "@/app/lib/drive-notifications/authorizedPreview";
import type { DigestCategory } from "@/app/lib/drive-notifications/digestCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ projectId: string }> };
const noStore = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

export async function GET(request: NextRequest, context: Context) {
  const { projectId } = await context.params;
  const category = request.nextUrl.searchParams.get("category") || "DOCUMENT_CHANGES";
  const format = request.nextUrl.searchParams.get("format") || "json";
  const rawHours = request.nextUrl.searchParams.get("hours") || "168";
  const hours = Number(rawHours);
  if (!["DOCUMENT_CHANGES", "APPROVAL_DECISIONS"].includes(category)
    || !["json", "xlsx"].includes(format)
    || !Number.isInteger(hours) || hours < 1 || hours > 168) {
    return NextResponse.json({ ok: false, error: "Érvénytelen előnézeti paraméter." }, { status: 400, headers: noStore });
  }
  try {
    const preview = await buildAuthorizedUserPreview({
      request, projectId, category: category as DigestCategory, hours,
    });
    if (format === "xlsx") {
      const buffer = buildDigestWorkbook({
        projectTitle: preview.projectTitle, period: preview.since + " – " + new Date().toISOString(),
        recipientLabel: preview.recipientLabel, approvedItems: preview.items,
        accessibleNames: preview.accessibleNames,
      });
      if (!buffer) {
        return NextResponse.json({ ok: false, error: "Ebben az időszakban nincs exportálható, jogosult változás." }, { status: 404, headers: noStore });
      }
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          ...noStore,
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": 'attachment; filename="DIMPRO_Drive_ertesitesi_elonezet.xlsx"',
        },
      });
    }
    return NextResponse.json({
      ok: true, category, since: preview.since, examined: preview.examined,
      truncated: preview.truncated, count: preview.items.length,
      entries: preview.items.map((item) => ({
        eventId: item.eventId,
        kind: item.kind,
        occurredAt: item.occurredAt,
        documentName: preview.accessibleNames.get(item.documentId),
      })),
      note: "Saját jogosultságra szűrt, kézi előnézet. Nem kézbesítés, nem hivatalos jelentés.",
    }, { headers: noStore });
  } catch (error) {
    if (error instanceof DigestAccessDenied) return NextResponse.json({ ok: false, error: error.code }, { status: error.status, headers: noStore });
    return NextResponse.json({ ok: false, error: "A változási előnézet nem érhető el." }, { status: 503, headers: noStore });
  }
}
