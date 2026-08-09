import type { WinWattFieldMapResult } from "@/components/energy/domain/energyWinWattTransferTypes";
import { winWattFieldReadinessLabels, winWattTargetVerificationLabels, winWattTransferModeLabels, winWattTransferRequirementLabels } from "@/components/energy/domain/energyWinWattTransferTypes";
import type { EnergyExpertTable, EnergyExpertTableRow } from "@/components/property-survey/propertySurveyExpertTables";
import {
  winWattTrialComparisonStatusLabels,
  winWattTrialFieldStatusLabels,
  winWattTrialInputMethodLabels,
  winWattTrialSessionStatusLabels,
  type WinWattTrialFeedbackResult,
  type WinWattTrialWorkspace,
} from "@/components/energy/domain/energyWinWattTrialTypes";

export const DIMPRO_WINWATT_TRANSFER_SCHEMA = "dimpro.winwatt-transfer.v0.8.4" as const;

const sheetNames: Record<string, string> = {
  general: "01_Altalanos",
  materials: "02_Anyagok",
  structures: "03_Szerkezetek",
  layers: "04_Retegek",
  rooms: "05_Helyisegek",
  levels: "06_Epuletszintek",
  zones: "07_Zonak",
  boundaries: "08_Hatarolo_szerk",
  openings: "09_Nyilaszarok",
  thermalBridges: "10_Hohidak",
  systems: "11_Gepeszeti_rendsz",
  renovation: "12_Felujitasi_valt",
  renovationComparison: "13_Valtozat_osszeh",
  renewables: "14_Megujulo_vill",
  sources: "15_Forras_statusz",
  fieldMap: "16_Mezoterkep",
  transferValidation: "17_Atadas_ellenorzes",
  trialLog: "18_Probanaplo",
  trialResults: "19_Eredmeny_elteres",
};

function printableValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Igen" : "Nem";
  return value;
}

function tableToAoa(table: EnergyExpertTable, metadata: { projectName: string; surveyName: string; exportedAt: string }) {
  const header = table.columns.map((column) => column.unit ? `${column.label} [${column.unit}]` : column.label);
  const rows = table.rows.map((row: EnergyExpertTableRow) => table.columns.map((column) => printableValue(row[column.key])));
  return [
    ["DIMPRO WinWatt-előkészítő adatcsomag"],
    ["Séma", DIMPRO_WINWATT_TRANSFER_SCHEMA],
    ["Projekt", metadata.projectName],
    ["Felmérés", metadata.surveyName],
    ["Export időpontja", metadata.exportedAt],
    ["Korlátozás", "Szakmai ellenőrzés és WinWattban történő véglegesítés szükséges. Nem natív WinWatt projektfájl."],
    [],
    header,
    ...rows,
  ];
}


function fieldMapToAoa(fieldMap: WinWattFieldMapResult, metadata: { projectName: string; surveyName: string; exportedAt: string }) {
  return [
    ["DIMPRO WinWatt mezőtérkép"],
    ["Séma", fieldMap.schema],
    ["Projekt", metadata.projectName],
    ["Felmérés", metadata.surveyName],
    ["Export időpontja", metadata.exportedAt],
    ["Korlátozás", fieldMap.disclaimer],
    [],
    ["Forrástábla", "Forrásmező", "Forrásútvonal", "Forrásegység", "Céladatcsoport", "Célkulcs", "Célfelirat", "Célegység", "Kötelezőség", "Átadási mód", "Célellenőrzés", "Adattípus", "Rekord", "Kitöltött", "Hiányzó", "Hibás", "Készültség", "Megjegyzés"],
    ...fieldMap.fields.map((field) => [field.sourceTableLabel, field.sourceColumnLabel, field.sourcePath, field.sourceUnit || "", field.targetGroupLabel, field.targetFieldKey, field.targetFieldLabel, field.targetUnit || "", winWattTransferRequirementLabels[field.requirement], winWattTransferModeLabels[field.transferMode], winWattTargetVerificationLabels[field.targetVerification], field.dataType, field.recordCount, field.populatedCount, field.missingCount, field.invalidCount, winWattFieldReadinessLabels[field.readiness], field.readinessMessage]),
  ];
}

