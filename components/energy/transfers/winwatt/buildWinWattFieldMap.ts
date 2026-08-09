import type {
  WinWattFieldCoverage,
  WinWattFieldMapEntry,
  WinWattFieldMapResult,
  WinWattFieldReadinessStatus,
  WinWattTargetVerification,
  WinWattTransferDataType,
  WinWattTransferMode,
  WinWattTransferRequirement,
  WinWattTransferTableSummary,
  WinWattTransferValidationMessage,
} from "@/components/energy/domain/energyWinWattTransferTypes";
import type { EnergyExpertTable, EnergyExpertTableColumn, EnergyExpertTableRow } from "@/components/property-survey/propertySurveyExpertTables";

type TableTransferConfig = {
  tableRequirement: "required" | "conditional" | "optional";
  targetGroupId: string;
  targetGroupLabel: string;
  verification: WinWattTargetVerification;
  transferMode: WinWattTransferMode;
  requiredKeys: string[];
  conditionalKeys?: string[];
  referenceOnlyKeys?: string[];
  manualReviewKeys?: string[];
  ignoredKeys?: string[];
};

const tableConfigs: Record<string, TableTransferConfig> = {
  general: { tableRequirement: "required", targetGroupId: "building", targetGroupLabel: "Épület és számítási alapadatok", verification: "referenceAligned", transferMode: "manualReview", requiredKeys: ["value"], referenceOnlyKeys: ["source", "status"] },
  materials: { tableRequirement: "conditional", targetGroupId: "materials", targetGroupLabel: "Anyagok", verification: "referenceAligned", transferMode: "directCopy", requiredKeys: ["name", "lambda"], conditionalKeys: ["density", "specificHeat", "thickness"], referenceOnlyKeys: ["source", "status"] },
  structures: { tableRequirement: "required", targetGroupId: "structures", targetGroupLabel: "Szerkezetek", verification: "referenceAligned", transferMode: "directCopy", requiredKeys: ["name", "category", "effectiveU"], conditionalKeys: ["calculatedU", "declaredU", "requirementU"], referenceOnlyKeys: ["compliance", "status"] },
  layers: { tableRequirement: "conditional", targetGroupId: "structureLayers", targetGroupLabel: "Szerkezeti rétegek", verification: "referenceAligned", transferMode: "directCopy", requiredKeys: ["structure", "order", "kind", "material"], conditionalKeys: ["thicknessCm", "lambda", "resistance"], referenceOnlyKeys: ["source", "status"] },
  rooms: { tableRequirement: "required", targetGroupId: "rooms", targetGroupLabel: "Helyiségek", verification: "referenceAligned", transferMode: "directCopy", requiredKeys: ["name", "level", "area", "height", "volume"], conditionalKeys: ["function", "heated", "orientation", "zone", "unheatedSpace", "floorAssembly", "ceilingAssembly"], referenceOnlyKeys: ["status"] },
  levels: { tableRequirement: "required", targetGroupId: "levels", targetGroupLabel: "Épületszintek", verification: "referenceAligned", transferMode: "directCopy", requiredKeys: ["name", "order"], conditionalKeys: ["elevation", "conditionedArea", "conditionedVolume"], referenceOnlyKeys: ["status"] },
  zones: { tableRequirement: "required", targetGroupId: "zones", targetGroupLabel: "Zónák és fűtetlen terek", verification: "referenceAligned", transferMode: "directCopy", requiredKeys: ["name", "kind", "area", "volume"], conditionalKeys: ["usage", "service", "heatingSetpoint", "coolingSetpoint", "rooms"], referenceOnlyKeys: ["status"] },
  boundaries: { tableRequirement: "required", targetGroupId: "boundaries", targetGroupLabel: "Határoló szerkezetek", verification: "referenceAligned", transferMode: "directCopy", requiredKeys: ["name", "level", "room", "boundary", "netArea", "assembly", "uValue"], conditionalKeys: ["orientation", "azimuth", "length", "height", "grossArea", "openingArea", "heatLoss"], referenceOnlyKeys: ["status"] },
  openings: { tableRequirement: "conditional", targetGroupId: "openings", targetGroupLabel: "Nyílászárók", verification: "referenceAligned", transferMode: "directCopy", requiredKeys: ["name", "level", "room", "kind", "width", "height", "area", "uw"], conditionalKeys: ["frame", "glazing", "gValue", "installationPsi", "requirementUw"], referenceOnlyKeys: ["compliance", "source", "status"] },
  thermalBridges: { tableRequirement: "optional", targetGroupId: "thermalBridges", targetGroupLabel: "Hőhidak", verification: "trialRequired", transferMode: "manualReview", requiredKeys: ["name", "kind"], conditionalKeys: ["category", "zone", "room", "length", "quantity", "psi", "chi", "heatLoss"], referenceOnlyKeys: ["source", "status"] },
  systems: { tableRequirement: "conditional", targetGroupId: "systems", targetGroupLabel: "Épülettechnikai rendszerek", verification: "trialRequired", transferMode: "manualReview", requiredKeys: ["name", "service", "type"], conditionalKeys: ["zones", "devices", "nominalCapacity", "allocatedCapacity", "remainingCapacity"], referenceOnlyKeys: ["source", "status"] },
  renovation: { tableRequirement: "optional", targetGroupId: "renovation", targetGroupLabel: "Felújítási változatok – DIMPRO kiegészítő", verification: "dimproExtension", transferMode: "referenceOnly", requiredKeys: ["scenario", "measure"], conditionalKeys: ["proposal", "targetValue", "unit"], referenceOnlyKeys: ["existing", "effect", "dataStatus", "included", "source"] },
  renovationComparison: { tableRequirement: "optional", targetGroupId: "renovationComparison", targetGroupLabel: "Változat-összehasonlítás – DIMPRO kiegészítő", verification: "dimproExtension", transferMode: "referenceOnly", requiredKeys: ["scenario", "calculationStatus"], referenceOnlyKeys: ["warningCount", "errorCount"] },
  renewables: { tableRequirement: "optional", targetGroupId: "renewables", targetGroupLabel: "Megújuló és villamos rendszerek", verification: "trialRequired", transferMode: "manualReview", requiredKeys: ["system", "enabled"], conditionalKeys: ["size", "unit", "annualEnergy", "annualUnit", "secondaryValue", "secondaryUnit"], referenceOnlyKeys: ["source", "status"] },
  sources: { tableRequirement: "required", targetGroupId: "audit", targetGroupLabel: "Források és ellenőrzés – DIMPRO audit", verification: "dimproExtension", transferMode: "referenceOnly", requiredKeys: ["domain", "source", "status"], referenceOnlyKeys: ["records"] },
};

