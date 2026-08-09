import type { MaterialSourcePackage } from "@/components/materials/domain/materialSourceTypes";
import type { MaterialCatalog, MaterialCatalogEntry, MaterialRecord } from "@/components/materials/domain/materialTypes";
import type { MaterialPropertyValue, MaterialVersion } from "@/components/materials/domain/materialPropertyTypes";

export const MATERIAL_WORKSPACE_SCHEMA_VERSION = 1 as const;

export type MaterialWorkspaceState = {
  schemaVersion: typeof MATERIAL_WORKSPACE_SCHEMA_VERSION;
  projectCatalog: MaterialCatalog;
  projectMaterials: MaterialCatalogEntry[];
  sourcePackages: MaterialSourcePackage[];
  favoriteIds: string[];
  recentIds: string[];
  updatedAt: string;
};

export type CreateProjectMaterialInput = {
  name: string;
  categoryId: string;
  lambdaWmK: number;
  densityKgM3?: number;
  specificHeatJkgK?: number;
  mu?: number;
  defaultThicknessMm?: number;
  sourceNote: string;
};

function workspaceId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function property(value: number | undefined, unit: string, note: string): MaterialPropertyValue | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? { value, unit, verified: false, note } : undefined;
}

export function createDefaultMaterialWorkspace(projectReference = "local"): MaterialWorkspaceState {
  const now = new Date().toISOString();
  return {
    schemaVersion: MATERIAL_WORKSPACE_SCHEMA_VERSION,
    projectCatalog: {
      id: `catalog-project-${projectReference}`,
      name: "Projekt saját anyagai",
      scope: "project",
      projectId: projectReference,
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    projectMaterials: [],
    sourcePackages: [],
    favoriteIds: [],
    recentIds: [],
    updatedAt: now,
  };
}

export function normalizeMaterialWorkspace(input?: Partial<MaterialWorkspaceState> | null, projectReference = "local"): MaterialWorkspaceState {
  const base = createDefaultMaterialWorkspace(projectReference);
  return {
    schemaVersion: MATERIAL_WORKSPACE_SCHEMA_VERSION,
    projectCatalog: { ...base.projectCatalog, ...(input?.projectCatalog || {}), id: input?.projectCatalog?.id || base.projectCatalog.id, updatedAt: input?.projectCatalog?.updatedAt || base.projectCatalog.updatedAt },
    projectMaterials: Array.isArray(input?.projectMaterials) ? input.projectMaterials.filter((entry) => Boolean(entry?.material?.id && entry?.version?.id)) : [],
    sourcePackages: Array.isArray(input?.sourcePackages) ? input.sourcePackages.filter((source) => Boolean(source?.id)) : [],
    favoriteIds: Array.isArray(input?.favoriteIds) ? [...new Set(input.favoriteIds.filter(Boolean))] : [],
    recentIds: Array.isArray(input?.recentIds) ? [...new Set(input.recentIds.filter(Boolean))].slice(0, 20) : [],
    updatedAt: input?.updatedAt || base.updatedAt,
  };
}

export function createProjectCustomMaterial(workspace: MaterialWorkspaceState, input: CreateProjectMaterialInput): { workspace: MaterialWorkspaceState; entry: MaterialCatalogEntry } {
  if (!input.name.trim()) throw new Error("A saját anyag neve kötelező.");
  if (!input.categoryId.trim()) throw new Error("A saját anyag kategóriája kötelező.");
  if (!Number.isFinite(input.lambdaWmK) || input.lambdaWmK <= 0) throw new Error("A saját anyaghoz pozitív λ-érték szükséges.");
  if (!input.sourceNote.trim()) throw new Error("A saját anyag adatforrásának vagy becslési megjegyzésének megadása kötelező.");
  const now = new Date().toISOString();
  const materialId = workspaceId("material-project");
  const versionId = `${materialId}-v1`;
  const sourceId = workspaceId("source-project-user");
  const note = input.sourceNote.trim() || "Felhasználó által megadott, szakmailag nem ellenőrzött projektadat.";
  const source: MaterialSourcePackage = {
    id: sourceId,
    name: `${input.name.trim()} saját adatforrása`,
    sourceType: "userFile",
    documentTitle: "Projekt saját anyagadata",
    licenseStatus: "userOwned",
    licenseReference: note,
    redistributionAllowed: false,
    commercialUseAllowed: false,
    attributionRequired: false,
    importedBy: "DIMPRO Felmérő felhasználó",
    importedAt: now,
  };
  const material: MaterialRecord = {
    id: materialId,
    catalogId: workspace.projectCatalog.id,
    kind: "userDefined",
    categoryId: input.categoryId,
    productName: input.name.trim(),
    productCode: `SAJAT-${materialId.slice(-6).toUpperCase()}`,
    alternateNames: [],
    currentVersionId: versionId,
    publicationStatus: "draft",
    visibility: "project",
    createdAt: now,
    updatedAt: now,
  };
  const version: MaterialVersion = {
    id: versionId,
    materialId,
    versionNumber: 1,
    densityKgM3: property(input.densityKgM3, "kg/m3", note),
    specificHeatJkgK: property(input.specificHeatJkgK, "J/(kgK)", note),
    designLambdaWmK: property(input.lambdaWmK, "W/(mK)", note),
    vaporResistanceFactorMu: property(input.mu, "-", note),
    defaultThicknessMm: input.defaultThicknessMm,
    rawProperties: { userDefined: true, sourceNote: note },
    sourcePackageId: sourceId,
    verificationStatus: "unverified",
    createdAt: now,
  };
  const entry = { material, version };
  return {
    entry,
    workspace: {
      ...workspace,
      projectCatalog: { ...workspace.projectCatalog, updatedAt: now },
      projectMaterials: [...workspace.projectMaterials, entry],
      sourcePackages: [...workspace.sourcePackages, source],
      recentIds: [materialId, ...workspace.recentIds.filter((id) => id !== materialId)].slice(0, 20),
      updatedAt: now,
    },
  };
}

export function copyMaterialToProject(workspace: MaterialWorkspaceState, sourceEntry: MaterialCatalogEntry): { workspace: MaterialWorkspaceState; entry: MaterialCatalogEntry } {
  const lambda = sourceEntry.version.designLambdaWmK?.value ?? sourceEntry.version.declaredLambdaWmK?.value;
  if (!(Number(lambda) > 0)) throw new Error("A másolni kívánt anyagnak nincs pozitív λ-értéke.");
  return createProjectCustomMaterial(workspace, {
    name: `${sourceEntry.material.productName.replace(/^Fejlesztési minta\s*[–-]\s*/i, "")} – saját másolat`,
    categoryId: sourceEntry.material.categoryId,
    lambdaWmK: Number(lambda),
    densityKgM3: sourceEntry.version.densityKgM3?.value,
    specificHeatJkgK: sourceEntry.version.specificHeatJkgK?.value,
    mu: sourceEntry.version.vaporResistanceFactorMu?.value,
    defaultThicknessMm: sourceEntry.version.defaultThicknessMm,
    sourceNote: `Saját projektmásolat a(z) ${sourceEntry.material.productName} rekordból. Az eredeti rekord nem válik központi vagy ellenőrzött adattá.`,
  });
}

export function toggleMaterialFavorite(workspace: MaterialWorkspaceState, materialId: string): MaterialWorkspaceState {
  const favorite = workspace.favoriteIds.includes(materialId);
  return { ...workspace, favoriteIds: favorite ? workspace.favoriteIds.filter((id) => id !== materialId) : [materialId, ...workspace.favoriteIds], updatedAt: new Date().toISOString() };
}

export function markMaterialRecent(workspace: MaterialWorkspaceState, materialId: string): MaterialWorkspaceState {
  return { ...workspace, recentIds: [materialId, ...workspace.recentIds.filter((id) => id !== materialId)].slice(0, 20), updatedAt: new Date().toISOString() };
}
