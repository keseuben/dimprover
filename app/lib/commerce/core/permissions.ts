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
];

const MANAGER_PERMISSIONS: CommercePermission[] = ALL_PERMISSIONS.filter(
  (permission) => permission !== "commerce.inventory.adjust",
);

const USER_PERMISSIONS: CommercePermission[] = [
  "commerce.context.read",
  "commerce.product.read",
  "commerce.media.read",
  "commerce.inventory.read",
];

const GUEST_PERMISSIONS: CommercePermission[] = [
  "commerce.context.read",
  "commerce.product.read",
];

export function resolveCommercePermissions(roleCode: string): CommercePermission[] {
  switch (roleCode.trim().toUpperCase()) {
    case "OWNER":
    case "ADMIN":
      return [...ALL_PERMISSIONS];
    case "MANAGER":
    case "STORE_MANAGER":
      return [...MANAGER_PERMISSIONS];
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
