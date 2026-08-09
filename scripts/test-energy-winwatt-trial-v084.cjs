const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) request = path.join(root, request.slice(2));
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText, filename);
};

const {
  createDefaultWinWattTrialWorkspace,
  createWinWattTrialSession,
  finishWinWattTrialField,
  getWinWattTrialFieldElapsedSeconds,
  normalizeWinWattTrialWorkspace,
  startWinWattTrialField,
} = require('../components/energy/domain/energyWinWattTrialTypes.ts');
const { buildWinWattTrialFeedback } = require('../components/energy/transfers/winwatt/buildWinWattTrialFeedback.ts');

let count = 0;
function assert(condition, message) {
  count += 1;
  if (!condition) throw new Error(`Teszt ${count}: ${message}`);
}

const fieldMap = {
  schema: 'dimpro.winwatt-field-map.v0.8.3',
  generatedAt: '2026-07-29T20:00:00.000Z',
  disclaimer: 'teszt',
  fields: [
    { id: 'field-address', sourceTableId: 'general', sourceTableLabel: 'Általános', sourceColumnKey: 'value', sourceColumnLabel: 'Cím', sourcePath: 'general.address', targetGroupId: 'building', targetGroupLabel: 'Épület', targetFieldKey: 'WW.building.cim', targetFieldLabel: 'Cím', requirement: 'required', transferMode: 'directCopy', targetVerification: 'referenceAligned', dataType: 'text', note: '', recordCount: 1, populatedCount: 1, missingCount: 0, invalidCount: 0, readiness: 'ready', readinessMessage: 'rendben' },
    { id: 'field-u', sourceTableId: 'structures', sourceTableLabel: 'Szerkezetek', sourceColumnKey: 'uValue', sourceColumnLabel: 'U-érték', sourceUnit: 'W/m²K', sourcePath: 'structures.uValue', targetGroupId: 'structures', targetGroupLabel: 'Szerkezetek', targetFieldKey: 'WW.structures.uValue', targetFieldLabel: 'U érték', targetUnit: 'W/m²K', requirement: 'required', transferMode: 'manualReview', targetVerification: 'trialRequired', dataType: 'number', note: '', recordCount: 1, populatedCount: 1, missingCount: 0, invalidCount: 0, readiness: 'reviewRequired', readinessMessage: 'próba kell' },
    { id: 'field-pv', sourceTableId: 'renewables', sourceTableLabel: 'Megújuló', sourceColumnKey: 'pv', sourceColumnLabel: 'PV', sourcePath: 'renewables.pv', targetGroupId: 'renewables', targetGroupLabel: 'Megújuló', targetFieldKey: 'WW.renewables.pv', targetFieldLabel: 'Napelem', requirement: 'optional', transferMode: 'referenceOnly', targetVerification: 'dimproExtension', dataType: 'text', note: '', recordCount: 0, populatedCount: 0, missingCount: 0, invalidCount: 0, readiness: 'notApplicable', readinessMessage: 'nem alkalmazandó' },
    { id: 'field-system', sourceTableId: 'systems', sourceTableLabel: 'Rendszerek', sourceColumnKey: 'capacity', sourceColumnLabel: 'Kapacitás', sourceUnit: 'kW', sourcePath: 'systems.capacity', targetGroupId: 'systems', targetGroupLabel: 'Rendszerek', targetFieldKey: 'WW.systems.capacity', targetFieldLabel: 'Teljesítmény', targetUnit: 'kW', requirement: 'conditional', transferMode: 'manualReview', targetVerification: 'trialRequired', dataType: 'number', note: '', recordCount: 1, populatedCount: 1, missingCount: 0, invalidCount: 0, readiness: 'reviewRequired', readinessMessage: 'próba kell' },
  ],
  records: [], tables: [], validationMessages: [],
  totals: { tableCount: 4, mappedFieldCount: 4, transferRecordCount: 3, readyFieldCount: 1, reviewFieldCount: 2, blockedFieldCount: 0, requiredFieldCount: 2, missingRequiredValueCount: 0, invalidValueCount: 0, referenceAlignedFieldCount: 1, dimproExtensionFieldCount: 1, trialRequiredFieldCount: 2 },
  readyForTrialTransfer: true,
};