function validationToAoa(fieldMap: WinWattFieldMapResult, metadata: { projectName: string; surveyName: string; exportedAt: string }) {
  return [
    ["DIMPRO WinWatt próbaátadási ellenőrzés"],
    ["Séma", fieldMap.schema],
    ["Projekt", metadata.projectName],
    ["Felmérés", metadata.surveyName],
    ["Export időpontja", metadata.exportedAt],
    ["Próbaátadásra kész", fieldMap.readyForTrialTransfer ? "Igen" : "Nem"],
    ["Leképezett mezők", fieldMap.totals.mappedFieldCount],
    ["Átadási rekordok", fieldMap.totals.transferRecordCount],
    ["Blokkolt mezők", fieldMap.totals.blockedFieldCount],
    ["Ellenőrzendő mezők", fieldMap.totals.reviewFieldCount],
    ["Hiányzó kötelező értékek", fieldMap.totals.missingRequiredValueCount],
    ["Hibás értékek", fieldMap.totals.invalidValueCount],
    [],
    ["Súlyosság", "Kód", "Adatcsoport", "Rekord", "Mező", "Üzenet"],
    ...fieldMap.validationMessages.map((message) => [message.severity, message.code, message.tableId || "", message.rowId || "", message.fieldId || "", message.message]),
  ];
}


function trialLogToAoa(workspace: WinWattTrialWorkspace, feedback: WinWattTrialFeedbackResult, metadata: { projectName: string; surveyName: string; exportedAt: string }) {
  const rows = workspace.sessions.flatMap((session) => session.fieldResults.map((field) => [
    session.title,
    winWattTrialSessionStatusLabels[session.status],
    session.winWattVersion,
    session.operatorName,
    session.workstation,
    field.sourceTableId,
    field.sourceColumnKey,
    field.targetFieldKey,
    field.targetWindow,
    field.targetTab,
    field.targetFieldLabel,
    field.targetUnit,
    winWattTrialFieldStatusLabels[field.status],
    winWattTrialInputMethodLabels[field.inputMethod],
    field.entryOrder ?? "",
    field.durationSeconds ?? "",
    field.entryStartedAt || "",
    field.entryCompletedAt || "",
    field.observedValue,
    field.note,
    field.verifiedAt || "",
  ]));
  return [
    ["DIMPRO WinWatt próbanapló"],
    ["Séma", feedback.schema],
    ["Projekt", metadata.projectName],
    ["Felmérés", metadata.surveyName],
    ["Export időpontja", metadata.exportedAt],
    ["Munkamenetek", feedback.totals.sessionCount],
    ["Visszaigazolt mezők", feedback.totals.verifiedFieldCount],
    ["Korlátozás", feedback.disclaimer],
    [],
    ["Munkamenet", "Munkamenet állapota", "WinWatt verzió", "Operátor", "Munkaállomás", "Forrásadatcsoport", "Forrásmező", "Célkulcs", "WinWatt célablak", "WinWatt célfül", "Pontos célfelirat", "Pontos egység", "Próbaállapot", "Beviteli mód", "Sorrend", "Idő [s]", "Mezőpróba indítva", "Mezőpróba befejezve", "Látott érték", "Megjegyzés", "Visszaigazolva"],
    ...rows,
  ];
}

