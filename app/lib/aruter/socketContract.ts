import type { AruterOrder, AruterRealtimeEvent } from "./types";

export const ARUTER_SOCKET_NAMESPACE = "/aruter";

export const aruterSocketEvents = {
  cartSent: "aruter:cart-sent",
  paymentRegistered: "aruter:payment-registered",
  goodsIssued: "aruter:goods-issued",
  stockChanged: "aruter:stock-changed",
  orderUpdated: "aruter:order-updated",
} as const;

export type AruterSocketEventName = (typeof aruterSocketEvents)[keyof typeof aruterSocketEvents];

export type AruterSocketMessage = {
  eventName: AruterSocketEventName;
  shopId: string;
  payload: {
    order?: AruterOrder;
    realtimeEvent: AruterRealtimeEvent;
  };
};

export const aruterSocketRooms = {
  shop: (shopId: string) => `aruter:shop:${shopId}`,
  cashier: (shopId: string) => `aruter:shop:${shopId}:cashier`,
  goodsRecorder: (shopId: string) => `aruter:shop:${shopId}:goods-recorder`,
  issuer: (shopId: string) => `aruter:shop:${shopId}:issuer`,
};
