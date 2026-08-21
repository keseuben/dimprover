import type { CommercePermission } from "./types";

const ALL_PERMISSIONS: CommercePermission[] = [
  "commerce.context.read",
  "commerce.product.read",
  "commerce.product.write",
  "commerce.identifier.write",
  "commerce.media.read",
  "commerce.media.write",
  "commerce.inventory.read",
  "commerce.inventory.move",
  "commerce.inventory.adjust",
  "commerce.receiving.read",
  "commerce.receiving.write",
  "commerce.receiving.post",
  "commerce.order.read",
  "commerce.order.write",
  "commerce.order.pay",
  "commerce.order.issue",
  "commerce.order.reconcile",
];

const MANAGER_PERMISSIONS: CommercePermission[] = ALL_PERMISSIONS.filter(
  (permission) => permission !== "commerce.inventory.adjust",
);

const USER_PERMISSIONS: CommercePermission[] = [
  "commerce.context.read",
  "commerce.product.read",
  "commerce.media.read",
  "commerce.inventory.read",
  "commerce.receiving.read",
  "commerce.order.read",
];

const GUEST_PERMISSIONS: CommercePermission[] = [
  "commerce.context.read",
  "commerce.product.read",
];

const CASHIER_PERMISSIONS: CommercePermission[] = ["commerce.context.read","commerce.product.read","commerce.media.read","commerce.inventory.read","commerce.order.read","commerce.order.pay"];
const GOODS_RECORDER_PERMISSIONS: CommercePermission[] = ["commerce.context.read","commerce.product.read","commerce.media.read","commerce.inventory.read","commerce.order.read","commerce.order.write"];
const WAREHOUSE_ISSUER_PERMISSIONS: CommercePermission[] = ["commerce.context.read","commerce.product.read","commerce.media.read","commerce.inventory.read","commerce.order.read","commerce.order.issue"];
const MIRROR_WORKER_PERMISSIONS: CommercePermission[] = [
  "commerce.context.read",
  "commerce.product.read",
  "commerce.inventory.read",
  "commerce.inventory.move",
  "commerce.order.read",
  "commerce.order.write",
  "commerce.order.pay",
  "commerce.order.issue",
  "commerce.order.reconcile",
];

export function resolveCommercePermissions(roleCode: string): CommercePermission[] {
  switch (roleCode.trim().toUpperCase()) {
    case "OWNER":
    case "ADMIN":
      return [...ALL_PERMISSIONS];
    case "MANAGER":
    case "STORE_MANAGER":
      return [...MANAGER_PERMISSIONS];
    case "CASHIER":
      return [...CASHIER_PERMISSIONS];
    case "GOODS_RECORDER":
      return [...GOODS_RECORDER_PERMISSIONS];
    case "WAREHOUSE_ISSUER":
      return [...WAREHOUSE_ISSUER_PERMISSIONS];
    case "COMMERCE_MIRROR_WORKER":
      return [...MIRROR_WORKER_PERMISSIONS];
    case "USER":
    case "MEMBER":
      return [...USER_PERMISSIONS];
    case "GUEST":
    case "VIEWER":
      return [...GUEST_PERMISSIONS];
    default:
      return ["commerce.context.read"];
  }
}

export function hasCommercePermission(
  permissions: readonly CommercePermission[],
  required: CommercePermission,
) {
  return permissions.includes(required);
}