const generalFieldRequirement: Record<string, WinWattTransferRequirement> = {
  "Felmérés neve": "required",
  "Felmérési mód": "required",
  "Cím": "required",
  "Helyrajzi szám": "conditional",
  "Rendeltetés": "required",
  "Építés éve": "conditional",
  "Hasznos fűtött alapterület": "required",
  "Kondicionált térfogat": "required",
  "Felület/térfogat arány": "required",
  "Külső méretezési hőmérséklet": "conditional",
};

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && !value.trim());
}

function inferDataType(column: EnergyExpertTableColumn, rows: EnergyExpertTableRow[]): WinWattTransferDataType {
  const values = rows.map((row) => row[column.key]).filter((value) => !isEmpty(value));
  if (column.unit || values.some((value) => typeof value === "number")) return "number";
  if (values.some((value) => typeof value === "boolean")) return "boolean";
  if (/status|compliance|state/i.test(column.key)) return "status";
  return "text";
}

function requirementFor(config: TableTransferConfig, key: string): WinWattTransferRequirement {
  if (config.requiredKeys.includes(key)) return "required";
  if (config.conditionalKeys?.includes(key)) return "conditional";
  return "optional";
}

function modeFor(config: TableTransferConfig, key: string): WinWattTransferMode {
  if (config.referenceOnlyKeys?.includes(key)) return "referenceOnly";
  if (config.manualReviewKeys?.includes(key)) return "manualReview";
  return config.transferMode;
}

