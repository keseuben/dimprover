import { after, NextResponse } from "next/server";
import { getAruterRepository } from "@/app/lib/aruter/repositoryFactory";
import type { AruterPublicReservationStatus } from "@/app/lib/aruter/publicReservation";
import { syncPublicReservationCancellationFailOpen } from "@/app/lib/aruter/storefrontPilot";

const allowedStatuses: AruterPublicReservationStatus[] = ["new", "confirmed", "preparing", "ready", "picked_up", "cancelled"];

type RouteContext = {
  params: Promise<{
    reservationId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { reservationId } = await context.params;
  const body = await request.json().catch(() => null) as { status?: AruterPublicReservationStatus } | null;

  if (!body?.status || !allowedStatuses.includes(body.status)) {
    return NextResponse.json({ ok: false, error: "Érvénytelen foglalási státusz." }, { status: 400 });
  }

  const result = await getAruterRepository().updatePublicReservationStatus(reservationId, body.status);
  if (!result.ok) {
    return NextResponse.json(result, { status: 404 });
  }

  if (result.data?.status === "cancelled") {
    const reservation = result.data;
    after(async () => {
      await syncPublicReservationCancellationFailOpen(request, reservation);
    });
  }

  return NextResponse.json(result);
}
