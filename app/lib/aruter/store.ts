"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { aruterOrders, aruterProducts, aruterRealtimeEvents } from "./mockData";
import type { AruterCartItem, AruterOrder, AruterOrderStatus, AruterProduct, AruterRealtimeEvent, AruterTemplate } from "./types";

type AruterStore = {
  selectedTemplate: AruterTemplate;
  customerName: string;
  products: AruterProduct[];
  cartItems: AruterCartItem[];
  orders: AruterOrder[];
  events: AruterRealtimeEvent[];
  setSelectedTemplate: (template: AruterTemplate) => void;
  setCustomerName: (name: string) => void;
  addProductToCart: (productId: string) => void;
  updateCartQuantity: (cartItemId: string, quantity: number) => void;
  removeCartItem: (cartItemId: string) => void;
  clearCart: () => void;
  sendCartToCashier: () => AruterOrder | null;
  markOrderPaid: (orderId: string) => void;
  markOrderIssued: (orderId: string) => void;
  resetDemoState: () => void;
  getCartGrossTotal: () => number;
};

const defaultState = {
  selectedTemplate: "kertészet" as AruterTemplate,
  customerName: "Kovácsné",
  products: aruterProducts,
  cartItems: [] as AruterCartItem[],
  orders: aruterOrders,
  events: aruterRealtimeEvents,
};

function productToCartItem(product: AruterProduct): AruterCartItem {
  return {
    id: `cart-${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    unit: product.unit,
    quantity: 1,
    priceNet: product.priceNet,
    vatRate: product.vatRate,
    storageZone: product.storageZone,
  };
}

function getItemGrossTotal(item: AruterCartItem) {
  return item.quantity * item.priceNet * (1 + item.vatRate / 100);
}

function createEvent(input: Omit<AruterRealtimeEvent, "id" | "createdAt">): AruterRealtimeEvent {
  return {
    ...input,
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
}

function nextOrderNumber(orderCount: number) {
  return `AR-2026-${String(orderCount + 1).padStart(4, "0")}`;
}

export const useAruterStore = create<AruterStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      setSelectedTemplate: (template) => set({ selectedTemplate: template }),
      setCustomerName: (name) => set({ customerName: name }),

      addProductToCart: (productId) => {
        const product = get().products.find((item) => item.id === productId);
        if (!product) return;

        set((state) => {
          const existing = state.cartItems.find((item) => item.productId === productId);
          if (existing) {
            return {
              cartItems: state.cartItems.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item),
            };
          }
          return { cartItems: [...state.cartItems, productToCartItem(product)] };
        });
      },

      updateCartQuantity: (cartItemId, quantity) => {
        if (quantity <= 0) {
          set((state) => ({ cartItems: state.cartItems.filter((item) => item.id !== cartItemId) }));
          return;
        }

        set((state) => ({
          cartItems: state.cartItems.map((item) => item.id === cartItemId ? { ...item, quantity: Math.max(0.1, quantity) } : item),
        }));
      },

      removeCartItem: (cartItemId) => {
        set((state) => ({ cartItems: state.cartItems.filter((item) => item.id !== cartItemId) }));
      },

      clearCart: () => set({ cartItems: [] }),

      sendCartToCashier: () => {
        const state = get();
        if (state.cartItems.length === 0) return null;

        const orderNumber = nextOrderNumber(state.orders.length);
        const order: AruterOrder = {
          id: `ord-${Date.now()}`,
          orderNumber,
          template: state.selectedTemplate,
          status: "sent_to_cashier",
          customerName: state.customerName || "Helyszíni vásárló",
          customerType: "walk_in",
          recorderName: "Árutéri dolgozó",
          items: state.cartItems,
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

        set((current) => ({
          orders: [order, ...current.orders],
          events: [event, ...current.events],
          cartItems: [],
        }));

        return order;
      },

      markOrderPaid: (orderId) => {
        const order = get().orders.find((item) => item.id === orderId);
        set((state) => ({
          orders: state.orders.map((item) => item.id === orderId ? { ...item, status: "paid" as AruterOrderStatus, cashierName: "Pénztáros", paymentMethod: "card", paidAt: new Date().toISOString() } : item),
          events: [
            createEvent({
              type: "payment_registered",
              orderId,
              orderNumber: order?.orderNumber,
              title: "Fizetés rögzítve",
              description: "A rendelés kiadásra vár.",
            }),
            ...state.events,
          ],
        }));
      },

      markOrderIssued: (orderId) => {
        const order = get().orders.find((item) => item.id === orderId);
        set((state) => ({
          orders: state.orders.map((item) => item.id === orderId ? { ...item, status: "issued" as AruterOrderStatus, issuerName: "Kiadó dolgozó", issuedAt: new Date().toISOString() } : item),
          events: [
            createEvent({
              type: "goods_issued",
              orderId,
              orderNumber: order?.orderNumber,
              title: "Áru kiadva",
              description: "A fizetett rendelés lezárva.",
            }),
            ...state.events,
          ],
        }));
      },

      resetDemoState: () => {
        set({ ...defaultState });
      },

      getCartGrossTotal: () => get().cartItems.reduce((sum, item) => sum + getItemGrossTotal(item), 0),
    }),
    {
      name: "dimpro-aruter-mvp-store-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedTemplate: state.selectedTemplate,
        customerName: state.customerName,
        products: state.products,
        cartItems: state.cartItems,
        orders: state.orders,
        events: state.events,
      }),
      version: 1,
    },
  ),
);

export function getOrderGrossTotal(order: AruterOrder) {
  return order.items.reduce((sum, item) => sum + getItemGrossTotal(item), 0);
}

export function getOrderNetTotal(order: AruterOrder) {
  return order.items.reduce((sum, item) => sum + item.quantity * item.priceNet, 0);
}

export function getOrderVatTotal(order: AruterOrder) {
  return getOrderGrossTotal(order) - getOrderNetTotal(order);
}
