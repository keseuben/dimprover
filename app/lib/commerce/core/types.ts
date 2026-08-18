export type CommerceEntityId = string;
export type CommerceUtcTimestamp = string;

export type CommercePermission =
  | "commerce.context.read"
  | "commerce.product.read"
  | "commerce.product.write"
  | "commerce.identifier.write"
  | "commerce.media.read"
  | "commerce.media.write"
  | "commerce.inventory.read"
  | "commerce.inventory.move"
  | "commerce.inventory.adjust";

export type CommerceContext = {
  userId: CommerceEntityId;
  organizationId: CommerceEntityId;
  organizationName: string;
  roleCode: string;
  permissions: CommercePermission[];
  storefrontId?: CommerceEntityId | null;
  warehouseId?: CommerceEntityId | null;
};

export type OrganizationScoped = {
  organizationId: CommerceEntityId;
};

export type CommerceLifecycle = {
  createdAt: CommerceUtcTimestamp;
  updatedAt: CommerceUtcTimestamp;
  archivedAt?: CommerceUtcTimestamp | null;
};
