const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveDimproAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) request = path.join(root, request.slice(2));
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = function transpileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const energy = require('../components/energy/domain/energyProjectTypes.ts');
const registry = require('../components/energy/regulations/registry.ts');
const catalog = require('../components/materials/catalog/genericMaterialCatalog.ts');
const search = require('../components/materials/catalog/materialSearchIndex.ts');
const validateMaterial = require('../components/materials/validation/validateMaterial.ts');
const validateSource = require('../components/materials/validation/validateMaterialSource.ts');
const validatePropertySet = require('../components/materials/validation/validateMaterialPropertySet.ts');
const snapshot = require('../components/materials/versioning/freezeMaterialSnapshot.ts');
const sourceTypes = require('../components/materials/domain/materialSourceTypes.ts');

const tests = [];
function test(name, fn) {
  fn();
  tests.push(name);
}

test('default energy settings schema', () => {
  const value = energy.createDefaultEnergyProjectSettings();
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.ruleSetId, 'HU_EKM_2023_11_01');
  assert.equal(value.calculationPurpose, 'existingAssessment');
});

test('invalid legacy year is removed during normalization', () => {
  const value = energy.normalizeEnergyProjectSettings({ constructionYear: 1200 });
  assert.equal(value.constructionYear, undefined);
});

test('significant renovation requests renovation year', () => {
  const value = energy.createDefaultEnergyProjectSettings({ calculationPurpose: 'significantRenovation' });
  assert(energy.validateEnergyProjectSettings(value).some((item) => item.code === 'RENOVATION_YEAR_REQUIRED'));
});

test('certificate preparation is explicitly warned', () => {
  const value = energy.createDefaultEnergyProjectSettings({ calculationPurpose: 'certificatePreparation' });
  assert(energy.validateEnergyProjectSettings(value).some((item) => item.code === 'CERTIFICATE_PREPARATION_ONLY'));
});

test('rule set is architecture only', () => {
  const value = registry.getEnergyRuleSet('HU_EKM_2023_11_01');
  assert.equal(value.metadata.calculationAvailable, false);
  assert.equal(value.metadata.professionalReviewRequired, true);
  assert.equal(value.sourceReferences.length, 3);
});

test('development material catalog has 20-30 records', () => {
  assert(catalog.genericMaterialCatalog.length >= 20);
  assert(catalog.genericMaterialCatalog.length <= 30);
  assert.equal(catalog.genericMaterialCatalog.length, 25);
});

test('development catalog cannot be published', () => {
  assert.equal(sourceTypes.canPublishMaterialSource(catalog.developmentMaterialSourcePackage), false);
  assert(validateSource.validateMaterialSource(catalog.developmentMaterialSourcePackage, true).some((item) => item.code === 'PUBLICATION_NOT_ALLOWED'));
});

test('all development materials are private draft unverified records', () => {
  for (const entry of catalog.genericMaterialCatalog) {
    assert.equal(entry.material.visibility, 'private');
    assert.equal(entry.material.publicationStatus, 'draft');
    assert.equal(entry.version.verificationStatus, 'unverified');
    assert.equal(entry.version.sourcePackageId, catalog.developmentMaterialSourcePackage.id);
  }
});

test('accent insensitive material search works', () => {
  const result = search.searchMaterialCatalog(catalog.genericMaterialCatalog, { query: 'porusbeton' });
  assert.equal(result.length, 1);
  assert(result[0].material.productName.includes('pórusbeton'));
});

test('category search works', () => {
  const result = search.searchMaterialCatalog(catalog.genericMaterialCatalog, { categoryId: 'concrete' });
  assert.equal(result.length, 2);
});

test('lambda interval filter works', () => {
  const result = search.searchMaterialCatalog(catalog.genericMaterialCatalog, { lambdaMax: 0.04 });
  assert(result.length >= 5);
  assert(result.every((entry) => entry.version.designLambdaWmK.value <= 0.04));
});

test('development material validation produces calculation warning but no structural error', () => {
  const entry = catalog.genericMaterialCatalog[0];
  const messages = validateMaterial.validateMaterial(entry.material, entry.version, true);
  assert(messages.some((item) => item.code === 'UNVERIFIED_FOR_CALCULATION'));
  assert(!messages.some((item) => item.severity === 'error'));
});

test('invalid property set blocks missing lambda', () => {
  const entry = catalog.genericMaterialCatalog[0];
  const invalid = { ...entry.version, designLambdaWmK: undefined, declaredLambdaWmK: undefined };
  assert(validatePropertySet.validateMaterialPropertySet(invalid, true).some((item) => item.code === 'LAMBDA_REQUIRED'));
});

test('snapshot is immutable and references exact material version', () => {
  const entry = catalog.genericMaterialCatalog[9];
  const frozen = snapshot.freezeMaterialSnapshot(entry.material, entry.version, { capturedAt: '2026-07-29T01:00:00.000Z' });
  assert(Object.isFrozen(frozen));
  assert.equal(frozen.materialVersionId, entry.version.id);
  assert.equal(frozen.lambdaSource, 'design');
  assert.equal(frozen.capturedAt, '2026-07-29T01:00:00.000Z');
});

test('lambda override requires reason', () => {
  const entry = catalog.genericMaterialCatalog[9];
  assert.throws(() => snapshot.freezeMaterialSnapshot(entry.material, entry.version, { lambdaOverrideWmK: 0.041 }), /indoklása kötelező/);
});

test('reasoned lambda override is captured as custom', () => {
  const entry = catalog.genericMaterialCatalog[9];
  const frozen = snapshot.freezeMaterialSnapshot(entry.material, entry.version, { lambdaOverrideWmK: 0.041, overrideReason: 'Helyszíni tervezői korrekció' });
  assert.equal(frozen.lambdaUsedWmK, 0.041);
  assert.equal(frozen.lambdaSource, 'custom');
});

console.log(JSON.stringify({ ok: true, testCount: tests.length, tests, materialCount: catalog.genericMaterialCatalog.length, ruleSet: registry.getEnergyRuleSet('HU_EKM_2023_11_01').metadata }, null, 2));
