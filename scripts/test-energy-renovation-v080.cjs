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
  createDefaultEnergyRenovationWorkspace,
  createEnergyRenovationMeasure,
  createProposalRenovationScenario,
  getRenovationMeasureTemplates,
  normalizeEnergyRenovationWorkspace,
} = require('../components/energy/domain/energyRenovationTypes.ts');
const { createDefaultEnergyFieldWorkflowState, normalizeEnergyFieldWorkflowState } = require('../components/energy/domain/energyFieldWorkflowTypes.ts');

let count = 0;
function assert(condition, message) {
  count += 1;
  if (!condition) throw new Error(`Teszt ${count}: ${message}`);
}

const workflow = createDefaultEnergyFieldWorkflowState();
assert(workflow.schemaVersion === 1, 'Hibás workflow séma.');
assert(workflow.mode === 'field', 'Az alapmód legyen terepi.');
assert(workflow.activeScenarioId === 'scenario-existing', 'Az alap aktív forgatókönyv legyen a meglévő állapot.');
const normalizedWorkflow = normalizeEnergyFieldWorkflowState({ mode: 'expert', activeScenarioId: '', completedStepIds: ['property', 'property', '', 'plan'], showOnlyIncomplete: true });
assert(normalizedWorkflow.mode === 'expert', 'A szakértői mód normalizálása hibás.');
assert(normalizedWorkflow.completedStepIds.length === 2, 'A lépéslista duplikációszűrése hibás.');
assert(normalizedWorkflow.showOnlyIncomplete === true, 'A hiányos lépések szűrője hibás.');

const workspace = createDefaultEnergyRenovationWorkspace();
assert(workspace.schemaVersion === 1, 'Hibás felújítási munkatér séma.');
assert(workspace.scenarios.length === 2, 'Alapból meglévő és egy javasolt változat szükséges.');
assert(workspace.scenarios[0].kind === 'existing', 'Az első változat legyen meglévő állapot.');
assert(workspace.scenarios[1].kind === 'proposal', 'A második változat legyen javaslat.');
assert(workspace.activeScenarioId === 'scenario-field-proposal', 'A helyszíni javaslat legyen aktív.');

const templates = getRenovationMeasureTemplates();
assert(templates.length >= 16, 'Minden fő szerkezeti, gépészeti és megújuló kategóriához kell sablon.');
for (const category of ['externalWall', 'atticFloor', 'basementWall', 'basementCeiling', 'groundFloor', 'opening', 'heating', 'cooling', 'pv', 'solarThermal', 'battery', 'evCharging']) {
  assert(templates.some((template) => template.category === category), `Hiányzó intézkedéssablon: ${category}`);
}

const measure = createEnergyRenovationMeasure('externalWall', {
  title: '38 cm tömör tégla + hőszigetelés',
  existingDescription: 'Szigeteletlen fal',
  proposedDescription: 'Külső oldali hőszigetelés',
  currentValue: 1.35,
  targetValue: 0.24,
  unit: 'W/m²K',
  effectLevel: 'high',
  dataStatus: 'reviewRequired',
  sourceReference: 'Helyszíni feltárás és rétegrend',
});
assert(measure.category === 'externalWall', 'A kategória hibás.');
assert(measure.included === true, 'Az új intézkedés legyen beválasztva.');
assert(measure.currentValue === 1.35 && measure.targetValue === 0.24, 'A célértékek hibásak.');
assert(measure.dataStatus === 'reviewRequired', 'Az adatstátusz hibás.');

const proposal = createProposalRenovationScenario(2, { name: 'Komplex felújítás', measures: [measure] });
assert(proposal.code === 'T2', 'Hibás automatikus forgatókönyv-kód.');
assert(proposal.measures.length === 1, 'A forgatókönyv intézkedése elveszett.');
assert(proposal.baseScenarioId === 'scenario-existing', 'A javaslat a meglévő állapotból induljon.');

const migrated = normalizeEnergyRenovationWorkspace({
  activeScenarioId: 'missing',
  scenarios: [{
    id: 'legacy-proposal',
    code: 'R1',
    name: 'Régi változat',
    kind: 'proposal',
    description: '',
    status: 'draft',
    measures: [{ ...measure, id: 'legacy-measure', updatedAt: '', createdAt: '' }],
    createdAt: '',
    updatedAt: '',
  }],
});
assert(migrated.scenarios.some((scenario) => scenario.id === 'scenario-existing'), 'A migráció pótolja a meglévő állapotot.');
assert(migrated.scenarios.some((scenario) => scenario.id === 'legacy-proposal'), 'A régi javaslat maradjon meg.');
assert(migrated.activeScenarioId === 'legacy-proposal', 'Érvénytelen aktív azonosítónál az első javaslat legyen aktív.');
const migratedMeasure = migrated.scenarios.find((scenario) => scenario.id === 'legacy-proposal').measures[0];
assert(Boolean(migratedMeasure.createdAt) && Boolean(migratedMeasure.updatedAt), 'A migráció pótolja az időbélyegeket.');

const existingInput = normalizeEnergyRenovationWorkspace({
  activeScenarioId: 'scenario-existing',
  scenarios: [{
    id: 'scenario-existing',
    code: 'OLD',
    name: 'Meglévő állapot módosított',
    kind: 'existing',
    description: 'Leírás',
    status: 'validated',
    measures: [measure],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }],
});
const existing = existingInput.scenarios.find((scenario) => scenario.id === 'scenario-existing');
assert(existing.code === 'OLD', 'A meglévő állapot egyedi kódja megmaradhat.');
assert(existing.measures.length === 0, 'A meglévő állapot nem tartalmazhat felújítási intézkedést.');
assert(existing.status === 'validated', 'A validált meglévő állapot státusza megmaradjon.');
assert(existingInput.scenarios.some((scenario) => scenario.kind === 'proposal'), 'A migráció pótolja a hiányzó javasolt változatot.');

console.log(JSON.stringify({ ok: true, testCount: count, templateCount: templates.length, sample: proposal }, null, 2));
