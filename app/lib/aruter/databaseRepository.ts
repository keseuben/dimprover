import { createClient } from "@/app/lib/supabase/server";
import { createPublicReservation, validatePublicReservationInput, type AruterPublicReservation, type AruterPublicReservationStatus, type CreateAruterPublicReservationInput } from "./publicReservation";
import type { AruterRepository, AruterRepositoryResult } from "./repositoryTypes";
import type { AruterOrder, AruterProduct, AruterRealtimeEvent } from "./types";

function notConfigured<T>(): AruterRepositoryResult<T> {
  return {
    ok: false,
    error: "Az Árutér adatbázis repository még nincs teljesen bekötve ehhez a művelethez.",
  };
}

function mapPublicReservationRow(row: Record<string, unknown>): AruterPublicReservation {
  return {
    id: String(row.id),
    businessSlug: String(row.business_slug),
    productId: String(row.product_id),
    productName: String(row.product_name),
    productDescription: String(row.product_description ?? ""),
    productPrice: Number(row.product_price ?? 0),
    productUnit: String(row.product_unit),
    quantity: Number(row.quantity ?? 1),
    pickupSlotId: String(row.pickup_slot_id),
    pickupSlotLabel: String(row.pickup_slot_label),
    customerName: String(row.customer_name),
    phone: String(row.phone),
    email: row.email ? String(row.email) : undefined,
    note: row.note ? String(row.note) : undefined,
    acceptedPrivacy: Boolean(row.accepted_privacy),
    status: String(row.status) as AruterPublicReservationStatus,
    createdAt: String(row.created_at),
  };
}

function toPublicReservationInsert(input: CreateAruterPublicReservationInput) {
  const reservation = createPublicReservation(input);

  return {
    business_slug: reservation.businessSlug,
    product_id: reservation.productId,
    product_name: reservation.productName,
    product_description: reservation.productDescription,
    product_price: reservation.productPrice,
    product_unit: reservation.productUnit,
    quantity: reservation.quantity,
    pickup_slot_id: reservation.pickupSlotId,
    pickup_slot_label: reservation.pickupSlotLabel,
    customer_name: reservation.customerName,
    phone: reservation.phone,
    email: reservation.email ?? null,
    note: reservation.note ?? null,
    accepted_privacy: reservation.acceptedPrivacy,
    status: reservation.status,
  };
}

async function createPublicReservationEvent(reservation: AruterPublicReservation) {
  const supabase = await createClient();

  await supabase.from("aruter_realtime_events").insert({
    public_reservation_id: reservation.id,
    type: "public_reservation_created",
    title: "Nyilvános foglalás érkezett",
    description: `${reservation.customerName} · ${reservation.quantity} ${reservation.productUnit} ${reservation.productName} · ${reservation.pickupSlotLabel}`,
  });
}

async function createPublicReservationStatusEvent(reservation: AruterPublicReservation, status: AruterPublicReservationStatus) {
  const supabase = await createClient();

  await supabase.from("aruter_realtime_events").insert({
    public_reservation_id: reservation.id,
    type: "public_reservation_status_changed",
    title: "Foglalás státusz módosítva",
    description: `${reservation.customerName} · ${reservation.productName} · ${status}`,
  });
}

export const aruterDatabaseRepository: AruterRepository = {
  listProducts(): AruterProduct[] {
    return [];
  },

  listOrders(): AruterOrder[] {
    return [];
  },

  listEvents(): AruterRealtimeEvent[] {
    return [];
  },

  async listPublicReservations(businessSlug?: string): Promise<AruterPublicReservation[]> {
    const supabase = await createClient();
    let query = supabase
      .from("aruter_public_reservations")
      .select("*")
      .order("created_at", { ascending: false });

    if (businessSlug) {
      query = query.eq("business_slug", businessSlug);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Árutér public reservations lekérési hiba:", error.message);
      return [];
    }

    return (data ?? []).map((row) => mapPublicReservationRow(row));
  },

  async createPublicReservation(input: Partial<CreateAruterPublicReservationInput>): Promise<AruterRepositoryResult<AruterPublicReservation>> {
    const validationError = validatePublicReservationInput(input);
    if (validationError) return { ok: false, error: validationError };

    const supabase = await createClient();
    const insertRow = toPublicReservationInsert(input as CreateAruterPublicReservationInput);

    const { data, error } = await supabase
      .from("aruter_public_reservations")
      .insert(insertRow)
      .select("*")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "A foglalás adatbázisba mentése nem sikerült." };
    }

    const reservation = mapPublicReservationRow(data);
    await createPublicReservationEvent(reservation);

    return { ok: true, data: reservation };
  },

  async updatePublicReservationStatus(reservationId: string, status: AruterPublicReservationStatus): Promise<AruterRepositoryResult<AruterPublicReservation>> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("aruter_public_reservations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", reservationId)
      .select("*")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "A foglalás státuszának módosítása nem sikerült." };
    }

    const reservation = mapPublicReservationRow(data);
    await createPublicReservationStatusEvent(reservation, status);

    return { ok: true, data: reservation };
  },

  createOrder(): AruterRepositoryResult<AruterOrder> {
    return notConfigured<AruterOrder>();
  },

  updateOrderStatus(): AruterRepositoryResult<AruterOrder> {
    return notConfigured<AruterOrder>();
  },
};
