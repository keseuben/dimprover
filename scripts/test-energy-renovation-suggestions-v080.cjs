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
const { normalizeEnergyRenewableWorkspace, createEnergyRoofSurface } = require('../components/energy/domain/energyRenewableTypes.ts');
const { huEkm20231101AssemblyRuleData } = require('../components/energy/regulations/HU_EKM_2023_11_01/factors.ts');
const { buildRenovationSuggestions } = require('../components/energy/calculations/renovation/buildRenovationSuggestions.ts');

let count = 0;
function assert(condition, message) {
  count += 1;
  if (!condition) throw new Error(`Teszt ${count}: ${message}`);
}

const draft = createSampleSurveyDraft('v0.8.0 felújítási javaslat minta');
const roof = createEnergyRoofSurface({ id: 'roof-test', name: 'Déli tetősík', status: 'selected', grossAreaSquareMeters: 40, usableAreaSquareMeters: 30, shadingFactor: 0.95, sourceReference: 'Helyszíni mérés', structuralAssessment: 'Statikus ellenőrizze' });
draft.energyRenewableWorkspace = normalizeEnergyRenewableWorkspace({
  enabled: true,
  roofSurfaces: [roof],
  electricityProfile: { annualConsumptionKwh: 5000, daytimeConsumptionSharePercent: 40, simultaneousBaseLoadKw: 2, phaseMode: 'threePhase', connectionAmpsPerPhase: 32, connectionVoltageV: 400, sourceReference: 'Számla és mérőhely', dataStatus: 'documented' },
  pv: { ...draft.energyRenewableWorkspace.pv, enabled: true, roofSurfaceIds: ['roof-test'], panelCount: 12, inverterAcPowerKw: 5, specificYieldKwhPerKwpYear: 1150, sourceReference: 'Hozam-előméretezés' },
  solarThermal: { ...draft.energyRenewableWorkspace.solarThermal, enabled: true, roofSurfaceId: 'roof-test', collectorAreaSquareMeters: 4, persons: 4, specificYieldKwhPerSquareMeterYear: 500, sourceReference: 'Gyártói előadat' },
  battery: { ...draft.energyRenewableWorkspace.battery, enabled: true, nominalCapacityKwh: 10, usableCapacityKwh: 9, maxChargePowerKw: 5, maxDischargePowerKw: 5, sourceReference: 'Gyártói adatlap' },
  evCharging: { ...draft.energyRenewableWorkspace.evCharging, enabled: true, sourceReference: 'Tulajdonosi futásadat' },
});

const geometry = calculateEnvelopeGeometry({ rooms: draft.rooms, levels: draft.levels, wallSegments: draft.wallSegments, wallOpenings: draft.wallOpenings, sectionLines: draft.sectionLines, northAngle: draft.northAngle });
const assemblies = calculateAssemblySet({ assemblies: draft.assemblies, rules: huEkm20231101AssemblyRuleData, requirementLevel: draft.energyProjectSettings.requirementLevel });
const zones = calculateEnergyZones({ workspace: draft.energyZoneWorkspace, rooms: draft.rooms, levels: draft.levels, wallSegments: draft.wallSegments, wallOpenings: draft.wallOpenings, geometry });
const openings = calculateEnergyOpenings({ workspace: draft.energyOpeningWorkspace, openings: draft.wallOpenings, requirementLevel: draft.energyProjectSettings.requirementLevel });
const demand = calculateEnergyDemand({ workspace: draft.energyDemandWorkspace, geometry, zoneWorkspace: draft.energyZoneWorkspace, zoneSet: zones, rooms: draft.rooms, levels: draft.levels, wallSegments: draft.wallSegments, wallOpenings: draft.wallOpenings, assemblies: draft.assemblies, assemblySet: assemblies, openingWorkspace: draft.energyOpeningWorkspace, openingSet: openings, sectionLines: draft.sectionLines, mechanicalDevices: draft.mechanicalDevices });
const renewables = calculateEnergyRenewableSizing(draft.energyRenewableWorkspace);

