import type { AruterPublicReservation, AruterPublicReservationStatus, CreateAruterPublicReservationInput } from "./publicReservation";
import type { AruterOrder, AruterOrderStatus, AruterProduct, AruterRealtimeEvent } from "./types";

export type AruterRepositoryResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export type AruterRepository = {
  listProducts: () => Promise<AruterProduct[]> | AruterProduct[];
  listOrders: () => Promise<AruterOrder[]> | AruterOrder[];
  listEvents: () => Promise<AruterRealtimeEvent[]> | AruterRealtimeEvent[];
  listPublicReservations: (businessSlug?: string) => Promise<AruterPublicReservation[]> | AruterPublicReservation[];
  createPublicReservation: (input: Partial<CreateAruterPublicReservationInput>) => Promise<AruterRepositoryResult<AruterPublicReservation>> | AruterRepositoryResult<AruterPublicReservation>;
  updatePublicReservationStatus: (reservationId: string, status: AruterPublicReservationStatus) => Promise<AruterRepositoryResult<AruterPublicReservation>> | AruterRepositoryResult<AruterPublicReservation>;
  createOrder: (input: Pick<AruterOrder, "template" | "customerName" | "customerType" | "recorderName" | "items"> & Partial<Pick<AruterOrder, "note" | "pickupTime">>) => Promise<AruterRepositoryResult<AruterOrder>> | AruterRepositoryResult<AruterOrder>;
  updateOrderStatus: (orderId: string, status: AruterOrderStatus) => Promise<AruterRepositoryResult<AruterOrder>> | AruterRepositoryResult<AruterOrder>;
  reset?: () => Promise<AruterRepositoryResult<unknown>> | AruterRepositoryResult<unknown>;
};
