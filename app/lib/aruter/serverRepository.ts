import { aruterOrders, aruterProducts, aruterRealtimeEvents } from "./mockData";
import { createPublicReservation, validatePublicReservationInput, type AruterPublicReservation, type AruterPublicReservationStatus, type CreateAruterPublicReservationInput } from "./publicReservation";
import type { AruterOrder, AruterOrderStatus, AruterProduct, AruterRealtimeEvent } from "./types";

export type AruterApiResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

type AruterServerState = {
  products: AruterProduct[];
  orders: AruterOrder[];
  events: AruterRealtimeEvent[];
  publicReservations: AruterPublicReservation[];
};

let serverState: AruterServerState = {
  products: [...aruterProducts],
  orders: [...aruterOrders],
  events: [...aruterRealtimeEvents],
  publicReservations: [],
};

function createEvent(input: Omit<AruterRealtimeEvent, "id" | "createdAt">): AruterRealtimeEvent {
  return {
    ...input,
    id: `api-evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
}

function nextOrderNumber(orderCount: number) {
  return `AR-2026-${String(orderCount + 1).padStart(4, "0")}`;
}

function getStatusEventType(status: AruterOrderStatus): AruterRealtimeEvent["type"] {
  if (status === "issued") return "goods_issued";
  if (status === "paid") return "payment_registered";
  return "cart_sent";
}

export const aruterRepository = {
  listProducts(): AruterProduct[] {
    return serverState.products;
  },

  listOrders(): AruterOrder[] {
    return serverState.orders;
  },

  listEvents(): AruterRealtimeEvent[] {
    return serverState.events;
  },

  listPublicReservations(businessSlug?: string): AruterPublicReservation[] {
    if (!businessSlug) return serverState.publicReservations;
    return serverState.publicReservations.filter((reservation) => reservation.businessSlug === businessSlug);
  },

  createPublicReservation(input: Partial<CreateAruterPublicReservationInput>): AruterApiResult<AruterPublicReservation> {
    const validationError = validatePublicReservationInput(input);
    if (validationError) return { ok: false, error: validationError };

    const reservation = createPublicReservation(input as CreateAruterPublicReservationInput);
    const event = createEvent({
      type: "cart_sent",
      orderId: reservation.id,
      orderNumber: reservation.id,
      title: "Nyilvános foglalás érkezett",
      description: `${reservation.customerName} · ${reservation.quantity} ${reservation.productUnit} ${reservation.productName} · ${reservation.pickupSlotLabel}`,
    });

    serverState = {
      ...serverState,
      publicReservations: [reservation, ...serverState.publicReservations],
      events: [event, ...serverState.events],
    };

    return { ok: true, data: reservation };
  },

  updatePublicReservationStatus(reservationId: string, status: AruterPublicReservationStatus): AruterApiResult<AruterPublicReservation> {
    const reservation = serverState.publicReservations.find((item) => item.id === reservationId);

    if (!reservation) {
      return { ok: false, error: "A foglalás nem található." };
    }

    const updatedReservation: AruterPublicReservation = {
      ...reservation,
      status,
    };

    const event = createEvent({
      type: "cart_sent",
      orderId: updatedReservation.id,
      orderNumber: updatedReservation.id,
      title: "Foglalás státusz módosítva",
      description: `${updatedReservation.customerName} · ${updatedReservation.productName} · ${status}`,
    });

    serverState = {
      ...serverState,
      publicReservations: serverState.publicReservations.map((item) => item.id === reservationId ? updatedReservation : item),
      events: [event, ...serverState.events],
    };

    return { ok: true, data: updatedReservation };
  },

  createOrder(input: Pick<AruterOrder, "template" | "customerName" | "customerType" | "recorderName" | "items"> & Partial<Pick<AruterOrder, "note" | "pickupTime">>): AruterApiResult<AruterOrder> {
    if (!input.items || input.items.length === 0) {
      return { ok: false, error: "A rendelés legalább egy tételt tartalmazzon." };
    }

    const orderNumber = nextOrderNumber(serverState.orders.length);
    const order: AruterOrder = {
      id: `api-ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      orderNumber,
      template: input.template,
      status: "sent_to_cashier",
      customerName: input.customerName || "Helyszíni vásárló",
      customerType: input.customerType,
      recorderName: input.recorderName,
      pickupTime: input.pickupTime,
      note: input.note,
      items: input.items,
      createdAt: new Date().toISOString(),
      sentToCashierAt: new Date().toISOString(),
    };

    const event = createEvent({
      type: "cart_sent",
      orderId: order.id,
      orderNumber,
      title: "Kosár pénztárra küldve",
      description: `${order.items.length} tétel · ${order.customerName}`,
    });

    serverState = {
      ...serverState,
      orders: [order, ...serverState.orders],
      events: [event, ...serverState.events],
    };

    return { ok: true, data: order };
  },

  updateOrderStatus(orderId: string, status: AruterOrderStatus): AruterApiResult<AruterOrder> {
    const order = serverState.orders.find((item) => item.id === orderId);

    if (!order) {
      return { ok: false, error: "A rendelés nem található." };
    }

    const now = new Date().toISOString();
    const updatedOrder: AruterOrder = {
      ...order,
      status,
      paidAt: status === "paid" ? now : order.paidAt,
      issuedAt: status === "issued" ? now : order.issuedAt,
    };

    const event = createEvent({
      type: getStatusEventType(status),
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      title: status === "issued" ? "Áru kiadva" : status === "paid" ? "Fizetés rögzítve" : "Rendelés státusz módosítva",
      description: `Új státusz: ${status}`,
    });

    serverState = {
      ...serverState,
      orders: serverState.orders.map((item) => item.id === orderId ? updatedOrder : item),
      events: [event, ...serverState.events],
    };

    return { ok: true, data: updatedOrder };
  },

  reset(): AruterApiResult<AruterServerState> {
    serverState = {
      products: [...aruterProducts],
      orders: [...aruterOrders],
      events: [...aruterRealtimeEvents],
      publicReservations: [],
    };

    return { ok: true, data: serverState };
  },
};