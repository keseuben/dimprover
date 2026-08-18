import type { CommerceEntityId, CommerceLifecycle, OrganizationScoped } from "../core/types";

export type ProductStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type ProductIdentifierType = "EAN_GTIN" | "DIMPRO_QR" | "DIMPRO_BARCODE" | "SKU" | "SUPPLIER_SKU";
export type UnitOfMeasure = "DB" | "KG" | "G" | "M" | "M2" | "M3" | "FM" | "L" | "CSOMAG" | "PAR" | "KESZLET";

export type Category = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  name: string;
  slug: string;
  parentId?: CommerceEntityId | null;
  sortOrder: number;
  active: boolean;
};

export type Brand = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  name: string;
  active: boolean;
};

export type Manufacturer = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  name: string;
  active: boolean;
};

export type Product = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  name: string;
  slug: string;
  description?: string | null;
  typeModel?: string | null;
  categoryId?: CommerceEntityId | null;
  brandId?: CommerceEntityId | null;
  manufacturerId?: CommerceEntityId | null;
  status: ProductStatus;
};

export type ProductVariant = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  productId: CommerceEntityId;
  name: string;
  sku?: string | null;
  unit: UnitOfMeasure;
  status: ProductStatus;
  attributes: Record<string, string | number | boolean | null>;
};

export type ProductIdentifier = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  productId: CommerceEntityId;
  variantId?: CommerceEntityId | null;
  type: ProductIdentifierType;
  value: string;
  normalizedValue: string;
  primary: boolean;
};
