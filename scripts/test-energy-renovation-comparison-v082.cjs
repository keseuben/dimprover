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

const { calculateRenovationComparison } = require('../components/energy/calculations/renovation/calculateRenovationComparison.ts');
const { createDefaultEnergyRenovationWorkspace, createEnergyRenovationMeasure, createProposalRenovationScenario } = require('../components/energy/domain/energyRenovationTypes.ts');

let count = 0;
function assert(condition, message) {
  count += 1;
  if (!condition) throw new Error(`Teszt ${count}: ${message}`);
}
function close(actual, expected, tolerance = 1e-6, message = '') {
  assert(Math.abs(Number(actual) - expected) <= tolerance, `${message} Várt: ${expected}; kapott: ${actual}`);
}

const components = [
  { id: 'component-wall', zoneId: 'zone-1', zoneName: 'Fűtött zóna', kind: 'wall', entityId: 'wall-1', entityName: 'Külső fal', areaSquareMeters: 100, uValueWm2K: 1, baseHeatLossCoefficientWK: 100, temperatureFactor: 1, effectiveHeatLossCoefficientWK: 100, sourceReference: 'Fal' },
  { id: 'component-floor', zoneId: 'zone-1', zoneName: 'Fűtött zóna', kind: 'lowerBoundary', entityId: 'room-1:lower', entityName: 'Padló', areaSquareMeters: 50, uValueWm2K: 0.5, baseHeatLossCoefficientWK: 25, temperatureFactor: 1, effectiveHeatLossCoefficientWK: 25, sourceReference: 'Padló' },
  { id: 'component-opening', zoneId: 'zone-1', zoneName: 'Fűtött zóna', kind: 'opening', entityId: 'opening-1', entityName: 'Ablak', areaSquareMeters: 10, uValueWm2K: 2, baseHeatLossCoefficientWK: 20, temperatureFactor: 1, effectiveHeatLossCoefficientWK: 20, sourceReference: 'Ablak' },
  { id: 'component-installation', zoneId: 'zone-1', zoneName: 'Fűtött zóna', kind: 'installationBridge', entityId: 'opening-1', entityName: 'Ablak beépítési pereme', areaSquareMeters: null, uValueWm2K: null, baseHeatLossCoefficientWK: 2, temperatureFactor: 1, effectiveHeatLossCoefficientWK: 2, sourceReference: 'Perem' },
  { id: 'component-bridge', zoneId: 'zone-1', zoneName: 'Fűtött zóna', kind: 'thermalBridge', entityId: 'bridge-1', entityName: 'Lábazat', areaSquareMeters: null, uValueWm2K: null, baseHeatLossCoefficientWK: 3, temperatureFactor: 1, effectiveHeatLossCoefficientWK: 3, sourceReference: 'Hőhíd' },
  { id: 'component-ventilation', zoneId: 'zone-1', zoneName: 'Fűtött zóna', kind: 'ventilation', entityId: 'zone-1', entityName: 'Szellőzés', areaSquareMeters: null, uValueWm2K: null, baseHeatLossCoefficientWK: 20, temperatureFactor: 1, effectiveHeatLossCoefficientWK: 20, sourceReference: 'Légcsere' },
];

const demand = {
  schema: 'dimpro.energy-demand-set.v0.7.5', engineVersion: '0.7.5', calculatedAt: '2026-07-29', enabled: true, valid: true, blocked: false,
  zones: [{
    zoneId: 'zone-1', zoneName: 'Fűtött zóna', heatingSetpointC: 20, externalDesignTemperatureC: -13, designTemperatureDifferenceK: 33,
    floorAreaSquareMeters: 50, volumeCubicMeters: 125,
    wallHeatLossCoefficientWK: 100, lowerBoundaryHeatLossCoefficientWK: 25, upperBoundaryHeatLossCoefficientWK: 0,
    openingHeatLossCoefficientWK: 20, installationHeatLossCoefficientWK: 2, thermalBridgeHeatLossCoefficientWK: 3,
    transmissionHeatLossCoefficientWK: 150, ventilationHeatLossCoefficientWK: 20, totalHeatLossCoefficientWK: 170,
    designHeatingPowerKw: 5.61, designHeatingPowerPerAreaWm2: 112.2,
    heatingSystemIds: ['system-1'], allocatedHeatingCapacityKw: 6, capacityCoverageRatio: 1.0695, systemCoverageStatus: 'sufficient',
    blocked: false, validationMessages: [], components, trace: [],
  }],
  systems: [], components,
  totals: { zoneCount: 1, calculatedZoneCount: 1, blockedZoneCount: 0, conditionedFloorAreaSquareMeters: 50, conditionedVolumeCubicMeters: 125, transmissionHeatLossCoefficientWK: 150, ventilationHeatLossCoefficientWK: 20, totalHeatLossCoefficientWK: 170, designHeatingPowerKw: 5.61, allocatedHeatingCapacityKw: 6, sufficientZoneCount: 1, insufficientZoneCount: 0, missingSystemZoneCount: 0 },
  validationMessages: [], trace: [], sourceReferenceIds: ['EN-ISO-52016-1-ZONE-LOAD', 'HU-EKM-9-2023-MONTHLY-METHOD', 'AIR-HEAT-CAPACITY-USER-SOURCE'], sourceCheckedAt: '2026-07-29', limitation: 'Design heating load preparation only; not monthly or annual certification energy demand.',
};