const empty = createDefaultWinWattTrialWorkspace();
assert(empty.schemaVersion === 1, 'Az üres workspace séma hibás.');
assert(empty.sessions.length === 0, 'Az üres workspace ne tartalmazzon munkamenetet.');
assert(!empty.activeSessionId, 'Az üres workspace ne tartalmazzon aktív munkamenetet.');

const normalizedEmpty = normalizeWinWattTrialWorkspace(null);
assert(normalizedEmpty.sessions.length === 0, 'A null migráció üres workspace legyen.');
assert(normalizedEmpty.schemaVersion === 1, 'A null migráció sémahibás.');

const session = createWinWattTrialSession({
  fieldMap,
  title: 'Első WinWatt próba',
  winWattVersion: '9.54',
  operatorName: 'Tesztelő',
  workstation: 'WS-01',
  metricSeeds: [
    { metricKey: 'heatLoss', label: 'Teljes hőveszteség', dimproValue: 80, unit: 'W/K', toleranceAbsolute: 0.2, tolerancePercent: 0.5 },
    { metricKey: 'primary', label: 'Primerenergia', unit: 'kWh/m²év', tolerancePercent: 1 },
  ],
});
assert(session.title === 'Első WinWatt próba', 'A munkamenet neve hibás.');
assert(session.winWattVersion === '9.54', 'A WinWatt verzió hibás.');
assert(session.operatorName === 'Tesztelő', 'Az operátor hibás.');
assert(session.workstation === 'WS-01', 'A munkaállomás hibás.');
assert(session.sourcePackageSchema === 'dimpro.winwatt-trial-package.v0.8.4', 'A forráscsomag séma hibás.');
assert(session.fieldResults.length === 4, 'Minden mezőhöz eredmény szükséges.');
assert(session.fieldResults.find((item) => item.fieldMapId === 'field-pv').status === 'skipped', 'A nem alkalmazandó mező legyen kihagyva.');
assert(session.fieldResults.find((item) => item.fieldMapId === 'field-address').inputMethod === 'copyPaste', 'A közvetlen mező alap beviteli módja hibás.');
assert(session.fieldResults.find((item) => item.fieldMapId === 'field-u').inputMethod === 'typing', 'A kézi mező alap beviteli módja hibás.');
assert(session.resultComparisons.length === 2, 'A referenciaeredmények száma hibás.');
assert(session.resultComparisons[0].dimproValue === 80, 'A DIMPRO referenciaérték hibás.');
assert(session.resultComparisons[1].dimproValue === undefined, 'A nem számított DIMPRO mutató maradjon üres.');
assert(session.activeFieldMapId === 'field-address', 'Az új munkamenet első alkalmazandó mezője legyen aktív.');