function trialResultsToAoa(workspace: WinWattTrialWorkspace, feedback: WinWattTrialFeedbackResult, metadata: { projectName: string; surveyName: string; exportedAt: string }) {
  const rows = workspace.sessions.flatMap((session) => session.resultComparisons.map((metric) => {
    const difference = metric.dimproValue !== undefined && metric.winWattValue !== undefined ? metric.winWattValue - metric.dimproValue : undefined;
    const percent = difference !== undefined && metric.dimproValue ? difference / Math.abs(metric.dimproValue) * 100 : undefined;
    return [session.title, winWattTrialSessionStatusLabels[session.status], session.winWattVersion, metric.metricKey, metric.label, metric.dimproValue ?? "", metric.winWattValue ?? "", metric.unit, difference ?? "", percent ?? "", metric.toleranceAbsolute ?? "", metric.tolerancePercent ?? "", winWattTrialComparisonStatusLabels[metric.status], metric.note];
  }));
  return [
    ["DIMPRO–WinWatt eredmény-összevetés"],
    ["Séma", feedback.schema],
    ["Projekt", metadata.projectName],
    ["Felmérés", metadata.surveyName],
    ["Export időpontja", metadata.exportedAt],
    ["Összevetett eredmények", feedback.totals.comparedMetricCount],
    ["Tűrésen kívüli eredmények", feedback.totals.outsideToleranceMetricCount],
    ["Korlátozás", "A DIMPRO mező csak a már validáltan számított mutatóknál tartalmaz értéket. Az éves energia-, primerenergia- és CO₂-eredmény addig üres, amíg nincs validált havi DIMPRO motor."],
    [],
    ["Munkamenet", "Munkamenet állapota", "WinWatt verzió", "Mutatókulcs", "Mutató", "DIMPRO", "WinWatt", "Egység", "Eltérés", "Eltérés [%]", "Abszolút tűrés", "Relatív tűrés [%]", "Összevetési állapot", "Megjegyzés"],
    ...rows,
  ];
}

function calculateColumnWidths(table: EnergyExpertTable) {
  return table.columns.map((column) => {
    const values = table.rows.map((row) => printableValue(row[column.key]));
    const length = Math.max(column.label.length, ...values.map((value) => String(value).length));
    return { wch: Math.min(42, Math.max(10, length + 2)) };
  });
}

