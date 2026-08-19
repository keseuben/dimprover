export type AruterTemplate = "kertészet" | "tüzép" | "húsbolt" | "egyedi";

export type AruterOrderStatus =
  | "draft"
  | "sent_to_cashier"
  | "paid"
  | "issued"
  | "cancelled";

export type AruterUnit = "db" | "kg" | "m" | "m2" | "m3" | "raklap" | "csomag" | "zsák" | "láda";

export type AruterPaymentMethod = "cash" | "card" | "transfer" | "later";

export type AruterUserRole =
  | "admin"
  | "goods_recorder"
  | "cashier"
  | "warehouse_issuer"
  | "loyal_customer";

export type AruterProduct = {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  template: AruterTemplate;
  unit: AruterUnit;
  priceNet: number;
  vatRate: number;
  stockQuantity: number;
  storageZone: string;
  barcode?: string;
  isPublicOffer?: boolean;
  isActive: boolean;
};

export type AruterCartItem = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: AruterUnit;
  quantity: number;
  priceNet: number;
  vatRate: number;
  storageZone: string;
};

export type AruterOrder = {
  id: string;
  orderNumber: string;
  template: AruterTemplate;
  status: AruterOrderStatus;
  customerName: string;
  customerType: "walk_in" | "loyal_customer" | "contractor";
  recorderName: string;
  cashierName?: string;
  issuerName?: string;
  paymentMethod?: AruterPaymentMethod;
  pickupTime?: string;
  note?: string;
  items: AruterCartItem[];
  createdAt: string;
  sentToCashierAt?: string;
  paidAt?: string;
  issuedAt?: string;
};

export type AruterRealtimeEvent = {
  id: string;
  type: "cart_created" | "cart_sent" | "payment_registered" | "goods_issued" | "stock_changed";
  orderId?: string;
  orderNumber?: string;
  title: string;
  description: string;
  createdAt: string;
};

export type AruterSocketPayload = {
  event: AruterRealtimeEvent;
  order?: AruterOrder;
};

export type AruterFeatureFlag = {
  key: string;
  label: string;
  enabledInMvp: boolean;
  phase: 1 | 2 | 3 | 4 | 5;
};