const first = buildRenovationSuggestions({ workspace: draft.energyRenovationWorkspace, assemblies: draft.assemblies, assemblySet: assemblies, wallOpenings: draft.wallOpenings, openingSet: openings, demandWorkspace: draft.energyDemandWorkspace, demandSet: demand, renewableWorkspace: draft.energyRenewableWorkspace, renewableResult: renewables });
assert(first.suggestionCount > 0, 'A számításból legalább egy felújítási javaslat szükséges.');
assert(first.addedCount === first.suggestionCount, 'Első futáskor minden számított javaslat legyen új.');
const proposal = first.workspace.scenarios.find((scenario) => scenario.id === first.workspace.activeScenarioId);
assert(proposal && proposal.kind === 'proposal', 'A javaslatok tervezett változatba kerüljenek.');
assert(proposal.status === 'reviewRequired', 'A generált változat szakmai ellenőrzést igényeljen.');
for (const category of ['heating', 'hotWater', 'pv', 'solarThermal', 'battery', 'evCharging']) {
  assert(proposal.measures.some((measure) => measure.category === category), `Hiányzó automatikus javaslatkategória: ${category}`);
}
assert(proposal.measures.filter((measure) => measure.included).every((measure) => measure.sourceReference), 'Minden generált intézkedéshez forrás szükséges.');
assert(proposal.measures.every((measure) => measure.dataStatus === 'reviewRequired' || measure.dataStatus === 'winwattFinalization'), 'A generált intézkedések nem kaphatnak automatikusan validált státuszt.');

const firstMeasure = proposal.measures[0];
firstMeasure.included = false;
firstMeasure.note = 'Felhasználói megjegyzés maradjon meg.';
const second = buildRenovationSuggestions({ workspace: first.workspace, assemblies: draft.assemblies, assemblySet: assemblies, wallOpenings: draft.wallOpenings, openingSet: openings, demandWorkspace: draft.energyDemandWorkspace, demandSet: demand, renewableWorkspace: draft.energyRenewableWorkspace, renewableResult: renewables });
const secondProposal = second.workspace.scenarios.find((scenario) => scenario.id === second.workspace.activeScenarioId);
assert(second.addedCount === 0, 'Második futás ne duplikálja a számított javaslatokat.');
assert(second.updatedCount === second.suggestionCount, 'Második futás frissítse a meglévő számított javaslatokat.');
assert(secondProposal.measures.length === proposal.measures.length, 'A javaslatfrissítés ne növelje a rekordszámot.');
const preserved = secondProposal.measures.find((measure) => measure.id === firstMeasure.id);
assert(preserved.included === false, 'A felhasználói beválasztási döntés maradjon meg frissítéskor.');
assert(preserved.note === 'Felhasználói megjegyzés maradjon meg.', 'A felhasználói megjegyzés maradjon meg frissítéskor.');

const manual = { ...proposal.measures[0], id: 'manual-measure', category: 'other', targetEntityId: undefined, title: 'Kézi egyedi javaslat', sourceReference: 'Helyszíni szakmai döntés' };
const withManual = { ...second.workspace, scenarios: second.workspace.scenarios.map((scenario) => scenario.id === second.workspace.activeScenarioId ? { ...scenario, measures: [...scenario.measures, manual] } : scenario) };
const third = buildRenovationSuggestions({ workspace: withManual, assemblies: draft.assemblies, assemblySet: assemblies, wallOpenings: draft.wallOpenings, openingSet: openings, demandWorkspace: draft.energyDemandWorkspace, demandSet: demand, renewableWorkspace: draft.energyRenewableWorkspace, renewableResult: renewables });
const thirdProposal = third.workspace.scenarios.find((scenario) => scenario.id === third.workspace.activeScenarioId);
assert(thirdProposal.measures.some((measure) => measure.id === 'manual-measure'), 'A kézi egyedi javaslat maradjon meg automatikus frissítéskor.');

console.log(JSON.stringify({ ok: true, testCount: count, suggestionCount: first.suggestionCount, categories: [...new Set(proposal.measures.map((measure) => measure.category))], secondRun: { added: second.addedCount, updated: second.updatedCount } }, null, 2));
