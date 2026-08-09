import type { AruterPublicProduct } from "./publicOfferData";

export type AruterPublicReservationStatus = "new" | "confirmed" | "preparing" | "ready" | "picked_up" | "cancelled";

export type AruterPublicReservation = {
  id: string;
  businessSlug: string;
  productId: string;
  productName: string;
  productDescription: string;
  productPrice: number;
  productUnit: string;
  quantity: number;
  pickupSlotId: string;
  pickupSlotLabel: string;
  customerName: string;
  phone: string;
  email?: string;
  note?: string;
  acceptedPrivacy: boolean;
  status: AruterPublicReservationStatus;
  createdAt: string;
};

export type CreateAruterPublicReservationInput = {
  businessSlug: string;
  product: Pick<AruterPublicProduct, "id" | "name" | "description" | "price" | "unit">;
  quantity: number;
  pickupSlotId: string;
  pickupSlotLabel: string;
  customerName: string;
  phone: string;
  email?: string;
  note?: string;
  acceptedPrivacy: boolean;
};

export function validatePublicReservationInput(input: Partial<CreateAruterPublicReservationInput>) {
  if (!input.businessSlug) return "Hiányzik az üzlet azonosítója.";
  if (!input.product?.id) return "Hiányzik a termék.";
  if (!input.quantity || input.quantity < 1) return "A mennyiség legalább 1 legyen.";
  if (!input.pickupSlotId || !input.pickupSlotLabel) return "Válassz átvételi idősávot.";
  if (!input.customerName || input.customerName.trim().length < 2) return "Add meg a neved.";
  if (!input.phone || input.phone.trim().length < 6) return "Add meg a telefonszámod.";
  if (!input.acceptedPrivacy) return "Az adatkezelési elfogadás szükséges.";
  return null;
}

export function createPublicReservation(input: CreateAruterPublicReservationInput): AruterPublicReservation {
  return {
    id: `public-res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    businessSlug: input.businessSlug,
    productId: input.product.id,
    productName: input.product.name,
    productDescription: input.product.description,
    productPrice: input.product.price,
    productUnit: input.product.unit,
    quantity: input.quantity,
    pickupSlotId: input.pickupSlotId,
    pickupSlotLabel: input.pickupSlotLabel,
    customerName: input.customerName.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || undefined,
    note: input.note?.trim() || undefined,
    acceptedPrivacy: input.acceptedPrivacy,
    status: "new",
    createdAt: new Date().toISOString(),
  };
}
