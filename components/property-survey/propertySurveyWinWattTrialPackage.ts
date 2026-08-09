import JSZip from "jszip";
import {
  winWattFieldReadinessLabels,
  winWattTargetVerificationLabels,
  winWattTransferModeLabels,
  winWattTransferRequirementLabels,
  type WinWattFieldMapResult,
} from "@/components/energy/domain/energyWinWattTransferTypes";
import {
  winWattTrialComparisonStatusLabels,
  winWattTrialFieldStatusLabels,
  winWattTrialInputMethodLabels,
  winWattTrialSessionStatusLabels,
  type WinWattTrialFeedbackResult,
  type WinWattTrialWorkspace,
} from "@/components/energy/domain/energyWinWattTrialTypes";

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(rows: unknown[][]) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "dimpro_felmeres";
}

function fieldMapCsv(fieldMap: WinWattFieldMapResult) {
  return csv([
    ["Forrástábla", "Forrásmező", "Forrásútvonal", "Forrásegység", "Céladatcsoport", "Célkulcs", "Célfelirat", "Célegység", "Kötelezőség", "Átadási mód", "Célellenőrzés", "Adattípus", "Rekord", "Kitöltött", "Hiányzó", "Hibás", "Készültség", "Üzenet"],
    ...fieldMap.fields.map((field) => [
      field.sourceTableLabel,
      field.sourceColumnLabel,
      field.sourcePath,
      field.sourceUnit || "",
      field.targetGroupLabel,
      field.targetFieldKey,
      field.targetFieldLabel,
      field.targetUnit || "",
      winWattTransferRequirementLabels[field.requirement],
      winWattTransferModeLabels[field.transferMode],
      winWattTargetVerificationLabels[field.targetVerification],
      field.dataType,
      field.recordCount,
      field.populatedCount,
      field.missingCount,
      field.invalidCount,
      winWattFieldReadinessLabels[field.readiness],
      field.readinessMessage,
    ]),
  ]);
}

function validationCsv(fieldMap: WinWattFieldMapResult) {
  return csv([
    ["Súlyosság", "Kód", "Adatcsoport", "Rekord", "Mező", "Üzenet"],
    ...fieldMap.validationMessages.map((message) => [message.severity, message.code, message.tableId || "", message.rowId || "", message.fieldId || "", message.message]),
  ]);
}

function transferRecordsCsv(fieldMap: WinWattFieldMapResult) {
  return csv([
    ["Forrástábla", "Forrásrekord", "Forrásmező", "Céladatcsoport", "Célkulcs", "Célfelirat", "Érték", "Egység", "Kötelezőség", "Átadási mód", "Célellenőrzés", "Készültség", "Üzenet"],
    ...fieldMap.records.map((record) => [record.sourceTableId, record.sourceRowId, record.sourceColumnKey, record.targetGroupId, record.targetFieldKey, record.targetFieldLabel, record.value, record.unit || "", winWattTransferRequirementLabels[record.requirement], winWattTransferModeLabels[record.transferMode], winWattTargetVerificationLabels[record.targetVerification], winWattFieldReadinessLabels[record.readiness], record.message]),
  ]);
}


function trialLogCsv(workspace: WinWattTrialWorkspace) {
  return csv([
    ["Munkamenet", "Munkamenet állapota", "WinWatt verzió", "Operátor", "Munkaállomás", "Forrásadatcsoport", "Forrásmező", "Célkulcs", "WinWatt célablak", "WinWatt célfül", "Pontos célfelirat", "Pontos egység", "Próbaállapot", "Beviteli mód", "Sorrend", "Idő_s", "Mezőpróba_indítva", "Mezőpróba_befejezve", "Látott érték", "Megjegyzés", "Visszaigazolva"],
    ...workspace.sessions.flatMap((session) => session.fieldResults.map((field) => [session.title, winWattTrialSessionStatusLabels[session.status], session.winWattVersion, session.operatorName, session.workstation, field.sourceTableId, field.sourceColumnKey, field.targetFieldKey, field.targetWindow, field.targetTab, field.targetFieldLabel, field.targetUnit, winWattTrialFieldStatusLabels[field.status], winWattTrialInputMethodLabels[field.inputMethod], field.entryOrder ?? "", field.durationSeconds ?? "", field.entryStartedAt || "", field.entryCompletedAt || "", field.observedValue, field.note, field.verifiedAt || ""])),
  ]);
}

function trialResultsCsv(workspace: WinWattTrialWorkspace) {
  return csv([
    ["Munkamenet", "Munkamenet állapota", "WinWatt verzió", "Mutatókulcs", "Mutató", "DIMPRO", "WinWatt", "Egység", "Eltérés", "Eltérés_százalék", "Abszolút tűrés", "Relatív tűrés_százalék", "Összevetési állapot", "Megjegyzés"],
    ...workspace.sessions.flatMap((session) => session.resultComparisons.map((metric) => {
      const difference = metric.dimproValue !== undefined && metric.winWattValue !== undefined ? metric.winWattValue - metric.dimproValue : undefined;
      const percent = difference !== undefined && metric.dimproValue ? difference / Math.abs(metric.dimproValue) * 100 : undefined;
      return [session.title, winWattTrialSessionStatusLabels[session.status], session.winWattVersion, metric.metricKey, metric.label, metric.dimproValue ?? "", metric.winWattValue ?? "", metric.unit, difference ?? "", percent ?? "", metric.toleranceAbsolute ?? "", metric.tolerancePercent ?? "", winWattTrialComparisonStatusLabels[metric.status], metric.note];
    })),
  ]);
}