function readinessFor(input: {
  requirement: WinWattTransferRequirement;
  verification: WinWattTargetVerification;
  mode: WinWattTransferMode;
  recordCount: number;
  missingCount: number;
  invalidCount: number;
}): { readiness: WinWattFieldReadinessStatus; message: string } {
  if (input.recordCount === 0) return { readiness: input.requirement === "required" ? "blocked" : "notApplicable", message: input.requirement === "required" ? "A kötelező adatcsoportban nincs rekord." : "Nincs alkalmazandó rekord." };
  if (input.invalidCount > 0) return { readiness: "blocked", message: `${input.invalidCount} érték típusa vagy formátuma hibás.` };
  if (input.requirement === "required" && input.missingCount > 0) return { readiness: "blocked", message: `${input.missingCount} kötelező érték hiányzik.` };
  if (input.requirement === "conditional" && input.missingCount === input.recordCount) return { readiness: "notApplicable", message: "A feltételes mező egyik rekordnál sem alkalmazandó vagy még nincs kitöltve." };
  if (input.missingCount > 0) return { readiness: "reviewRequired", message: `${input.missingCount} érték nincs kitöltve; ellenőrzés szükséges.` };
  if (input.verification === "trialRequired") return { readiness: "reviewRequired", message: "Az adatok teljesek, de a WinWatt célmező valós próbaátadással igazolandó." };
  if (input.mode === "manualReview" || input.mode === "referenceOnly") return { readiness: "reviewRequired", message: input.mode === "referenceOnly" ? "Referenciaadat; nem közvetlen WinWatt-beviteli mező." : "Kézi WinWatt-ellenőrzés szükséges." };
  return { readiness: "ready", message: "A mező értékei az előkészítő átadáshoz rendelkezésre állnak." };
}

function invalidValueCount(dataType: WinWattTransferDataType, values: unknown[]) {
  return values.filter((value) => {
    if (isEmpty(value)) return false;
    if (dataType === "number") return typeof value !== "number" || !Number.isFinite(value);
    if (dataType === "boolean") return typeof value !== "boolean";
    return typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean";
  }).length;
}

function createGeneralEntries(table: EnergyExpertTable, config: TableTransferConfig): WinWattFieldMapEntry[] {
  return table.rows.map((row) => {
    const fieldLabel = String(row.field || row.id);
    const requirement = generalFieldRequirement[fieldLabel] || "optional";
    return {
      id: `general.${slug(fieldLabel)}`,
      sourceTableId: table.id,
      sourceTableLabel: table.label,
      sourceColumnKey: "value",
      sourceColumnLabel: fieldLabel,
      sourceUnit: typeof row.unit === "string" ? row.unit : undefined,
      sourcePath: `general[${row.id}].value`,
      targetGroupId: config.targetGroupId,
      targetGroupLabel: config.targetGroupLabel,
      targetFieldKey: `WW.${config.targetGroupId}.${slug(fieldLabel)}`,
      targetFieldLabel: fieldLabel,
      targetUnit: typeof row.unit === "string" ? row.unit : undefined,
      requirement,
      transferMode: "manualReview",
      targetVerification: config.verification,
      dataType: typeof row.value === "number" ? "number" : "text",
      note: "Kulcs–érték jellegű általános adat. A WinWatt felületi célmező megnevezését a próbaátadás során ellenőrizni kell.",
    };
  });
}