const measures = [
  createEnergyRenovationMeasure('externalWall', { id: 'measure-wall', targetEntityId: 'assembly-wall', title: 'Fal hőszigetelése', currentValue: 1, targetValue: 0.2, unit: 'W/m²K', sourceReference: 'Célrétegrend' }),
  createEnergyRenovationMeasure('opening', { id: 'measure-opening', targetEntityId: 'opening-1', title: 'Ablakcsere', currentValue: 2, targetValue: 1, unit: 'W/m²K', sourceReference: 'Gyártói Uw' }),
  createEnergyRenovationMeasure('heating', { id: 'measure-heating', targetEntityId: 'heating-system', title: 'Hőszivattyú', targetValue: 4, unit: 'kW', sourceReference: 'Előméretezés' }),
  createEnergyRenovationMeasure('pv', { id: 'measure-pv', targetEntityId: 'pv-plan', title: 'Napelem', targetValue: 8, unit: 'kWp', sourceReference: 'PV hozam' }),
  createEnergyRenovationMeasure('battery', { id: 'measure-battery', targetEntityId: 'battery-plan', title: 'Akkumulátor', targetValue: 10, unit: 'kWh', sourceReference: 'Tárolóterv' }),
  createEnergyRenovationMeasure('cooling', { id: 'measure-cooling', targetEntityId: 'cooling-system', title: 'Hűtés', sourceReference: 'Helyszíni javaslat' }),
];
const workspace = createDefaultEnergyRenovationWorkspace();
workspace.scenarios = [workspace.scenarios[0], createProposalRenovationScenario(1, { id: 'scenario-t1', code: 'T1', name: 'Komplex felújítás', measures })];
workspace.activeScenarioId = 'scenario-t1';

const commonInput = {
  workspace,
  demand,
  zones: { connections: [], zones: [], unheatedSpaces: [], totals: {}, validationMessages: [], trace: [] },
  wallSegments: [{ id: 'wall-1', assemblyId: 'assembly-wall' }],
  rooms: [{ id: 'room-1', floorAssemblyId: 'assembly-floor', ceilingAssemblyId: 'assembly-roof' }],
  openingWorkspace: { thermalBridges: [{ id: 'bridge-opening', openingId: 'opening-1' }] },
  renewableWorkspace: { solarThermal: { collectorAreaSquareMeters: 4 } },
  renewables: {
    pv: { installedPowerKwp: 8, estimatedAnnualYieldKwh: 8000 },
    solarThermal: { estimatedAnnualYieldKwh: 1800 },
    battery: {},
    evCharging: { annualHomeChargingEnergyKwh: 2200 },
  },
};