const timedField = startWinWattTrialField(session.fieldResults.find((item) => item.fieldMapId === 'field-address'), '2026-07-30T08:00:00.000Z');
assert(timedField.entryStartedAt === '2026-07-30T08:00:00.000Z', 'A mezőpróba kezdési ideje hiányzik.');
assert(getWinWattTrialFieldElapsedSeconds(timedField, '2026-07-30T08:00:12.500Z') === 12.5, 'Az aktív mezőpróba eltelt ideje hibás.');
const restartedField = startWinWattTrialField(timedField, '2026-07-30T08:00:20.000Z');
assert(restartedField.entryStartedAt === timedField.entryStartedAt, 'Futó mezőpróba ne induljon újra második kezdési idővel.');
const finishedField = finishWinWattTrialField(timedField, 'matched', '2026-07-30T08:00:18.500Z');
assert(finishedField.durationSeconds === 18.5, 'A lezárt mezőpróba automatikus időtartama hibás.');
assert(!finishedField.entryStartedAt && finishedField.entryCompletedAt === '2026-07-30T08:00:18.500Z', 'A lezárt mezőpróba időbélyegei hibásak.');
assert(finishedField.verifiedAt === '2026-07-30T08:00:18.500Z', 'Az egyező mező visszaigazolási időpontja hiányzik.');
const accumulatedField = finishWinWattTrialField({ ...timedField, durationSeconds: 7.5 }, 'targetAdjusted', '2026-07-30T08:00:10.000Z');
assert(accumulatedField.durationSeconds === 17.5, 'A megismételt mezőpróba ideje nem adódott össze.');
const skippedField = finishWinWattTrialField({ ...timedField, inputMethod: 'typing' }, 'skipped', '2026-07-30T08:00:05.000Z');
assert(skippedField.inputMethod === 'notApplicable', 'A kihagyott mező beviteli módja legyen nem alkalmazandó.');

const address = session.fieldResults.find((item) => item.fieldMapId === 'field-address');
const uValue = session.fieldResults.find((item) => item.fieldMapId === 'field-u');
const system = session.fieldResults.find((item) => item.fieldMapId === 'field-system');
address.status = 'matched'; address.targetWindow = 'Épület'; address.targetTab = 'Általános'; address.targetFieldLabel = 'Cím'; address.durationSeconds = 20; address.verifiedAt = '2026-07-29T21:00:00.000Z';
uValue.status = 'targetAdjusted'; uValue.targetWindow = 'Szerkezet'; uValue.targetTab = 'Energetika'; uValue.targetFieldLabel = 'Eredő hőátbocsátási tényező'; uValue.durationSeconds = 45; uValue.verifiedAt = '2026-07-29T21:01:00.000Z';
system.status = 'blocked'; system.durationSeconds = 15; system.note = 'A célmező nem található.';
session.status = 'inProgress';
session.startedAt = '2026-07-29T21:00:00.000Z';
session.updatedAt = '2026-07-29T21:02:00.000Z';
session.resultComparisons[0].winWattValue = 80.1; session.resultComparisons[0].status = 'withinTolerance';
session.resultComparisons[1].winWattValue = 200; session.resultComparisons[1].status = 'notComparable';

const workspace = normalizeWinWattTrialWorkspace({ schemaVersion: 1, activeSessionId: session.id, sessions: [session], updatedAt: session.updatedAt });
assert(workspace.sessions.length === 1, 'A munkamenet migráció elvesztette a próbát.');
assert(workspace.activeSessionId === session.id, 'Az aktív munkamenet hibás.');
assert(workspace.sessions[0].fieldResults.length === 4, 'A mezőeredmény migráció hibás.');
assert(workspace.sessions[0].resultComparisons.length === 2, 'Az eredmény-összevetés migráció hibás.');
assert(workspace.sessions[0].activeFieldMapId === session.activeFieldMapId, 'Az aktív próbamező migrációja hibás.');
const normalizedTimed = normalizeWinWattTrialWorkspace({ sessions: [{ ...session, activeFieldMapId: 'missing-field', fieldResults: [{ ...timedField, entryCompletedAt: '2026-07-30T08:00:18.500Z' }] }] });
assert(normalizedTimed.sessions[0].activeFieldMapId === timedField.fieldMapId, 'Érvénytelen aktív mező esetén az első alkalmazandó mezőre kell visszaállni.');
assert(normalizedTimed.sessions[0].fieldResults[0].entryStartedAt === timedField.entryStartedAt, 'A folyamatban lévő mezőidő migrációja hibás.');
assert(normalizedTimed.sessions[0].fieldResults[0].entryCompletedAt === '2026-07-30T08:00:18.500Z', 'A mező befejezési idő migrációja hibás.');

