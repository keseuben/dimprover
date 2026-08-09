import type { MaterialPropertyValue } from "@/components/materials/domain/materialPropertyTypes";
import type { MaterialSourcePackage } from "@/components/materials/domain/materialSourceTypes";
import type { MaterialCatalog, MaterialCatalogEntry } from "@/components/materials/domain/materialTypes";
import developmentMaterialData from "@/components/materials/catalog/data/developmentMaterials.json";

export const DEVELOPMENT_MATERIAL_CATALOG_VERSION = "MAT-0.2-demo-2026-07-29";
const createdAt = "2026-07-29T00:00:00.000Z";

export const developmentMaterialSourcePackage: MaterialSourcePackage = {
  id: "source-dimpro-development-materials-v1",
  name: "DIMPRO belső fejlesztési tesztanyagok",
  sourceType: "userFile",
  publisher: "DIMPRO fejlesztés",
  documentTitle: "MAT-0.2 fiktív tesztkatalógus",
  documentVersion: DEVELOPMENT_MATERIAL_CATALOG_VERSION,
  documentDate: "2026-07-29",
  licenseStatus: "internalOnly",
  licenseReference: "Kizárólag automatikus tesztelésre; energetikai számításhoz és publikálásra nem használható.",
  redistributionAllowed: false,
  commercialUseAllowed: false,
  attributionRequired: false,
  importedBy: "DIMPRO development seed",
  importedAt: createdAt,
};

export const developmentMaterialCatalog: MaterialCatalog = {
  id: "catalog-dimpro-development-materials",
  name: "DIMPRO fejlesztési anyagkatalógus",
  scope: "importStaging",
  sourcePackageId: developmentMaterialSourcePackage.id,
  status: "draft",
  createdAt,
  updatedAt: createdAt,
};


type SeedInput = {
  id: string;
  categoryId: string;
  name: string;
  lambda: number;
  density: number;
  specificHeat: number;
  mu: number;
  thickness?: number;
  aliases?: string[];
};

function property(value: number, unit: string, note: string): MaterialPropertyValue {
  return { value, unit, verified: false, note };
}

function seed(input: SeedInput): MaterialCatalogEntry {
  const materialId = `material-demo-${input.id}`;
  const versionId = `${materialId}-v1`;
  const warning = "Fiktív fejlesztési érték; szakmai számításhoz nem használható.";
  return {
    material: {
      id: materialId,
      catalogId: developmentMaterialCatalog.id,
      kind: "generic",
      categoryId: input.categoryId,
      productName: `Fejlesztési minta – ${input.name}`,
      productCode: `DEMO-${input.id.toUpperCase()}`,
      alternateNames: input.aliases || [],
      currentVersionId: versionId,
      publicationStatus: "draft",
      visibility: "private",
      createdAt,
      updatedAt: createdAt,
    },
    version: {
      id: versionId,
      materialId,
      versionNumber: 1,
      densityKgM3: property(input.density, "kg/m3", warning),
      specificHeatJkgK: property(input.specificHeat, "J/(kgK)", warning),
      designLambdaWmK: property(input.lambda, "W/(mK)", warning),
      vaporResistanceFactorMu: property(input.mu, "-", warning),
      defaultThicknessMm: input.thickness,
      rawProperties: { developmentOnly: true, warning },
      sourcePackageId: developmentMaterialSourcePackage.id,
      verificationStatus: "unverified",
      createdAt,
    },
  };
}

export const genericMaterialCatalog: MaterialCatalogEntry[] = developmentMaterialData.items.map((item) => seed({
  id: item.id,
  categoryId: item.categoryId,
  name: item.name,
  lambda: item.lambdaWmK,
  density: item.densityKgM3,
  specificHeat: item.specificHeatJkgK,
  mu: item.mu,
  thickness: item.defaultThicknessMm,
}));
