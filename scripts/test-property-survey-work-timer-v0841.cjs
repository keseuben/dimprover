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

const timer = require('../components/property-survey/propertySurveyWorkTimer.ts');
let count = 0;
function assert(condition, message) { count += 1; if (!condition) throw new Error(`Teszt ${count}: ${message}`); }

const t0 = '2026-07-30T06:00:00.000Z';
const t1 = '2026-07-30T06:10:00.000Z';
const t2 = '2026-07-30T06:15:00.000Z';
const t3 = '2026-07-30T06:20:00.000Z';
const t4 = '2026-07-30T06:30:00.000Z';

const empty = timer.createDefaultPropertySurveyWorkTimerWorkspace(t0);
assert(empty.schemaVersion === 1, 'Az alap séma hibás.');
assert(empty.status === 'idle', 'Az alap státusz nem idle.');
assert(empty.sessions.length === 0, 'Az alap workspace ne tartalmazzon munkamenetet.');
assert(!empty.activeSessionId, 'Az alap workspace ne tartalmazzon aktív azonosítót.');

const migrated = timer.normalizePropertySurveyWorkTimerWorkspace(null);
assert(migrated.schemaVersion === 1, 'A null migráció sémahibás.');
assert(migrated.sessions.length === 0, 'A null migráció ne hozzon létre munkamenetet.');

let workspace = timer.startPropertySurveyWorkSession(empty, 'property', { operatorName: 'Tesztelő', deviceLabel: 'Tablet', now: t0 });
assert(workspace.status === 'running', 'Indítás után futnia kell.');
assert(workspace.sessions.length === 1, 'Egy munkamenet szükséges.');
assert(Boolean(workspace.activeSessionId), 'Aktív munkamenet-azonosító szükséges.');
assert(workspace.sessions[0].operatorName === 'Tesztelő', 'Az operátor elveszett.');
assert(workspace.sessions[0].deviceLabel === 'Tablet', 'Az eszköz elveszett.');
assert(workspace.sessions[0].segments.length === 1, 'Az első szakasz hiányzik.');
assert(workspace.sessions[0].segments[0].stepId === 'property', 'A kezdő munkalap hibás.');

const duplicateStart = timer.startPropertySurveyWorkSession(workspace, 'plan', { now: t1 });
assert(duplicateStart.sessions.length === 1, 'Futó munkamenet mellett ne induljon új.');

workspace = timer.switchPropertySurveyWorkStep(workspace, 'plan', t1);
assert(workspace.sessions[0].segments.length === 2, 'A munkalapváltás új szakaszt hozzon létre.');
assert(workspace.sessions[0].segments[0].endedAt === t1, 'Az előző szakasz lezárása hibás.');
assert(workspace.sessions[0].segments[1].stepId === 'plan', 'Az új munkalap hibás.');

const sameStep = timer.switchPropertySurveyWorkStep(workspace, 'plan', t2);
assert(sameStep.sessions[0].segments.length === 2, 'Azonos munkalap ne hozzon létre új szakaszt.');

workspace = timer.pausePropertySurveyWorkSession(workspace, t2);
assert(workspace.status === 'paused', 'A szünet státusza hibás.');
assert(workspace.sessions[0].segments[1].endedAt === t2, 'A szünet nem zárta le a szakaszt.');
let summary = timer.getPropertySurveyWorkTimerSummary(workspace, t3);
assert(summary.currentSeconds === 900, `A szünet előtti idő 900 másodperc legyen, kapott: ${summary.currentSeconds}.`);

workspace = timer.resumePropertySurveyWorkSession(workspace, 'energy', t3);
assert(workspace.status === 'running', 'A folytatás státusza hibás.');
assert(workspace.sessions[0].segments.length === 3, 'A folytatás új szakaszt hozzon létre.');
assert(workspace.sessions[0].segments[2].stepId === 'energy', 'A folytatás munkalapja hibás.');

workspace = timer.patchPropertySurveyWorkSession(workspace, workspace.activeSessionId, { note: 'Helyszíni mérés', manualAdjustmentSeconds: 120 }, t3);
assert(workspace.sessions[0].note === 'Helyszíni mérés', 'A megjegyzés nem mentődött.');
assert(workspace.sessions[0].manualAdjustmentSeconds === 120, 'A kézi korrekció hibás.');
summary = timer.getPropertySurveyWorkTimerSummary(workspace, t4);
assert(summary.currentSeconds === 1620, `A futó összes idő 1620 másodperc legyen, kapott: ${summary.currentSeconds}.`);
assert(summary.stepSeconds.property === 600, 'Az ingatlan munkalap ideje hibás.');
assert(summary.stepSeconds.plan === 300, 'Az alaprajz munkalap ideje hibás.');
assert(summary.stepSeconds.energy === 600, 'Az energetika munkalap ideje hibás.');
assert(summary.todaySeconds === 1620, 'A mai idő hibás.');
assert(summary.totalSeconds === 1620, 'A felmérés összes ideje hibás.');
assert(summary.sessionCount === 1, 'A munkamenetszám hibás.');

workspace = timer.finishPropertySurveyWorkSession(workspace, t4);
assert(workspace.status === 'idle', 'Lezárás után idle státusz szükséges.');
assert(!workspace.activeSessionId, 'Lezárás után ne legyen aktív azonosító.');
assert(workspace.sessions[0].status === 'completed', 'A munkamenet nem lett lezárva.');
assert(workspace.sessions[0].endedAt === t4, 'A lezárási idő hibás.');
assert(timer.getPropertySurveyWorkSessionSeconds(workspace.sessions[0], t4) === 1620, 'A lezárt idő hibás.');

const normalized = timer.normalizePropertySurveyWorkTimerWorkspace({ schemaVersion: 1, status: 'running', activeSessionId: 'missing', sessions: [{ id: 'old', startedAt: t0, status: 'completed', manualAdjustmentSeconds: -30, segments: [] }] });
assert(normalized.status === 'idle', 'Árva aktív azonosítóval idle státusz szükséges.');
assert(!normalized.activeSessionId, 'Az árva aktív azonosítót törölni kell.');
assert(normalized.sessions[0].manualAdjustmentSeconds === 0, 'A negatív korrekciót normalizálni kell.');
assert(timer.formatPropertySurveyWorkDuration(0) === '00:00:00', 'A nulla idő formázása hibás.');
assert(timer.formatPropertySurveyWorkDuration(3661) === '01:01:01', 'Az időformázás hibás.');

console.log(JSON.stringify({ ok: true, testCount: count, summary: timer.getPropertySurveyWorkTimerSummary(workspace, t4) }, null, 2));
