const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) { if (request.startsWith('@/')) request = path.join(root, request.slice(2)); return originalResolveFilename.call(this, request, parent, isMain, options); };
require.extensions['.ts'] = function(module, filename) { const source = fs.readFileSync(filename, 'utf8'); const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true }, fileName: filename }).outputText; module._compile(output, filename); };

const model = require('../components/energy/domain/energyOpeningTypes.ts');
const { calculateEnergyOpenings } = require('../components/energy/calculations/openings/calculateEnergyOpenings.ts');
const { huEkm20231101OpeningRequirements } = require('../components/energy/regulations/HU_EKM_2023_11_01/openingRequirements.ts');

const tests = [];
function test(name, fn) { fn(); tests.push(name); }
function approx(actual, expected, tolerance = 1e-4) { assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`); }
function opening(input = {}) {
  return { id:'opening-1', levelId:'level-ground', roomId:'room-1', wallSegmentId:'wall-1', kind:'window', name:'Tesztablak', widthMeters:1.2, heightMeters:1.5, sillHeightMeters:0.9, offsetRatio:0.5, frame:'PVC', glazing:'3 rétegű', uValue:'0.90', shading:'Redőny', note:'', createdAt:'2026-07-29', updatedAt:'2026-07-29', ...input };
}
function declaredDetail(sourceOpening = opening(), input = {}) {
  return model.createEnergyOpeningDetail(sourceOpening, { calculationMode:'declared', declaredUwWm2K:0.9, declaredSourceType:'manufacturerDeclaration', declaredSourceReference:'DoP-001', requirementType:'woodPvcFacadeGlazed', ...input });
}
function detailedDetail(sourceOpening = opening(), input = {}) {
  return model.createEnergyOpeningDetail(sourceOpening, { calculationMode:'detailed', requirementType:'woodPvcFacadeGlazed', frameMaterial:'pvc', frameWidthMeters:0.08, glazingUgWm2K:0.6, frameUfWm2K:1.2, glazingEdgePsiWmK:0.04, glazingEdgeSourceReference:'Spacer-001', solarGValue:0.5, declaredUwWm2K:undefined, ...input });
}
function workspace(sourceOpening = opening(), detail = declaredDetail(sourceOpening), bridges = []) {
  return { schemaVersion:1, openingDetails:{ [sourceOpening.id]:detail }, thermalBridges:bridges, createdAt:'2026-07-29', updatedAt:'2026-07-29' };
}
function calculate(sourceOpening = opening(), detail = declaredDetail(sourceOpening), bridges = [], requirementLevel = 'newBuildingNearlyZero') {
  return calculateEnergyOpenings({ workspace:workspace(sourceOpening, detail, bridges), openings:[sourceOpening], requirementLevel, calculatedAt:'2026-07-29T00:00:00.000Z' });
}

test('opening requirement table contains the official 11 types plus custom', () => assert.equal(Object.keys(huEkm20231101OpeningRequirements).length, 12));
test('wood/PVC facade opening requirement is 1.1', () => assert.equal(huEkm20231101OpeningRequirements.woodPvcFacadeGlazed.maximumUValueWm2K, 1.1));
test('metal facade opening requirement is 1.4', () => assert.equal(huEkm20231101OpeningRequirements.metalFacadeGlazed.maximumUValueWm2K, 1.4));
test('roof window requirement is 1.3', () => assert.equal(huEkm20231101OpeningRequirements.roofWindow.maximumUValueWm2K, 1.3));
test('facade door requirement is 1.4', () => assert.equal(huEkm20231101OpeningRequirements.facadeDoor.maximumUValueWm2K, 1.4));
test('facade gate requirement is 1.8', () => assert.equal(huEkm20231101OpeningRequirements.facadeGate.maximumUValueWm2K, 1.8));

test('legacy U-value migrates to declared Uw', () => {
  const detail = model.createEnergyOpeningDetail(opening({ uValue:'0,95' }));
  assert.equal(detail.calculationMode, 'declared');
  assert.equal(detail.declaredUwWm2K, 0.95);
  assert.equal(detail.declaredSourceType, 'legacyMigration');
});
test('window defaults to wood/PVC requirement', () => assert.equal(model.inferOpeningRequirementType(opening()), 'woodPvcFacadeGlazed'));
test('metal frame window defaults to metal requirement', () => assert.equal(model.inferOpeningRequirementType(opening({ frame:'Alumínium' })), 'metalFacadeGlazed'));
test('door defaults to facade door requirement', () => assert.equal(model.inferOpeningRequirementType(opening({ kind:'door' })), 'facadeDoor'));
test('garage door defaults to facade gate requirement', () => assert.equal(model.inferOpeningRequirementType(opening({ kind:'garageDoor' })), 'facadeGate'));

test('declared Uw result is used unchanged', () => {
  const result = calculate();
  approx(result.openings[0].effectiveUwWm2K, 0.9);
  assert.equal(result.openings[0].calculationMode, 'declared');
  assert.equal(result.openings[0].compliance, 'compliant');
});
test('declared Uw above requirement is non-compliant', () => assert.equal(calculate(opening(), declaredDetail(opening(), { declaredUwWm2K:1.2 })).openings[0].compliance, 'notCompliant'));
test('existing building without requirement is not applicable', () => assert.equal(calculate(opening(), declaredDetail(), [], 'existingNoRequirement').openings[0].compliance, 'notApplicable'));
test('small opening at 0.5 m2 is outside thresholded requirement', () => {
  const small = opening({ widthMeters:0.5, heightMeters:1 });
  assert.equal(calculate(small, declaredDetail(small)).openings[0].compliance, 'notApplicableSmallArea');
});
test('missing declared Uw blocks result', () => { const source = opening({ uValue:'' }); const detail = declaredDetail(source); detail.declaredUwWm2K = undefined; assert(calculate(source, detail).openings[0].validationMessages.some((m) => m.code === 'DECLARED_U_REQUIRED' && m.blocking)); });
test('missing declared source blocks result', () => { const detail = declaredDetail(); detail.declaredSourceReference = ''; assert(calculate(opening(), detail).openings[0].validationMessages.some((m) => m.code === 'DECLARED_SOURCE_REQUIRED' && m.blocking)); });

test('detailed glazing area is correct', () => approx(calculate(opening(), detailedDetail()).openings[0].glazingAreaSquareMeters, 1.3936));
test('detailed frame area is correct', () => approx(calculate(opening(), detailedDetail()).openings[0].frameAreaSquareMeters, 0.4064));
test('detailed glazing edge length is correct', () => approx(calculate(opening(), detailedDetail()).openings[0].glazingEdgeLengthMeters, 4.76));
test('detailed Uw formula is correct', () => approx(calculate(opening(), detailedDetail()).openings[0].effectiveUwWm2K, 0.841244, 1e-4));
test('detailed opening heat loss coefficient equals area times Uw', () => approx(calculate(opening(), detailedDetail()).openings[0].openingHeatLossCoefficientWK, 1.51424, 1e-4));
test('detailed calculation trace contains component formula', () => assert(calculate(opening(), detailedDetail()).trace.some((t) => t.ruleId === 'OPENING-UW-DETAILED-004')));
test('invalid frame width blocks detailed calculation', () => assert(calculate(opening(), detailedDetail(opening(), { frameWidthMeters:0.7 })).openings[0].validationMessages.some((m) => m.code === 'FRAME_WIDTH_INVALID')));
test('missing Ug blocks detailed calculation', () => assert(calculate(opening(), detailedDetail(opening(), { glazingUgWm2K:undefined })).openings[0].validationMessages.some((m) => m.code === 'UG_REQUIRED')));
test('missing Uf blocks detailed calculation', () => assert(calculate(opening(), detailedDetail(opening(), { frameUfWm2K:undefined })).openings[0].validationMessages.some((m) => m.code === 'UF_REQUIRED')));
test('zero glazing edge psi is accepted with source', () => assert.equal(calculate(opening(), detailedDetail(opening(), { glazingEdgePsiWmK:0 })).openings[0].blocked, false));
test('glazing edge source is mandatory', () => assert(calculate(opening(), detailedDetail(opening(), { glazingEdgeSourceReference:'' })).openings[0].validationMessages.some((m) => m.code === 'GLAZING_EDGE_SOURCE_REQUIRED')));
test('solar g-value above one blocks', () => assert(calculate(opening(), detailedDetail(opening(), { solarGValue:1.2 })).openings[0].validationMessages.some((m) => m.code === 'SOLAR_G_VALUE_INVALID')));

test('installation perimeter heat loss is calculated', () => {
  const result = calculate(opening(), detailedDetail(opening(), { installationPsiWmK:0.03, installationPsiSourceReference:'Install-001' }));
  approx(result.openings[0].installationHeatLossCoefficientWK, 0.162);
  approx(result.openings[0].totalHeatLossCoefficientWK, 1.67624, 1e-4);
});
test('installation psi source is mandatory', () => assert(calculate(opening(), detailedDetail(opening(), { installationPsiWmK:0.03, installationPsiSourceReference:'' })).openings[0].validationMessages.some((m) => m.code === 'INSTALLATION_SOURCE_REQUIRED')));

test('linear thermal bridge computes length times psi', () => {
  const bridge = model.createEnergyThermalBridge({ id:'bridge-linear', kind:'linear', name:'Lábazat', category:'plinth', lengthMeters:10, psiWmK:0.08, sourceType:'calculation', sourceReference:'TB-001' });
  approx(calculate(opening(), declaredDetail(), [bridge]).thermalBridges[0].heatLossCoefficientWK, 0.8);
});
test('point thermal bridge computes count times chi', () => {
  const bridge = model.createEnergyThermalBridge({ id:'bridge-point', kind:'point', name:'Áttörés', category:'structuralPenetration', quantity:4, chiWK:0.05, sourceType:'calculation', sourceReference:'TB-002' });
  approx(calculate(opening(), declaredDetail(), [bridge]).thermalBridges[0].heatLossCoefficientWK, 0.2);
});
test('thermal bridge source is mandatory', () => {
  const bridge = model.createEnergyThermalBridge({ kind:'linear', lengthMeters:10, psiWmK:0.08, sourceReference:'' });
  assert(calculate(opening(), declaredDetail(), [bridge]).thermalBridges[0].validationMessages.some((m) => m.code === 'THERMAL_BRIDGE_SOURCE_REQUIRED'));
});
test('missing linear length blocks', () => {
  const bridge = model.createEnergyThermalBridge({ kind:'linear', psiWmK:0.08, sourceReference:'TB' });
  assert(calculate(opening(), declaredDetail(), [bridge]).thermalBridges[0].validationMessages.some((m) => m.code === 'THERMAL_BRIDGE_LENGTH_REQUIRED'));
});
test('missing point quantity blocks', () => {
  const bridge = model.createEnergyThermalBridge({ kind:'point', chiWK:0.05, sourceReference:'TB' });
  assert(calculate(opening(), declaredDetail(), [bridge]).thermalBridges[0].validationMessages.some((m) => m.code === 'THERMAL_BRIDGE_QUANTITY_REQUIRED'));
});
test('opening installation and explicit reveal bridge double count is blocked', () => {
  const bridge = model.createEnergyThermalBridge({ kind:'linear', category:'openingReveal', openingId:'opening-1', lengthMeters:3, psiWmK:0.04, sourceReference:'TB' });
  const result = calculate(opening(), detailedDetail(opening(), { installationPsiWmK:0.03, installationPsiSourceReference:'Install' }), [bridge]);
  assert(result.validationMessages.some((m) => m.code === 'OPENING_INSTALLATION_DOUBLE_COUNT' && m.blocking));
});

test('custom requirement is applied', () => {
  const result = calculate(opening(), declaredDetail(opening(), { requirementType:'custom', customRequirementMaximumUwWm2K:0.8 }));
  assert.equal(result.openings[0].compliance, 'notCompliant');
});
test('missing custom requirement blocks', () => assert(calculate(opening(), declaredDetail(opening(), { requirementType:'custom', customRequirementMaximumUwWm2K:undefined })).openings[0].validationMessages.some((m) => m.code === 'CUSTOM_REQUIREMENT_REQUIRED')));
test('workspace normalization creates detail for every opening', () => {
  const second = opening({ id:'opening-2', name:'Ajtó', kind:'door', uValue:'1.2' });
  const normalized = model.normalizeEnergyOpeningWorkspace(undefined, [opening(), second]);
  assert.equal(Object.keys(normalized.openingDetails).length, 2);
  assert.equal(normalized.openingDetails['opening-2'].requirementType, 'facadeDoor');
});
test('workspace normalization removes deleted opening detail and linked bridge', () => {
  const source = opening();
  const second = opening({ id:'opening-2' });
  const old = model.createDefaultEnergyOpeningWorkspace([source, second], { thermalBridges:[model.createEnergyThermalBridge({ openingId:'opening-2', sourceReference:'TB', lengthMeters:1, psiWmK:0.1 })] });
  const normalized = model.normalizeEnergyOpeningWorkspace(old, [source]);
  assert.equal(normalized.openingDetails['opening-2'], undefined);
  assert.equal(normalized.thermalBridges.length, 0);
});
test('opening set totals combine opening, installation and other bridges', () => {
  const bridge = model.createEnergyThermalBridge({ kind:'linear', lengthMeters:10, psiWmK:0.08, sourceReference:'TB' });
  const result = calculate(opening(), detailedDetail(opening(), { installationPsiWmK:0.03, installationPsiSourceReference:'Install' }), [bridge]);
  approx(result.totals.totalHeatLossCoefficientWK, 2.47624, 1e-4);
});
test('result schemas and source references are stable', () => {
  const result = calculate();
  assert.equal(result.schema, 'dimpro.energy-opening-set.v0.7.4');
  assert.equal(result.engineVersion, '0.7.4');
  assert.equal(result.requirementSourceReferenceId, 'HU-EKM-9-2023-ANNEX-1-OPENINGS');
  assert.equal(result.sourceCheckedAt, '2026-07-29');
});

const sample = calculate(opening(), detailedDetail(opening(), { installationPsiWmK:0.03, installationPsiSourceReference:'Install' }), [model.createEnergyThermalBridge({ kind:'linear', name:'Lábazat', lengthMeters:10, psiWmK:0.08, sourceReference:'TB' })]);
console.log(JSON.stringify({ ok:true, testCount:tests.length, tests, sample:{ schema:sample.schema, uw:sample.openings[0].effectiveUwWm2K, openingH:sample.totals.openingHeatLossCoefficientWK, installationH:sample.totals.installationHeatLossCoefficientWK, bridgeH:sample.totals.otherThermalBridgeHeatLossCoefficientWK, totalH:sample.totals.totalHeatLossCoefficientWK, trace:sample.trace.length }, sources:{ opening:sample.openingFormulaSourceReferenceId, requirement:sample.requirementSourceReferenceId, bridge:sample.thermalBridgeSourceReferenceId, checkedAt:sample.sourceCheckedAt } }, null, 2));
