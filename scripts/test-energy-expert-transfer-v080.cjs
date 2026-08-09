const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const root = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) request = path.join(root, request.slice(2));
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
    fileName: filename,
  }).outputText, filename);
};

const { createSampleSurveyDraft } = require('../components/property-survey/propertySurveyWorkspaceTypes.ts');
const { calculateEnvelopeGeometry } = require('../components/energy/calculations/geometry/calculateEnvelopeGeometry.ts');
const { calculateAssemblySet } = require('../components/energy/calculations/assemblies/calculateAssemblySet.ts');
const { calculateEnergyZones } = require('../components/energy/calculations/zones/calculateEnergyZones.ts');
const { calculateEnergyOpenings } = require('../components/energy/calculations/openings/calculateEnergyOpenings.ts');
const { calculateEnergyDemand } = require('../components/energy/calculations/demand/calculateEnergyDemand.ts');
const { calculateEnergyRenewableSizing } = require('../components/energy/calculations/renewables/calculateRenewableSizing.ts');
const { calculateRenovationComparison } = require('../components/energy/calculations/renovation/calculateRenovationComparison.ts');
const { huEkm20231101AssemblyRuleData } = require('../components/energy/regulations/HU_EKM_2023_11_01/factors.ts');
const { buildPropertySurveyExpertTables } = require('../components/property-survey/propertySurveyExpertTables.ts');
const { buildWinWattFieldMap } = require('../components/energy/transfers/winwatt/buildWinWattFieldMap.ts');
const { createWinWattTrialSession, normalizeWinWattTrialWorkspace } = require('../components/energy/domain/energyWinWattTrialTypes.ts');
const { buildWinWattTrialFeedback } = require('../components/energy/transfers/winwatt/buildWinWattTrialFeedback.ts');
const { createWinWattTransferWorkbookBlob, DIMPRO_WINWATT_TRANSFER_SCHEMA } = require('../components/property-survey/propertySurveyWinWattWorkbook.ts');
const { createWinWattTrialPackageBlob } = require('../components/property-survey/propertySurveyWinWattTrialPackage.ts');

let count = 0;
function assert(condition, message) {
  count += 1;
  if (!condition) throw new Error(`Teszt ${count}: ${message}`);
}