const feedback = buildWinWattTrialFeedback(workspace, fieldMap);
assert(feedback.schema === 'dimpro.winwatt-trial-feedback.v0.8.4', 'A feedback séma hibás.');
assert(feedback.totals.sessionCount === 1, 'A munkamenetszám hibás.');
assert(feedback.sessionSummaries.length === 1, 'A munkamenet-összesítő hiányzik.');
const summary = feedback.sessionSummaries[0];
assert(summary.totalFieldCount === 3, 'A nem alkalmazandó mező ne legyen a nevezőben.');
assert(summary.testedFieldCount === 3, 'A próbált mezők száma hibás.');
assert(summary.notTestedFieldCount === 0, 'Nem maradhat próbálatlan alkalmazandó mező.');
assert(summary.matchedFieldCount === 1, 'Az egyező mezők száma hibás.');
assert(summary.adjustedFieldCount === 1, 'A pontosított mezők száma hibás.');
assert(summary.blockedFieldCount === 1, 'A blokkolt mezők száma hibás.');
assert(summary.verifiedFieldCount === 2, 'A visszaigazolt mezők száma hibás.');
assert(summary.progressPercent === 100, 'A haladás hibás.');
assert(summary.durationSeconds === 80, 'A rögzített idő hibás.');
assert(summary.comparedMetricCount === 2, 'Az összevetett mutatók száma hibás.');
assert(summary.withinToleranceMetricCount === 1, 'A tűrésen belüli eredmények száma hibás.');
assert(summary.notComparableMetricCount === 1, 'A nem összehasonlítható eredmények száma hibás.');
assert(summary.readyToComplete === false, 'Blokkolt mezővel nem zárható le a próba.');
assert(feedback.verifiedMappings.length === 2, 'A visszaigazolt mezőtérkép száma hibás.');
assert(feedback.verifiedMappings.some((item) => item.targetFieldLabel === 'Eredő hőátbocsátási tényező'), 'A pontosított célfelirat hiányzik.');
assert(feedback.totals.blockedFieldCount === 1, 'A globális blokkolt mezőszám hibás.');
assert(feedback.totals.comparedMetricCount === 2, 'A globális eredményösszevetés-szám hibás.');

const duplicateSession = JSON.parse(JSON.stringify(session));
duplicateSession.id = 'second-session';
duplicateSession.status = 'completed';
duplicateSession.completedAt = '2026-07-29T22:00:00.000Z';
duplicateSession.updatedAt = '2026-07-29T22:00:00.000Z';
const duplicateU = duplicateSession.fieldResults.find((item) => item.fieldMapId === 'field-u');
duplicateU.status = 'unitAdjusted'; duplicateU.targetUnit = 'W/(m²K)'; duplicateU.verifiedAt = '2026-07-29T22:00:00.000Z';
duplicateSession.fieldResults.push({ ...duplicateU, id: 'duplicate-field-result', targetUnit: 'HIBÁS DUPLIKÁTUM' });
const latestFeedback = buildWinWattTrialFeedback(normalizeWinWattTrialWorkspace({ sessions: [session, duplicateSession], activeSessionId: duplicateSession.id }), fieldMap);
assert(latestFeedback.totals.sessionCount === 2, 'A két munkamenet száma hibás.');
assert(latestFeedback.totals.completedSessionCount === 1, 'A lezárt munkamenetszám hibás.');
assert(latestFeedback.verifiedMappings.find((item) => item.fieldMapId === 'field-u').targetUnit === 'W/(m²K)', 'A legutóbbi visszaigazolás kiválasztása hibás.');
assert(!latestFeedback.verifiedMappings.some((item) => item.targetUnit === 'HIBÁS DUPLIKÁTUM'), 'A duplikált mezőeredményt ki kell szűrni.');

console.log(JSON.stringify({ ok: true, testCount: count, sessionSummary: summary, totals: feedback.totals, verifiedMappings: feedback.verifiedMappings }, null, 2));
