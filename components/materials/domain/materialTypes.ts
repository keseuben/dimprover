import type { MaterialVersion } from "@/components/materials/domain/materialPropertyTypes";

export type MaterialCatalogScope = "dimproCentral" | "organization" | "user" | "project" | "importStaging";
export type MaterialKind = "generic" | "manufacturerProduct" | "userDefined";
export type MaterialPublicationStatus = "draft" | "reviewRequired" | "approved" | "published" | "deprecated" | "withdrawn";
export type MaterialVisibility = "private" | "organization" | "project" | "public";

export type MaterialCatalog = {
  id: string;
  name: string;
  scope: MaterialCatalogScope;
  organizationId?: string;
  ownerUserId?: string;
  projectId?: string;
  sourcePackageId?: string;
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type MaterialRecord = {
  id: string;
  catalogId: string;
  kind: MaterialKind;
  categoryId: string;
  subcategoryId?: string;
  manufacturerId?: string;
  manufacturerName?: string;
  productName: string;
  productCode?: string;
  alternateNames: string[];
  currentVersionId: string;
  publicationStatus: MaterialPublicationStatus;
  visibility: MaterialVisibility;
  createdAt: string;
  updatedAt: string;
};

export type MaterialCatalogEntry = {
  material: MaterialRecord;
  version: MaterialVersion;
};
