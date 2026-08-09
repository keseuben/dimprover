import { NextResponse } from "next/server";
import { getAruterRepository } from "@/app/lib/aruter/repositoryFactory";
import type { CreateAruterPublicReservationInput } from "@/app/lib/aruter/publicReservation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const businessSlug = searchParams.get("businessSlug") ?? undefined;
  const reservations = await getAruterRepository().listPublicReservations(businessSlug);

  return NextResponse.json({
    ok: true,
    data: reservations,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Partial<CreateAruterPublicReservationInput> | null;

  if (!body) {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }

  const result = await getAruterRepository().createPublicReservation(body);

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result, { status: 201 });
}