export async function createWinWattTrialPackageBlob(input: {
  workbookBlob: Blob;
  packageData: unknown;
  fieldMap: WinWattFieldMapResult;
  trialWorkspace: WinWattTrialWorkspace;
  trialFeedback: WinWattTrialFeedbackResult;
  projectName: string;
  surveyName: string;
}) {
  const zip = new JSZip();
  const exportedAt = new Date().toISOString();
  const baseName = safeFileName(input.surveyName);
  const manifest = {
    schema: "dimpro.winwatt-trial-package.v0.8.4",
    exportedAt,
    projectName: input.projectName,
    surveyName: input.surveyName,
    readyForTrialTransfer: input.fieldMap.readyForTrialTransfer,
    fieldMapSchema: input.fieldMap.schema,
    workbookSchema: "dimpro.winwatt-transfer.v0.8.4",
    jsonSchema: "dimpro.winwatt-compatible.v0.8.4",
    trialFeedbackSchema: input.trialFeedback.schema,
    totals: input.fieldMap.totals,
    trialTotals: input.trialFeedback.totals,
    files: [
      `${baseName}_winwatt_elokeszito_v084.xlsx`,
      `${baseName}_winwatt_adatcsomag_v084.json`,
      `${baseName}_winwatt_mezoterkep.csv`,
      `${baseName}_winwatt_atadasi_rekordok.csv`,
      `${baseName}_winwatt_atadasi_hibak.csv`,
      `${baseName}_winwatt_probavisszacsatolas_v084.json`,
      `${baseName}_winwatt_probanaplo.csv`,
      `${baseName}_winwatt_eredmeny_elteres.csv`,
      "README.txt",
    ],
  };

  const readme = [
    "DIMPRO WINWATT PRÓBAÁTADÁSI ÉS VISSZACSATOLÁSI CSOMAG – v0.8.4",
    "",
    `Projekt: ${input.projectName}`,
    `Felmérés: ${input.surveyName}`,
    `Export: ${exportedAt}`,
    `Próbaátadásra kész: ${input.fieldMap.readyForTrialTransfer ? "IGEN" : "NEM"}`,
    `Blokkolt mezők: ${input.fieldMap.totals.blockedFieldCount}`,
    `Ellenőrzendő mezők: ${input.fieldMap.totals.reviewFieldCount}`,
    `Próbamunkamenetek: ${input.trialFeedback.totals.sessionCount}`,
    `Visszaigazolt mezők: ${input.trialFeedback.totals.verifiedFieldCount}`,
    `Tűrésen kívüli eredmények: ${input.trialFeedback.totals.outsideToleranceMetricCount}`,
    "",
    "A csomag nem natív WinWatt projektfájl és nem használ nem dokumentált WinWatt belső mezőazonosítókat.",
    "A mezőfeliratokat, mértékegységeket és felviteli sorrendet valós WinWatt-próba során kell ellenőrizni.",
    "A próba során minden eltérést a 18_Probanaplo és 19_Eredmeny_elteres munkalapon kell rögzíteni.",
    "A próbanaplóban rögzített célfeliratok nem írják át automatikusan a központi mezőtérképet.",
    "",
    "Javasolt próbasorrend:",
    "1. Általános adatok és épületgeometria.",
    "2. Anyagok, szerkezetek és rétegek.",
    "3. Helyiségek, szintek és zónák.",
    "4. Határoló szerkezetek és nyílászárók.",
    "5. Hőhidak és épülettechnikai rendszerek.",
    "6. DIMPRO és WinWatt eredmények összevetése.",
    "7. Eltérő célfeliratok és egységek visszavezetése a mezőtérképbe.",
  ].join("\r\n");

  zip.file("README.txt", readme);
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file(`${baseName}_winwatt_elokeszito_v084.xlsx`, await input.workbookBlob.arrayBuffer());
  zip.file(`${baseName}_winwatt_adatcsomag_v084.json`, JSON.stringify(input.packageData, null, 2));
  zip.file(`${baseName}_winwatt_mezoterkep.csv`, fieldMapCsv(input.fieldMap));
  zip.file(`${baseName}_winwatt_atadasi_rekordok.csv`, transferRecordsCsv(input.fieldMap));
  zip.file(`${baseName}_winwatt_atadasi_hibak.csv`, validationCsv(input.fieldMap));
  zip.file(`${baseName}_winwatt_probavisszacsatolas_v084.json`, JSON.stringify({ workspace: input.trialWorkspace, result: input.trialFeedback }, null, 2));
  zip.file(`${baseName}_winwatt_probanaplo.csv`, trialLogCsv(input.trialWorkspace));
  zip.file(`${baseName}_winwatt_eredmeny_elteres.csv`, trialResultsCsv(input.trialWorkspace));

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