function createTableEntries(table: EnergyExpertTable, config: TableTransferConfig): WinWattFieldMapEntry[] {
  if (table.id === "general") return createGeneralEntries(table, config);
  return table.columns
    .filter((column) => !config.ignoredKeys?.includes(column.key))
    .map((column) => ({
      id: `${table.id}.${column.key}`,
      sourceTableId: table.id,
      sourceTableLabel: table.label,
      sourceColumnKey: column.key,
      sourceColumnLabel: column.label,
      sourceUnit: column.unit,
      sourcePath: `${table.id}[*].${column.key}`,
      targetGroupId: config.targetGroupId,
      targetGroupLabel: config.targetGroupLabel,
      targetFieldKey: `WW.${config.targetGroupId}.${column.key}`,
      targetFieldLabel: column.label,
      targetUnit: column.unit,
      requirement: requirementFor(config, column.key),
      transferMode: modeFor(config, column.key),
      targetVerification: config.verification,
      dataType: inferDataType(column, table.rows),
      note: config.verification === "dimproExtension"
        ? "DIMPRO kiegészítő vagy auditadat; WinWattban jellemzően dokumentációként vagy kézi megjegyzésként használható."
        : config.verification === "trialRequired"
          ? "A céladatcsoport szakmailag azonosított, de a pontos WinWatt-felviteli mező valós próbaátadással igazolandó."
          : "A WinWatt szakmai adatcsoportjához igazított előkészítő mező; nem belső WinWatt mezőazonosító.",
    }));
}

function valuesForEntry(table: EnergyExpertTable, entry: WinWattFieldMapEntry) {
  if (table.id === "general") {
    const rowId = entry.sourcePath.match(/general\[([^\]]+)\]/)?.[1];
    const row = table.rows.find((item) => item.id === rowId);
    return row ? [{ row, value: row.value }] : [];
  }
  return table.rows.map((row) => ({ row, value: row[entry.sourceColumnKey] }));
}

function summarizeTable(table: EnergyExpertTable, fields: WinWattFieldCoverage[]): WinWattTransferTableSummary {
  const blockedFieldCount = fields.filter((field) => field.readiness === "blocked").length;
  const reviewFieldCount = fields.filter((field) => field.readiness === "reviewRequired").length;
  const readyFieldCount = fields.filter((field) => field.readiness === "ready").length;
  const readiness: WinWattFieldReadinessStatus = blockedFieldCount ? "blocked" : reviewFieldCount ? "reviewRequired" : fields.some((field) => field.readiness === "ready") ? "ready" : "notApplicable";
  return {
    tableId: table.id,
    tableLabel: table.label,
    targetGroupLabel: fields[0]?.targetGroupLabel || table.label,
    fieldCount: fields.length,
    recordCount: table.rows.length,
    readyFieldCount,
    reviewFieldCount,
    blockedFieldCount,
    missingRequiredValueCount: fields.filter((field) => field.requirement === "required").reduce((sum, field) => sum + field.missingCount, 0),
    invalidValueCount: fields.reduce((sum, field) => sum + field.invalidCount, 0),
    readiness,
  };
}

