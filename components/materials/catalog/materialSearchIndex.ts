import type { MaterialVerificationStatus } from "@/components/materials/domain/materialPropertyTypes";
import type { MaterialKind } from "@/components/materials/domain/materialTypes";
import type { MaterialCatalogEntry } from "@/components/materials/domain/materialTypes";

export type MaterialSearchFilters = {
  query?: string;
  categoryId?: string;
  kind?: MaterialKind;
  verificationStatus?: MaterialVerificationStatus;
  lambdaMin?: number;
  lambdaMax?: number;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("hu-HU").trim();
}

export function searchMaterialCatalog(entries: MaterialCatalogEntry[], filters: MaterialSearchFilters = {}) {
  const query = normalize(filters.query || "");
  return entries.filter(({ material, version }) => {
    if (filters.categoryId && material.categoryId !== filters.categoryId) return false;
    if (filters.kind && material.kind !== filters.kind) return false;
    if (filters.verificationStatus && version.verificationStatus !== filters.verificationStatus) return false;
    const lambda = version.designLambdaWmK?.value ?? version.declaredLambdaWmK?.value;
    if (filters.lambdaMin !== undefined && (lambda === undefined || lambda < filters.lambdaMin)) return false;
    if (filters.lambdaMax !== undefined && (lambda === undefined || lambda > filters.lambdaMax)) return false;
    if (!query) return true;
    const haystack = normalize([
      material.productName,
      material.productCode,
      material.manufacturerName,
      material.categoryId,
      ...material.alternateNames,
    ].filter(Boolean).join(" "));
    return haystack.includes(query);
  });
}

export function findMaterialEntry(entries: MaterialCatalogEntry[], materialId: string, versionId?: string) {
  return entries.find(({ material, version }) => material.id === materialId && (!versionId || version.id === versionId)) || null;
}