(async () => {
  const draft = createSampleSurveyDraft('v0.8.4 szakértői átadási minta');
  const geometry = calculateEnvelopeGeometry({ rooms: draft.rooms, levels: draft.levels, wallSegments: draft.wallSegments, wallOpenings: draft.wallOpenings, sectionLines: draft.sectionLines, northAngle: draft.northAngle });
  const assemblies = calculateAssemblySet({ assemblies: draft.assemblies, rules: huEkm20231101AssemblyRuleData, requirementLevel: draft.energyProjectSettings.requirementLevel });
  const zones = calculateEnergyZones({ workspace: draft.energyZoneWorkspace, rooms: draft.rooms, levels: draft.levels, wallSegments: draft.wallSegments, wallOpenings: draft.wallOpenings, geometry });
  const openings = calculateEnergyOpenings({ workspace: draft.energyOpeningWorkspace, openings: draft.wallOpenings, requirementLevel: draft.energyProjectSettings.requirementLevel });
  const demand = calculateEnergyDemand({ workspace: draft.energyDemandWorkspace, geometry, zoneWorkspace: draft.energyZoneWorkspace, zoneSet: zones, rooms: draft.rooms, levels: draft.levels, wallSegments: draft.wallSegments, wallOpenings: draft.wallOpenings, assemblies: draft.assemblies, assemblySet: assemblies, openingWorkspace: draft.energyOpeningWorkspace, openingSet: openings, sectionLines: draft.sectionLines, mechanicalDevices: draft.mechanicalDevices });
  const renewables = calculateEnergyRenewableSizing(draft.energyRenewableWorkspace);
  const renovationComparison = calculateRenovationComparison({ workspace: draft.energyRenovationWorkspace, demand, zones, wallSegments: draft.wallSegments, rooms: draft.rooms, openingWorkspace: draft.energyOpeningWorkspace, renewableWorkspace: draft.energyRenewableWorkspace, renewables });
  const tables = buildPropertySurveyExpertTables({ draft, geometry, assemblies, zones, openings, demand, renewables, renovationComparison });
  const fieldMap = buildWinWattFieldMap(tables);
  const trialSession = createWinWattTrialSession({ fieldMap, title: 'Automatikus v0.8.4 próba', winWattVersion: '9.54', metricSeeds: [{ metricKey: 'floorArea', label: 'Kondicionált alapterület', dimproValue: demand.totals.conditionedFloorAreaSquareMeters, unit: 'm²', toleranceAbsolute: 0.05 }] });
  const firstApplicable = trialSession.fieldResults.find((item) => item.status === 'notTested');
  firstApplicable.status = 'matched'; firstApplicable.targetTab = 'Általános'; firstApplicable.durationSeconds = 12; firstApplicable.entryStartedAt = '2026-07-29T21:59:48.000Z'; firstApplicable.entryCompletedAt = '2026-07-29T22:00:00.000Z'; firstApplicable.verifiedAt = '2026-07-29T22:00:00.000Z';
  trialSession.status = 'inProgress'; trialSession.startedAt = '2026-07-29T22:00:00.000Z';
  trialSession.resultComparisons[0].winWattValue = demand.totals.conditionedFloorAreaSquareMeters; trialSession.resultComparisons[0].status = 'withinTolerance';
  const trialWorkspace = normalizeWinWattTrialWorkspace({ sessions: [trialSession], activeSessionId: trialSession.id });
  const trialFeedback = buildWinWattTrialFeedback(trialWorkspace, fieldMap);

  assert(fieldMap.schema === 'dimpro.winwatt-field-map.v0.8.3', 'A mezőtérkép séma hibás.');
  assert(fieldMap.totals.tableCount === 15, 'A mezőtérkép adatcsoportszáma hibás.');
  assert(fieldMap.totals.mappedFieldCount > 100, 'Túl kevés mező került a mezőtérképbe.');
  assert(fieldMap.totals.transferRecordCount > 100, 'Túl kevés átadási rekord készült.');
  assert(fieldMap.tables.some((table) => table.tableId === 'general'), 'Az általános adatcsoport hiányzik a mezőtérképből.');
  assert(fieldMap.fields.some((field) => field.targetFieldKey.startsWith('WW.building.')), 'Az épület célkulcsai hiányoznak.');
  assert(fieldMap.fields.some((field) => field.targetVerification === 'trialRequired'), 'A valós WinWatt-próbát igénylő mezők hiányoznak.');

  assert(tables.length === 15, 'A szakértői nézetnek 15 fő adattáblát kell tartalmaznia.');
  const expectedIds = ['general', 'materials', 'structures', 'layers', 'rooms', 'levels', 'zones', 'boundaries', 'openings', 'thermalBridges', 'systems', 'renovation', 'renovationComparison', 'renewables', 'sources'];
  expectedIds.forEach((id) => assert(tables.some((table) => table.id === id), `Hiányzó szakértői tábla: ${id}`));
  assert(tables.find((table) => table.id === 'rooms').rows.length === draft.rooms.length, 'A helyiségtábla rekordszáma hibás.');
  assert(tables.find((table) => table.id === 'levels').rows.length === draft.levels.length, 'A szinttábla rekordszáma hibás.');
  assert(tables.find((table) => table.id === 'boundaries').rows.length === geometry.wallRows.length, 'A határoló szerkezeti tábla rekordszáma hibás.');
  assert(tables.find((table) => table.id === 'renovation').rows.some((row) => row.scenario === 'M0'), 'A meglévő állapot hiányzik a felújítási táblából.');
  assert(tables.find((table) => table.id === 'renovationComparison').rows.length === draft.energyRenovationWorkspace.scenarios.length, 'A változat-összehasonlító tábla rekordszáma hibás.');
  assert(tables.find((table) => table.id === 'renovationComparison').rows.some((row) => row.scenario === 'M0'), 'Az M0 összehasonlító sor hiányzik.');
  assert(tables.find((table) => table.id === 'renewables').rows.length === 4, 'A megújuló/villamos tábla négy rendszersort tartalmazzon.');

  const blob = await createWinWattTransferWorkbookBlob({ tables, projectName: 'Teszt projekt', surveyName: draft.surveyName, fieldMap, trialWorkspace, trialFeedback });
  assert(blob.size > 5000, 'Az Excel munkafüzet túl kicsi vagy üres.');
  const workbook = XLSX.read(Buffer.from(await blob.arrayBuffer()), { type: 'buffer' });
  assert(workbook.SheetNames.length === 20, 'A jegyzékkel, mezőtérképpel, ellenőrzéssel és próbanaplóval együtt 20 Excel munkalap szükséges.');
  assert(workbook.SheetNames[0] === '00_Jegyzek', 'Az első munkalap legyen a jegyzék.');
  for (const name of ['01_Altalanos', '02_Anyagok', '03_Szerkezetek', '04_Retegek', '05_Helyisegek', '07_Zonak', '08_Hatarolo_szerk', '09_Nyilaszarok', '10_Hohidak', '11_Gepeszeti_rendsz', '12_Felujitasi_valt', '13_Valtozat_osszeh', '14_Megujulo_vill', '15_Forras_statusz', '16_Mezoterkep', '17_Atadas_ellenorzes', '18_Probanaplo', '19_Eredmeny_elteres']) {
    assert(workbook.SheetNames.includes(name), `Hiányzó Excel munkalap: ${name}`);
  }
  const indexRows = XLSX.utils.sheet_to_json(workbook.Sheets['00_Jegyzek'], { header: 1 });
  assert(indexRows.some((row) => row[1] === DIMPRO_WINWATT_TRANSFER_SCHEMA), 'A WinWatt-átadási séma hiányzik a jegyzékből.');
  const generalRows = XLSX.utils.sheet_to_json(workbook.Sheets['01_Altalanos'], { header: 1 });
  assert(generalRows.some((row) => row.includes('Szakmai ellenőrzés és WinWattban történő véglegesítés szükséges. Nem natív WinWatt projektfájl.')), 'A kötelező Excel korlátozás hiányzik.');
  const comparisonRows = XLSX.utils.sheet_to_json(workbook.Sheets['13_Valtozat_osszeh'], { header: 1 });
  assert(comparisonRows.some((row) => row.includes('M0')), 'Az Excel változat-összehasonlító lapján hiányzik az M0 sor.');
  const fieldMapRows = XLSX.utils.sheet_to_json(workbook.Sheets['16_Mezoterkep'], { header: 1 });
  assert(fieldMapRows.some((row) => row.includes('DIMPRO WinWatt mezőtérkép')), 'A mezőtérkép munkalap fejléc hiányzik.');
  assert(fieldMapRows.some((row) => row.includes('WW.building.cim')), 'A cím célkulcsa hiányzik az Excel mezőtérképből.');
  const validationRows = XLSX.utils.sheet_to_json(workbook.Sheets['17_Atadas_ellenorzes'], { header: 1 });
  assert(validationRows.some((row) => row.includes('DIMPRO WinWatt próbaátadási ellenőrzés')), 'Az átadási ellenőrző lap fejléc hiányzik.');
  assert(validationRows.some((row) => row[0] === 'Leképezett mezők'), 'A mezőösszesítés hiányzik az ellenőrző lapról.');

  const trialLogRows = XLSX.utils.sheet_to_json(workbook.Sheets['18_Probanaplo'], { header: 1 });
  assert(trialLogRows.some((row) => row.includes('DIMPRO WinWatt próbanapló')), 'A próbanapló munkalap fejléc hiányzik.');
  assert(trialLogRows.some((row) => row.includes('Automatikus v0.8.4 próba')), 'A próbamunkamenet hiányzik az Excelből.');
  assert(trialLogRows.some((row) => row.includes('Mezőpróba indítva') && row.includes('Mezőpróba befejezve')), 'Az Excel próbanaplóból hiányoznak a mezőidőbélyegek.');
  assert(trialLogRows.some((row) => row.includes('2026-07-29T21:59:48.000Z') && row.includes('2026-07-29T22:00:00.000Z')), 'Az Excel próbanapló nem tartalmazza a tényleges mezőidőbélyegeket.');
  const trialResultRows = XLSX.utils.sheet_to_json(workbook.Sheets['19_Eredmeny_elteres'], { header: 1 });
  assert(trialResultRows.some((row) => row.includes('DIMPRO–WinWatt eredmény-összevetés')), 'Az eredményeltérés munkalap fejléc hiányzik.');

  const trialBlob = await createWinWattTrialPackageBlob({ workbookBlob: blob, packageData: { schema: 'dimpro.winwatt-compatible.v0.8.4', winWattFieldMap: fieldMap, winWattTrialFeedback: trialFeedback }, fieldMap, trialWorkspace, trialFeedback, projectName: 'Teszt projekt', surveyName: draft.surveyName });
  assert(trialBlob.size > 5000, 'A ZIP próbaátadási csomag túl kicsi vagy üres.');
  const zip = await JSZip.loadAsync(Buffer.from(await trialBlob.arrayBuffer()));
  const zipNames = Object.keys(zip.files).sort();
  for (const expected of ['README.txt', 'manifest.json']) assert(zipNames.includes(expected), `Hiányzó ZIP fájl: ${expected}`);
  assert(zipNames.some((name) => name.endsWith('_winwatt_elokeszito_v084.xlsx')), 'A ZIP-ből hiányzik az Excel munkafüzet.');
  assert(zipNames.some((name) => name.endsWith('_winwatt_adatcsomag_v084.json')), 'A ZIP-ből hiányzik a JSON adatcsomag.');
  assert(zipNames.some((name) => name.endsWith('_winwatt_mezoterkep.csv')), 'A ZIP-ből hiányzik a mezőtérkép CSV.');
  assert(zipNames.some((name) => name.endsWith('_winwatt_atadasi_rekordok.csv')), 'A ZIP-ből hiányzik az átadási rekord CSV.');
  assert(zipNames.some((name) => name.endsWith('_winwatt_atadasi_hibak.csv')), 'A ZIP-ből hiányzik az ellenőrzési CSV.');
  assert(zipNames.some((name) => name.endsWith('_winwatt_probavisszacsatolas_v084.json')), 'A ZIP-ből hiányzik a próba-visszacsatolási JSON.');
  assert(zipNames.some((name) => name.endsWith('_winwatt_probanaplo.csv')), 'A ZIP-ből hiányzik a próbanapló CSV.');
  assert(zipNames.some((name) => name.endsWith('_winwatt_eredmeny_elteres.csv')), 'A ZIP-ből hiányzik az eredményeltérés CSV.');
  const trialLogCsvName = zipNames.find((name) => name.endsWith('_winwatt_probanaplo.csv'));
  const trialLogCsv = await zip.file(trialLogCsvName).async('string');
  assert(trialLogCsv.includes('Mezőpróba_indítva') && trialLogCsv.includes('Mezőpróba_befejezve'), 'A ZIP próbanapló fejlécéből hiányoznak a mezőidőbélyegek.');
  assert(trialLogCsv.includes('2026-07-29T21:59:48.000Z') && trialLogCsv.includes('2026-07-29T22:00:00.000Z'), 'A ZIP próbanapló nem tartalmazza a mezőpróba időbélyegeit.');
  const manifestName = zipNames.find((name) => name === 'manifest.json');
  const manifest = JSON.parse(await zip.file(manifestName).async('string'));
  assert(manifest.schema === 'dimpro.winwatt-trial-package.v0.8.4', 'A ZIP manifest séma hibás.');
  assert(manifest.fieldMapSchema === 'dimpro.winwatt-field-map.v0.8.3', 'A ZIP manifest mezőtérkép-sémája hibás.');
  assert(manifest.workbookSchema === 'dimpro.winwatt-transfer.v0.8.4', 'A ZIP manifest workbook-sémája hibás.');
  assert(manifest.jsonSchema === 'dimpro.winwatt-compatible.v0.8.4', 'A ZIP manifest JSON-sémája hibás.');
  assert(manifest.trialFeedbackSchema === 'dimpro.winwatt-trial-feedback.v0.8.4', 'A ZIP manifest próba-feedback sémája hibás.');
  assert(manifest.trialTotals.sessionCount === 1 && manifest.trialTotals.verifiedFieldCount === 1, 'A ZIP manifest próbaösszesítője hibás.');

  console.log(JSON.stringify({ ok: true, testCount: count, tableCount: tables.length, fieldMapTotals: fieldMap.totals, readyForTrialTransfer: fieldMap.readyForTrialTransfer, sheetNames: workbook.SheetNames, workbookBytes: blob.size, trialPackageBytes: trialBlob.size, zipNames }, null, 2));
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