export function buildWinWattFieldMap(tables: EnergyExpertTable[]): WinWattFieldMapResult {
  const generatedAt = new Date().toISOString();
  const validationMessages: WinWattTransferValidationMessage[] = [];
  const fields: WinWattFieldCoverage[] = [];
  const records: WinWattFieldMapResult["records"] = [];
  const tableSummaries: WinWattTransferTableSummary[] = [];

  tables.forEach((table) => {
    const config = tableConfigs[table.id] || {
      tableRequirement: "optional" as const,
      targetGroupId: table.id,
      targetGroupLabel: table.label,
      verification: "trialRequired" as const,
      transferMode: "manualReview" as const,
      requiredKeys: [],
    };
    const entries = createTableEntries(table, config);
    const tableFields: WinWattFieldCoverage[] = entries.map((entry) => {
      const values = valuesForEntry(table, entry);
      const rawValues = values.map((item) => item.value);
      const recordCount = values.length;
      const populatedCount = rawValues.filter((value) => !isEmpty(value)).length;
      const missingCount = recordCount - populatedCount;
      const invalidCount = invalidValueCount(entry.dataType, rawValues);
      const effectiveRequirement = recordCount === 0 && config.tableRequirement !== "required" ? "optional" : entry.requirement;
      const status = readinessFor({ requirement: effectiveRequirement, verification: entry.targetVerification, mode: entry.transferMode, recordCount, missingCount, invalidCount });
      values.forEach(({ row, value }) => {
        const rowEmpty = isEmpty(value);
        const invalid = invalidValueCount(entry.dataType, [value]) > 0;
        const readiness: WinWattFieldReadinessStatus = invalid || (entry.requirement === "required" && rowEmpty)
          ? "blocked"
          : rowEmpty
            ? entry.requirement === "optional" ? "notApplicable" : "reviewRequired"
            : entry.targetVerification === "trialRequired" || entry.transferMode !== "directCopy"
              ? "reviewRequired"
              : "ready";
        records.push({
          id: `${entry.id}.${row.id}`,
          sourceTableId: table.id,
          sourceRowId: row.id,
          sourceColumnKey: entry.sourceColumnKey,
          targetGroupId: entry.targetGroupId,
          targetFieldKey: entry.targetFieldKey,
          targetFieldLabel: entry.targetFieldLabel,
          value: (value ?? null) as string | number | boolean | null,
          unit: entry.targetUnit,
          requirement: entry.requirement,
          transferMode: entry.transferMode,
          targetVerification: entry.targetVerification,
          readiness,
          message: invalid ? "Hibás adattípus vagy számformátum." : rowEmpty ? "Nincs kitöltött érték." : status.message,
        });
      });
      const field: WinWattFieldCoverage = { ...entry, recordCount, populatedCount, missingCount, invalidCount, readiness: status.readiness, readinessMessage: status.message };
      if (field.readiness === "blocked") {
        validationMessages.push({ id: `field-blocked-${field.id}`, severity: "blocking", code: "WINWATT_FIELD_BLOCKED", tableId: table.id, fieldId: field.id, message: `${table.label} / ${field.sourceColumnLabel}: ${field.readinessMessage}` });
      } else if (field.readiness === "reviewRequired") {
        validationMessages.push({ id: `field-review-${field.id}`, severity: "warning", code: "WINWATT_FIELD_REVIEW", tableId: table.id, fieldId: field.id, message: `${table.label} / ${field.sourceColumnLabel}: ${field.readinessMessage}` });
      }
      return field;
    });
    fields.push(...tableFields);
    tableSummaries.push(summarizeTable(table, tableFields));
  });

  const blockedFieldCount = fields.filter((field) => field.readiness === "blocked").length;
  const reviewFieldCount = fields.filter((field) => field.readiness === "reviewRequired").length;
  const readyFieldCount = fields.filter((field) => field.readiness === "ready").length;
  const requiredFieldCount = fields.filter((field) => field.requirement === "required").length;
  const missingRequiredValueCount = fields.filter((field) => field.requirement === "required").reduce((sum, field) => sum + field.missingCount, 0);
  const invalidValueCountTotal = fields.reduce((sum, field) => sum + field.invalidCount, 0);

  if (!blockedFieldCount) {
    validationMessages.unshift({
      id: "trial-transfer-ready",
      severity: "info",
      code: "WINWATT_TRIAL_TRANSFER_READY",
      message: reviewFieldCount
        ? "Nincs blokkoló mezőhiány. A próbaátadás elindítható, de a kézi és célmező-ellenőrzések még szükségesek."
        : "A mezőtérkép minden vizsgált mezője átadásra kész.",
    });
  }

  return {
    schema: "dimpro.winwatt-field-map.v0.8.3",
    generatedAt,
    disclaimer: "A mezőtérkép előkészítő adatátadási szerződés. Nem tartalmaz nem dokumentált WinWatt belső mezőazonosítókat, és nem minősül natív WinWatt-importnak. A célfeliratokat valós próbaátadás során kell igazolni.",
    fields,
    records,
    tables: tableSummaries,
    validationMessages,
    totals: {
      tableCount: tableSummaries.length,
      mappedFieldCount: fields.length,
      transferRecordCount: records.length,
      readyFieldCount,
      reviewFieldCount,
      blockedFieldCount,
      requiredFieldCount,
      missingRequiredValueCount,
      invalidValueCount: invalidValueCountTotal,
      referenceAlignedFieldCount: fields.filter((field) => field.targetVerification === "referenceAligned").length,
      dimproExtensionFieldCount: fields.filter((field) => field.targetVerification === "dimproExtension").length,
      trialRequiredFieldCount: fields.filter((field) => field.targetVerification === "trialRequired").length,
    },
    readyForTrialTransfer: blockedFieldCount === 0,
  };
}