const result = calculateRenovationComparison(commonInput);
assert(result.schema === 'dimpro.energy-renovation-comparison.v0.8.2', 'Hibás összehasonlító séma.');
assert(result.engineVersion === '0.8.2', 'Hibás motorverzió.');
assert(result.baselineDemandAvailable === true, 'A valid alapállapot legyen számítható.');
assert(result.scenarios.length === 2, 'Meglévő és tervezett változat szükséges.');
assert(result.totals.proposalCount === 1, 'A javasolt változatok száma hibás.');
const existing = result.scenarios.find((scenario) => scenario.kind === 'existing');
const proposal = result.scenarios.find((scenario) => scenario.scenarioId === 'scenario-t1');
assert(existing.calculationStatus === 'baseline', 'Az M0 státusza legyen alapállapot.');
close(existing.projected.designHeatingPowerKw, 5.61, 1e-6, 'Az M0 fűtési igénye hibás.');
assert(proposal.calculationStatus === 'partial', 'A vegyesen számítható változat legyen részleges.');
assert(proposal.includedMeasureCount === 6, 'A beválasztott intézkedésszám hibás.');
assert(proposal.calculatedMeasureCount === 2, 'A teljesen számított intézkedésszám hibás.');
assert(proposal.partialMeasureCount === 3, 'A részben számított intézkedésszám hibás.');
assert(proposal.unavailableMeasureCount === 1, 'A még nem számítható intézkedésszám hibás.');
close(proposal.projected.transmissionHeatLossCoefficientWK, 60, 1e-6, 'A tervezett Htranszmisszió hibás.');
close(proposal.projected.ventilationHeatLossCoefficientWK, 20, 1e-6, 'A szellőzési H változatlan maradjon.');
close(proposal.projected.totalHeatLossCoefficientWK, 80, 1e-6, 'A tervezett Hösszes hibás.');
close(proposal.projected.designHeatingPowerKw, 2.64, 1e-6, 'A tervezett fűtési igény hibás.');
close(proposal.change.transmissionHeatLossCoefficientWK, 90, 1e-6, 'A Htranszmisszió csökkenése hibás.');
close(proposal.change.designHeatingPowerKw, 2.97, 1e-6, 'A fűtési teljesítmény csökkenése hibás.');
close(proposal.change.designHeatingPowerReductionPercent, 52.94, 0.01, 'A fűtési teljesítmény százalékos csökkenése hibás.');
assert(proposal.projected.heatingCapacityStatus === 'sufficient', 'A 4 kW tervezett kapacitás legyen megfelelő.');
close(proposal.projected.heatingCapacityCoverageRatio, 4 / 2.64, 0.0001, 'A kapacitáslefedettség hibás.');
assert(proposal.renewables.pvCapacityKwp === 8, 'A PV kapacitás hibás.');
assert(proposal.renewables.pvAnnualYieldKwh === 8000, 'A PV éves hozam hibás.');
assert(proposal.renewables.batteryCapacityKwh === 10, 'Az akkumulátorkapacitás hibás.');
const wallResult = proposal.measures.find((measure) => measure.measureId === 'measure-wall');
const openingResult = proposal.measures.find((measure) => measure.measureId === 'measure-opening');
const coolingResult = proposal.measures.find((measure) => measure.measureId === 'measure-cooling');
assert(wallResult.status === 'calculated', 'A falintézkedés legyen számított.');
close(wallResult.currentHeatLossCoefficientWK, 100, 1e-6, 'A fal jelenlegi H hibás.');
close(wallResult.projectedHeatLossCoefficientWK, 20, 1e-6, 'A fal tervezett H hibás.');
close(wallResult.savedDesignHeatingPowerKw, 2.64, 1e-6, 'A fal teljesítménymegtakarítása hibás.');
assert(openingResult.status === 'partial', 'A csatlakozási hőhidas ablakcsere legyen részleges.');
close(openingResult.savedHeatLossCoefficientWK, 10, 1e-6, 'Az ablak H-megtakarítása hibás.');
assert(coolingResult.status === 'unavailable', 'A validált módszer nélküli hűtés legyen még nem számítható.');
assert(proposal.validationMessages.some((message) => message.code === 'MEASURE_PARTIAL_CONNECTION_EFFECT'), 'A nyílászáró részleges hatásüzenete hiányzik.');
assert(proposal.validationMessages.some((message) => message.code === 'HEATING_CAPACITY_SUFFICIENT'), 'A megfelelő kapacitásüzenet hiányzik.');

const duplicateWorkspace = createDefaultEnergyRenovationWorkspace();
duplicateWorkspace.scenarios = [duplicateWorkspace.scenarios[0], createProposalRenovationScenario(1, { id: 'scenario-duplicate', measures: [measures[0], { ...measures[0], id: 'measure-wall-copy' }] })];
const duplicate = calculateRenovationComparison({ ...commonInput, workspace: duplicateWorkspace }).scenarios.find((scenario) => scenario.scenarioId === 'scenario-duplicate');
assert(duplicate.calculationStatus === 'blocked', 'A kettős célpont blokkolja a változatot.');
assert(duplicate.validationMessages.some((message) => message.code === 'MEASURE_DUPLICATE_TARGET'), 'A kettős célpont üzenete hiányzik.');

const missingDemand = calculateRenovationComparison({ ...commonInput, demand: { ...demand, valid: false, blocked: true } });
assert(missingDemand.baselineDemandAvailable === false, 'A blokkolt alapállapot ne legyen számítható.');
const missingProposal = missingDemand.scenarios.find((scenario) => scenario.scenarioId === 'scenario-t1');
assert(missingProposal.measures.find((measure) => measure.measureId === 'measure-wall').status === 'unavailable', 'Érvénytelen alapállapotnál a falhatás ne számolódjon.');
assert(missingProposal.renewables.pvCapacityKwp === 8, 'A PV kapacitás alap hőterhelés nélkül is megmaradjon.');

console.log(JSON.stringify({ ok: true, testCount: count, reference: { baselinePowerKw: existing.projected.designHeatingPowerKw, projectedPowerKw: proposal.projected.designHeatingPowerKw, transmissionReductionPercent: proposal.change.transmissionReductionPercent, pvAnnualYieldKwh: proposal.renewables.pvAnnualYieldKwh }, result }, null, 2));
