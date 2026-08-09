const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request.startsWith('@/')) request = path.join(root, request.slice(2));
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = function(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { buildWinWattFieldMap } = require('../components/energy/transfers/winwatt/buildWinWattFieldMap.ts');

let testCount = 0;
function assert(condition, message) {
  testCount += 1;
  if (!condition) throw new Error(`${testCount}. teszt sikertelen: ${message}`);
}

const tables = [
  {
    id: 'general', label: 'Általános adatok', description: '',
    columns: [{ key: 'field', label: 'Adat' }, { key: 'value', label: 'Érték' }, { key: 'unit', label: 'Mértékegység' }, { key: 'source', label: 'Forrás' }, { key: 'status', label: 'Státusz' }],
    rows: [
      { id: 'general-1', field: 'Felmérés neve', value: 'Teszt felmérés', unit: '', source: 'Projektadat', status: 'documented' },
      { id: 'general-2', field: 'Felmérési mód', value: 'Energetikai felmérés', unit: '', source: 'Projektadat', status: 'documented' },
      { id: 'general-3', field: 'Cím', value: '4200 Hajdúszoboszló, Teszt utca 1.', unit: '', source: 'Helyszíni adat', status: 'documented' },
      { id: 'general-4', field: 'Rendeltetés', value: 'Lakóépület', unit: '', source: 'Helyszíni adat', status: 'documented' },
      { id: 'general-5', field: 'Hasznos fűtött alapterület', value: 83.72, unit: 'm²', source: 'Geometriai motor', status: 'validated' },
      { id: 'general-6', field: 'Kondicionált térfogat', value: 225.38, unit: 'm³', source: 'Geometriai motor', status: 'validated' },
      { id: 'general-7', field: 'Felület/térfogat arány', value: 1.216, unit: 'm²/m³', source: 'Geometriai motor', status: 'validated' },
    ],
  },
  {
    id: 'materials', label: 'Anyagok', description: '',
    columns: [{ key: 'name', label: 'Megnevezés' }, { key: 'lambda', label: 'λ', unit: 'W/mK' }, { key: 'source', label: 'Forrás' }, { key: 'status', label: 'Státusz' }],
    rows: [{ id: 'mat-1', name: 'EPS 80', lambda: 0.039, source: 'Termékadatlap', status: 'verified' }],
  },
  {
    id: 'structures', label: 'Szerkezetek', description: '',
    columns: [{ key: 'name', label: 'Megnevezés' }, { key: 'category', label: 'Típus' }, { key: 'effectiveU', label: 'U eredő', unit: 'W/m²K' }, { key: 'status', label: 'Státusz' }],
    rows: [{ id: 'str-1', name: 'Külső fal', category: 'externalWall', effectiveU: 0.24, status: 'Rendben' }],
  },
  {
    id: 'rooms', label: 'Helyiségek', description: '',
    columns: [{ key: 'name', label: 'Helyiség' }, { key: 'level', label: 'Szint' }, { key: 'area', label: 'A', unit: 'm²' }, { key: 'height', label: 'Magasság', unit: 'm' }, { key: 'volume', label: 'V', unit: 'm³' }, { key: 'status', label: 'Státusz' }],
    rows: [{ id: 'room-1', name: 'Nappali', level: 'Földszint', area: 30, height: 2.7, volume: 81, status: 'Rendben' }],
  },
  {
    id: 'levels', label: 'Épületszintek', description: '',
    columns: [{ key: 'name', label: 'Szint' }, { key: 'order', label: 'Sorrend' }, { key: 'status', label: 'Státusz' }],
    rows: [{ id: 'level-1', name: 'Földszint', order: 1, status: 'Rendben' }],
  },
  {
    id: 'zones', label: 'Zónák', description: '',
    columns: [{ key: 'name', label: 'Megnevezés' }, { key: 'kind', label: 'Típus' }, { key: 'area', label: 'A', unit: 'm²' }, { key: 'volume', label: 'V', unit: 'm³' }, { key: 'status', label: 'Státusz' }],
    rows: [{ id: 'zone-1', name: 'Fűtött zóna', kind: 'Fűtött zóna', area: 83.72, volume: 225.38, status: 'Rendben' }],
  },
  {
    id: 'boundaries', label: 'Határoló szerkezetek', description: '',
    columns: [{ key: 'name', label: 'Szerkezet' }, { key: 'level', label: 'Szint' }, { key: 'room', label: 'Helyiség' }, { key: 'boundary', label: 'Határ' }, { key: 'netArea', label: 'A nettó', unit: 'm²' }, { key: 'assembly', label: 'Rétegrend' }, { key: 'uValue', label: 'U', unit: 'W/m²K' }, { key: 'status', label: 'Státusz' }],
    rows: [{ id: 'wall-1', name: 'Déli fal', level: 'Földszint', room: 'Nappali', boundary: 'Külső levegő', netArea: 20, assembly: 'Külső fal', uValue: 0.24, status: 'Rendben' }],
  },
  {
    id: 'sources', label: 'Források és ellenőrzés', description: '',
    columns: [{ key: 'domain', label: 'Adatcsoport' }, { key: 'source', label: 'Motor / forrás' }, { key: 'records', label: 'Rekordok' }, { key: 'status', label: 'Státusz' }],
    rows: [{ id: 'geometry', domain: 'Geometria', source: 'dimpro.energy.geometry', records: 12, status: 'Rendben' }],
  },
  {
    id: 'thermalBridges', label: 'Hőhidak', description: '',
    columns: [{ key: 'name', label: 'Hőhíd' }, { key: 'kind', label: 'Típus' }, { key: 'psi', label: 'Ψ', unit: 'W/mK' }],
    rows: [],
  },
];

const result = buildWinWattFieldMap(tables);
assert(result.schema === 'dimpro.winwatt-field-map.v0.8.3', 'Hibás mezőtérkép séma.');
assert(result.totals.tableCount === tables.length, 'Hibás táblaösszesítés.');
assert(result.totals.mappedFieldCount > 20, 'Túl kevés mező került leképezésre.');
assert(result.totals.transferRecordCount > 20, 'Túl kevés átadási rekord készült.');
assert(result.fields.some((field) => field.targetFieldKey === 'WW.building.cim'), 'A cím célkulcsa hiányzik.');
assert(result.fields.some((field) => field.sourceTableId === 'materials' && field.sourceColumnKey === 'lambda' && field.dataType === 'number'), 'A lambda mező nem számtípusú.');
assert(result.fields.some((field) => field.sourceTableId === 'thermalBridges' && field.readiness === 'notApplicable'), 'Az üres opcionális hőhídcsoport blokkolt.');
assert(result.tables.find((table) => table.tableId === 'thermalBridges').readiness === 'notApplicable', 'Az üres hőhídtábla státusza hibás.');
assert(result.readyForTrialTransfer === true, 'A teljes referencia nem lett próbaátadásra kész.');
assert(result.totals.blockedFieldCount === 0, 'A hibamentes referencia blokkolt mezőt tartalmaz.');
assert(result.totals.reviewFieldCount > 0, 'A kézi/próbaellenőrzési mezők nem jelentek meg.');
assert(result.totals.referenceAlignedFieldCount > 0, 'Nincs referenciaillesztett mező.');
assert(result.totals.trialRequiredFieldCount > 0, 'Nincs próbaátadást igénylő mező.');
assert(result.validationMessages.some((message) => message.code === 'WINWATT_TRIAL_TRANSFER_READY'), 'A próbaátadási készültségüzenet hiányzik.');

const invalidTables = JSON.parse(JSON.stringify(tables));
invalidTables.find((table) => table.id === 'materials').rows[0].lambda = 'hibás';
const invalidResult = buildWinWattFieldMap(invalidTables);
assert(invalidResult.readyForTrialTransfer === false, 'Hibás számalak mellett átadásra kész maradt.');
assert(invalidResult.totals.invalidValueCount >= 1, 'A hibás számalak nem került kimutatásra.');
assert(invalidResult.fields.find((field) => field.sourceTableId === 'materials' && field.sourceColumnKey === 'lambda').readiness === 'blocked', 'A hibás lambda mező nem blokkolt.');
assert(invalidResult.validationMessages.some((message) => message.code === 'WINWATT_FIELD_BLOCKED'), 'A blokkoló mezőüzenet hiányzik.');

const missingTables = JSON.parse(JSON.stringify(tables));
missingTables.find((table) => table.id === 'rooms').rows[0].name = '';
const missingResult = buildWinWattFieldMap(missingTables);
assert(missingResult.readyForTrialTransfer === false, 'Hiányzó kötelező helyiségnév mellett átadásra kész maradt.');
assert(missingResult.totals.missingRequiredValueCount >= 1, 'A hiányzó kötelező érték nem került összesítésre.');
assert(missingResult.records.some((record) => record.sourceTableId === 'rooms' && record.sourceColumnKey === 'name' && record.readiness === 'blocked'), 'A hiányzó helyiségnév rekordja nem blokkolt.');

console.log(JSON.stringify({
  ok: true,
  testCount,
  mappedFields: result.totals.mappedFieldCount,
  transferRecords: result.totals.transferRecordCount,
  readyFields: result.totals.readyFieldCount,
  reviewFields: result.totals.reviewFieldCount,
  blockedFields: result.totals.blockedFieldCount,
  readyForTrialTransfer: result.readyForTrialTransfer,
}, null, 2));