export async function createWinWattTransferWorkbookBlob(input: {
  tables: EnergyExpertTable[];
  projectName: string;
  surveyName: string;
  fieldMap: WinWattFieldMapResult;
  trialWorkspace: WinWattTrialWorkspace;
  trialFeedback: WinWattTrialFeedbackResult;
}) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const exportedAt = new Date().toISOString();
  const indexAoa = [
    ["DIMPRO WinWatt-előkészítő adatcsomag"],
    ["Séma", DIMPRO_WINWATT_TRANSFER_SCHEMA],
    ["Projekt", input.projectName],
    ["Felmérés", input.surveyName],
    ["Export időpontja", exportedAt],
    ["Korlátozás", "Az Excel munkafüzet nem natív WinWatt projektfájl. A számítási adatokat szakmailag ellenőrizni és a WinWattban véglegesíteni kell."],
    ["Próbaátadásra kész", input.fieldMap.readyForTrialTransfer ? "Igen" : "Nem"],
    ["Blokkolt mezők", input.fieldMap.totals.blockedFieldCount],
    ["Ellenőrzendő mezők", input.fieldMap.totals.reviewFieldCount],
    [],
    ["Munkalap", "Adatcsoport", "Leírás", "Rekordok"],
    ...input.tables.map((table) => [sheetNames[table.id] || table.id.slice(0, 31), table.label, table.description, table.rows.length]),
    [sheetNames.fieldMap, "WinWatt mezőtérkép", "Forrásmező, célfelirat, mértékegység, kötelezőség és átadási készültség.", input.fieldMap.fields.length],
    [sheetNames.transferValidation, "Átadási ellenőrzés", "Blokkoló hibák, figyelmeztetések és próbaátadási készültség.", input.fieldMap.validationMessages.length],
    [sheetNames.trialLog, "WinWatt próbanapló", "Mezőnkénti célablak, célfül, célfelirat, beviteli mód, idő és próbastátusz.", input.trialWorkspace.sessions.reduce((sum, session) => sum + session.fieldResults.length, 0)],
    [sheetNames.trialResults, "DIMPRO–WinWatt eredményeltérés", "Számított és WinWattban kapott eredmények, tűrések és eltérések.", input.trialWorkspace.sessions.reduce((sum, session) => sum + session.resultComparisons.length, 0)],
  ];
  const indexSheet = XLSX.utils.aoa_to_sheet(indexAoa);
  indexSheet["!cols"] = [{ wch: 24 }, { wch: 32 }, { wch: 72 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(workbook, indexSheet, "00_Jegyzek");

  input.tables.forEach((table) => {
    const sheet = XLSX.utils.aoa_to_sheet(tableToAoa(table, { projectName: input.projectName, surveyName: input.surveyName, exportedAt }));
    sheet["!cols"] = calculateColumnWidths(table);
    sheet["!freeze"] = { xSplit: 1, ySplit: 8, topLeftCell: "B9", activePane: "bottomRight", state: "frozen" };
    const sheetName = (sheetNames[table.id] || table.id).slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  });


  const mapSheet = XLSX.utils.aoa_to_sheet(fieldMapToAoa(input.fieldMap, { projectName: input.projectName, surveyName: input.surveyName, exportedAt }));
  mapSheet["!cols"] = [{ wch: 28 }, { wch: 28 }, { wch: 34 }, { wch: 14 }, { wch: 34 }, { wch: 34 }, { wch: 28 }, { wch: 14 }, { wch: 15 }, { wch: 20 }, { wch: 24 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 64 }];
  mapSheet["!freeze"] = { xSplit: 2, ySplit: 8, topLeftCell: "C9", activePane: "bottomRight", state: "frozen" };
  XLSX.utils.book_append_sheet(workbook, mapSheet, sheetNames.fieldMap);

  const validationSheet = XLSX.utils.aoa_to_sheet(validationToAoa(input.fieldMap, { projectName: input.projectName, surveyName: input.surveyName, exportedAt }));
  validationSheet["!cols"] = [{ wch: 16 }, { wch: 28 }, { wch: 24 }, { wch: 24 }, { wch: 34 }, { wch: 96 }];
  validationSheet["!freeze"] = { xSplit: 0, ySplit: 13, topLeftCell: "A14", activePane: "bottomLeft", state: "frozen" };
  XLSX.utils.book_append_sheet(workbook, validationSheet, sheetNames.transferValidation);

  const trialLogSheet = XLSX.utils.aoa_to_sheet(trialLogToAoa(input.trialWorkspace, input.trialFeedback, { projectName: input.projectName, surveyName: input.surveyName, exportedAt }));
  trialLogSheet["!cols"] = [{ wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 24 }, { wch: 24 }, { wch: 32 }, { wch: 28 }, { wch: 24 }, { wch: 32 }, { wch: 16 }, { wch: 22 }, { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 64 }, { wch: 24 }];
  trialLogSheet["!freeze"] = { xSplit: 2, ySplit: 10, topLeftCell: "C11", activePane: "bottomRight", state: "frozen" };
  XLSX.utils.book_append_sheet(workbook, trialLogSheet, sheetNames.trialLog);

  const trialResultSheet = XLSX.utils.aoa_to_sheet(trialResultsToAoa(input.trialWorkspace, input.trialFeedback, { projectName: input.projectName, surveyName: input.surveyName, exportedAt }));
  trialResultSheet["!cols"] = [{ wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 28 }, { wch: 36 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 64 }];
  trialResultSheet["!freeze"] = { xSplit: 2, ySplit: 10, topLeftCell: "C11", activePane: "bottomRight", state: "frozen" };
  XLSX.utils.book_append_sheet(workbook, trialResultSheet, sheetNames.trialResults);

  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
  return new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
