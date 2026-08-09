const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) { if (request.startsWith('@/')) request = path.join(root, request.slice(2)); return originalResolveFilename.call(this, request, parent, isMain, options); };
require.extensions['.ts'] = function(module, filename) { const source = fs.readFileSync(filename, 'utf8'); const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true }, fileName: filename }).outputText; module._compile(output, filename); };

const model = require('../components/property-survey/propertySurveyEnergyModel.ts');
const { huEkm20231101AssemblyRuleData } = require('../components/energy/regulations/HU_EKM_2023_11_01/factors.ts');
const { calculateAssemblyThermalPerformance } = require('../components/energy/calculations/assemblies/calculateUValue.ts');
const { calculateAssemblySet } = require('../components/energy/calculations/assemblies/calculateAssemblySet.ts');
const { calculateRequiredInsulationThickness } = require('../components/energy/calculations/assemblies/calculateInsulationRequirement.ts');
const { interpolateClosedAirGapResistance } = require('../components/energy/calculations/assemblies/calculateThermalResistance.ts');
const legacy = require('../components/property-survey/propertySurveyEnergyCalculations.ts');

const tests = [];
function test(name, fn) { fn(); tests.push(name); }
function approx(actual, expected, tolerance = 1e-8) { assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`); }
function wallAssembly() {
  const assembly = model.createConstructionAssembly('wall', 'Referencia fal');
  return { ...assembly, layers: [{ id: 'layer-ref', kind: 'solid', material: 'Referencia anyag', thicknessCm: 20, lambdaWmK: '0.04', note: '' }] };
}
function calculate(assembly, requirementLevel = 'significantRenovation') { return calculateAssemblyThermalPerformance({ assembly, rules: huEkm20231101AssemblyRuleData, requirementLevel }); }

test('official surface resistance table is loaded', () => {
  assert.deepEqual(huEkm20231101AssemblyRuleData.surfaceResistance.upward, { direction: 'upward', rsiM2KPerW: 0.1, rseM2KPerW: 0.04 });
  assert.equal(huEkm20231101AssemblyRuleData.surfaceResistance.horizontal.rsiM2KPerW, 0.13);
  assert.equal(huEkm20231101AssemblyRuleData.surfaceResistance.downward.rsiM2KPerW, 0.17);
});

test('horizontal homogeneous wall hand calculation', () => {
  const result = calculate(wallAssembly());
  approx(result.totalResistanceM2KPerW, 0.13 + 0.2 / 0.04 + 0.04);
  approx(result.calculatedUValueWm2K, 1 / (0.13 + 5 + 0.04));
  assert.equal(result.valid, true);
});

test('upward and downward heat flow use different Rsi', () => {
  const upward = calculate({ ...wallAssembly(), heatFlowDirection: 'upward' });
  const downward = calculate({ ...wallAssembly(), heatFlowDirection: 'downward' });
  assert.equal(upward.rsiM2KPerW, 0.1);
  assert.equal(downward.rsiM2KPerW, 0.17);
  assert(downward.calculatedUValueWm2K < upward.calculatedUValueWm2K);
});

test('internal unheated boundary uses internal surface resistance on both sides', () => {
  const result = calculate({ ...wallAssembly(), boundaryMode: 'internalUnheated' });
  assert.equal(result.rsiM2KPerW, 0.13);
  assert.equal(result.rseM2KPerW, 0.13);
  approx(result.totalResistanceM2KPerW, 5.26);
});

test('closed air gap exact table value', () => {
  const assembly = { ...wallAssembly(), layers: [{ id: 'air-25', kind: 'closedAirGap', material: 'Zárt légréteg', thicknessCm: 2.5, lambdaWmK: '', airGapVentilation: 'closed', note: '' }] };
  const result = calculate(assembly);
  assert.equal(result.layerResults[0].resistanceM2KPerW, 0.18);
  assert.equal(result.layerResults[0].resistanceSource, 'airGapTable');
});

test('closed air gap linear interpolation', () => {
  approx(interpolateClosedAirGapResistance(20, 'horizontal', huEkm20231101AssemblyRuleData.closedAirGapResistanceRows), 0.175);
  approx(interpolateClosedAirGapResistance(20, 'downward', huEkm20231101AssemblyRuleData.closedAirGapResistanceRows), 0.18);
});

test('closed air gap over 300 mm is blocked', () => {
  const assembly = { ...wallAssembly(), layers: [{ id: 'air-400', kind: 'closedAirGap', material: 'Zárt légréteg', thicknessCm: 40, lambdaWmK: '', airGapVentilation: 'closed', note: '' }] };
  const result = calculate(assembly);
  assert.equal(result.blocked, true);
  assert(result.validationMessages.some((message) => message.code === 'AIR_GAP_TOO_THICK'));
});

test('ventilated air gap is not silently approximated', () => {
  const assembly = { ...wallAssembly(), layers: [{ id: 'air-open', kind: 'ventilatedAirGap', material: 'Szellőztetett légréteg', thicknessCm: 5, lambdaWmK: '', airGapVentilation: 'slightlyVentilated', note: '' }] };
  const result = calculate(assembly);
  assert.equal(result.calculatedUValueWm2K, null);
  assert(result.validationMessages.some((message) => message.code === 'VENTILATED_AIR_GAP_UNSUPPORTED'));
});

test('missing lambda produces no false U result', () => {
  const assembly = { ...wallAssembly(), layers: [{ id: 'missing-lambda', kind: 'solid', material: 'Ismeretlen', thicknessCm: 20, lambdaWmK: '', note: '' }] };
  const result = calculate(assembly);
  assert.equal(result.effectiveUValueWm2K, null);
  assert(result.validationMessages.some((message) => message.code === 'LAYER_LAMBDA_MISSING'));
});

test('fixed documented resistance is supported', () => {
  const assembly = { ...wallAssembly(), layers: [{ id: 'fixed-r', kind: 'fixedResistance', material: 'Dokumentált elem', thicknessCm: 0, lambdaWmK: '', fixedResistanceM2KPerW: '2.5', note: 'forrás' }] };
  const result = calculate(assembly);
  assert.equal(result.layerResults[0].resistanceM2KPerW, 2.5);
  approx(result.totalResistanceM2KPerW, 2.67);
});

test('declared U works without complete layer calculation when source is present', () => {
  const assembly = { ...wallAssembly(), calculationMode: 'declared', declaredUValueWm2K: '0.22', declaredUValueSource: 'Gyártói teljesítménynyilatkozat', layers: [] };
  const result = calculate(assembly);
  assert.equal(result.blocked, false);
  assert.equal(result.effectiveUValueWm2K, 0.22);
  assert.equal(result.calculatedUValueWm2K, null);
  assert(result.validationMessages.some((message) => message.code === 'NO_LAYERS' && !message.blocking));
});

test('declared U requires source', () => {
  const result = calculate({ ...wallAssembly(), calculationMode: 'declared', declaredUValueWm2K: '0.22', declaredUValueSource: '' });
  assert.equal(result.blocked, true);
  assert(result.validationMessages.some((message) => message.code === 'DECLARED_U_SOURCE_REQUIRED'));
});

test('external wall requirement reports pass and fail', () => {
  const pass = calculate({ ...wallAssembly(), layers: [{ id:'ins', kind:'solid', material:'Szigetelés', thicknessCm:20, lambdaWmK:'0.04', note:'' }], requirementType:'externalWall' });
  const fail = calculate({ ...wallAssembly(), layers: [{ id:'brick', kind:'solid', material:'Tégla', thicknessCm:20, lambdaWmK:'0.8', note:'' }], requirementType:'externalWall' });
  assert.equal(pass.requirementMaximumUValueWm2K, 0.24);
  assert.equal(pass.compliance, 'compliant');
  assert.equal(fail.compliance, 'notCompliant');
});

test('existing assessment does not claim regulatory compliance', () => {
  const result = calculate(wallAssembly(), 'existingNoRequirement');
  assert.equal(result.compliance, 'notApplicable');
  assert(result.validationMessages.some((message) => message.code === 'REQUIREMENT_NOT_APPLICABLE'));
});

test('ground floor requires equivalent ground calculation', () => {
  const floor = model.createConstructionAssembly('floor', 'Talajon fekvő padló');
  const assembly = { ...floor, layers: [{ id:'floor-ins', kind:'solid', material:'XPS', thicknessCm:20, lambdaWmK:'0.036', note:'' }] };
  const result = calculate(assembly);
  assert.equal(result.effectiveUValueWm2K !== null, true);
  assert.equal(result.compliance, 'groundCalculationRequired');
  assert(result.validationMessages.some((message) => message.code === 'GROUND_EQUIVALENT_CALCULATION_REQUIRED'));
});

test('air void level 1 correction follows formula', () => {
  const base = wallAssembly();
  const assembly = { ...base, corrections: { ...base.corrections, airVoid: { level:'level1', insulationLayerId:'layer-ref' } } };
  const result = calculate(assembly);
  const expected = 0.01 * ((5) / (5.17)) ** 2;
  approx(result.correction.airVoidDeltaUWm2K, expected, 1e-8);
  approx(result.calculatedUValueWm2K, 1 / 5.17 + expected, 1e-8);
});

test('below-three-percent policy can omit negligible correction', () => {
  const base = wallAssembly();
  const layers = base.layers.map((layer) => layer.id === 'layer-ref' ? { ...layer, thicknessCm: 8, lambdaWmK: '0.04' } : layer);
  const assembly = { ...base, layers, corrections: { ...base.corrections, policy:'omitBelowThreePercent', airVoid: { level:'level1', insulationLayerId:'layer-ref' } } };
  const result = calculate(assembly);
  assert(result.correction.correctionRatioPercent > 0 && result.correction.correctionRatioPercent < 3);
  assert.equal(result.correction.negligibleBelowThreePercent, true);
  assert.equal(result.correction.appliedDeltaUWm2K, 0);
  approx(result.calculatedUValueWm2K, result.baseUValueWm2K);
});

test('mechanical point fastener correction is calculated', () => {
  const base = wallAssembly();
  const assembly = { ...base, corrections: { ...base.corrections, mechanicalFastener: { enabled:true, insulationLayerId:'layer-ref', fastenerLambdaWmK:50, fastenerCountPerSquareMeter:5, fastenerCrossSectionSquareMeters:0.00005, insulationThicknessMeters:0.2, penetrationLengthMeters:0.2, embedded:false, passesAirLayer:false, pointFastener:true } } };
  const result = calculate(assembly);
  assert(result.correction.mechanicalFastenerDeltaUWm2K > 0);
  assert(result.trace.some((trace) => trace.ruleId === 'U-CORR-FASTENER-4.13'));
});

test('non-point fastener blocks simplified calculation', () => {
  const base = wallAssembly();
  const assembly = { ...base, corrections: { ...base.corrections, mechanicalFastener: { enabled:true, insulationLayerId:'layer-ref', fastenerLambdaWmK:50, fastenerCountPerSquareMeter:5, fastenerCrossSectionSquareMeters:0.00005, insulationThicknessMeters:0.2, penetrationLengthMeters:0.2, embedded:false, passesAirLayer:false, pointFastener:false } } };
  const result = calculate(assembly);
  assert.equal(result.blocked, true);
  assert(result.validationMessages.some((message) => message.code === 'MECHANICAL_FASTENER_DETAILED_METHOD_REQUIRED'));
});

test('inhomogeneous assembly is blocked', () => {
  const result = calculate({ ...wallAssembly(), complexity:'inhomogeneous' });
  assert.equal(result.blocked, true);
  assert(result.validationMessages.some((message) => message.code === 'INHOMOGENEOUS_REQUIRES_DETAILED_METHOD'));
});

test('variable thickness average warns but remains calculable', () => {
  const result = calculate({ ...wallAssembly(), complexity:'variableThicknessAverage' });
  assert.equal(result.valid, true);
  assert(result.validationMessages.some((message) => message.code === 'VARIABLE_THICKNESS_AVERAGE_WARNING'));
});

test('catalog lambda override requires reason', () => {
  const base = wallAssembly();
  const snapshot = { materialId:'m', materialVersionId:'m-v1', displayName:'Anyag', lambdaUsedWmK:0.04, lambdaSource:'design', sourcePackageId:'s', verificationStatus:'verified', capturedAt:'' };
  const result = calculate({ ...base, layers:[{ ...base.layers[0], lambdaWmK:'0.05', materialSnapshot:snapshot }] });
  assert.equal(result.blocked, true);
  assert(result.validationMessages.some((message) => message.code === 'LAYER_OVERRIDE_REASON_REQUIRED'));
});

test('unverified catalog material warns but does not block', () => {
  const base = wallAssembly();
  const snapshot = { materialId:'m', materialVersionId:'m-v1', displayName:'Anyag', lambdaUsedWmK:0.04, lambdaSource:'design', sourcePackageId:'s', verificationStatus:'unverified', capturedAt:'' };
  const result = calculate({ ...base, layers:[{ ...base.layers[0], materialSnapshot:snapshot }] });
  assert.equal(result.valid, true);
  assert(result.validationMessages.some((message) => message.code === 'UNVERIFIED_MATERIAL'));
});

test('iterative insulation solver reaches target with rounded recommendation', () => {
  const assembly = { ...wallAssembly(), layers: [
    { id:'brick', kind:'solid', material:'Tégla', thicknessCm:38, lambdaWmK:'0.72', note:'' },
    { id:'eps', kind:'solid', material:'EPS', thicknessCm:10, lambdaWmK:'0.039', note:'' },
  ] };
  const result = calculateRequiredInsulationThickness({ assembly, insulationLayerId:'eps', rules:huEkm20231101AssemblyRuleData, requirementLevel:'significantRenovation', targetUValueWm2K:0.24 });
  assert.equal(result.valid, true);
  assert(result.requiredAdditionalThicknessMeters > 0);
  assert(result.roundedRecommendedAdditionalThicknessMeters >= result.requiredAdditionalThicknessMeters - 1e-10);
  const applied = { ...assembly, layers:assembly.layers.map((layer)=>layer.id==='eps'?{...layer,thicknessCm:layer.thicknessCm+result.roundedRecommendedAdditionalThicknessMeters*100}:layer) };
  assert(calculate(applied).calculatedUValueWm2K <= 0.24);
});

test('insulation solver refuses ground-equivalent shortcut', () => {
  const floor = model.createConstructionAssembly('floor', 'Talajpadló');
  const assembly = { ...floor, layers:[{id:'xps',kind:'solid',material:'XPS',thicknessCm:10,lambdaWmK:'0.036',note:''}] };
  const result = calculateRequiredInsulationThickness({ assembly, insulationLayerId:'xps', rules:huEkm20231101AssemblyRuleData, requirementLevel:'significantRenovation', targetUValueWm2K:0.3 });
  assert.equal(result.valid, false);
  assert(result.message.includes('egyenértékű'));
});

test('assembly set totals summarize all statuses', () => {
  const good = wallAssembly();
  const bad = { ...wallAssembly(), id:'bad', name:'Hibás', layers:[{id:'bad-layer',kind:'solid',material:'Hiányos',thicknessCm:10,lambdaWmK:'',note:''}] };
  const set = calculateAssemblySet({ assemblies:[good,bad], rules:huEkm20231101AssemblyRuleData, requirementLevel:'significantRenovation', calculatedAt:'2026-07-29T09:00:00.000Z' });
  assert.equal(set.totals.assemblyCount, 2);
  assert.equal(set.totals.validCount, 1);
  assert.equal(set.totals.blockedCount, 1);
});

test('legacy adapter uses same official engine result', () => {
  const assembly = wallAssembly();
  const old = legacy.calculateAssemblyUValue(assembly, 'significantRenovation');
  const current = calculate(assembly);
  assert.equal(old.uValueWm2K, Number(current.effectiveUValueWm2K.toFixed(3)));
  assert.equal(old.thermalResistanceM2KPerW, Number(current.totalResistanceM2KPerW.toFixed(3)));
});

test('legacy ceiling and floor migrations keep category heat flow defaults', () => {
  const ceiling = model.normalizeSurveyConstructionAssembly({ id:'legacy-ceiling', category:'ceiling', name:'Régi födém', layers:[{id:'l',material:'Anyag',thicknessCm:10,lambdaWmK:'0.04',note:''}] });
  const floor = model.normalizeSurveyConstructionAssembly({ id:'legacy-floor', category:'floor', name:'Régi padló', layers:[{id:'l2',material:'Anyag',thicknessCm:10,lambdaWmK:'0.04',note:''}] });
  assert.equal(ceiling.heatFlowDirection, 'upward');
  assert.equal(floor.heatFlowDirection, 'downward');
  assert.equal(ceiling.layers[0].kind, 'solid');
});

console.log(JSON.stringify({ ok:true, testCount:tests.length, tests, ruleSource:huEkm20231101AssemblyRuleData.sourceReferenceId, checkedAt:huEkm20231101AssemblyRuleData.checkedAt }, null, 2));
