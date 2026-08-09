const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

let testCount = 0;
const tests = [];
function assert(condition, message) { if (!condition) throw new Error(message); }
function pass(message) { testCount += 1; tests.push(message); }

function transpile(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName,
  }).outputText;
}

const root = path.resolve(__dirname, '..');
const adapterPath = path.join(root, 'components/property-survey/bluetooth/leicaDistoBle.ts');
const panelPath = path.join(root, 'components/property-survey/PropertySurveyMeasurementPanel.tsx');
const dimensionPath = path.join(root, 'components/property-survey/propertySurveyRoomDimensions.ts');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dimpro-leica-disto-'));
const compiledPath = path.join(tempDir, 'leicaDistoBle.cjs');
fs.writeFileSync(compiledPath, transpile(fs.readFileSync(adapterPath, 'utf8'), adapterPath));
const adapter = require(compiledPath);
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
const panelSource = fs.readFileSync(panelPath, 'utf8');
const dimensionSource = fs.readFileSync(dimensionPath, 'utf8');

assert(adapter.LEICA_DISTO_SERVICE_UUID === '3ab10100-f831-4395-b29d-570977d5bf94', 'A Leica DISTO szolgáltatás UUID-je hibás.');
assert(adapter.LEICA_DISTO_DISTANCE_CHARACTERISTIC_UUID === '3ab10101-f831-4395-b29d-570977d5bf94', 'A Leica DISTO távolságkarakterisztika UUID-je hibás.');
pass('A Leica DISTO BLE szolgáltatás és távolságkarakterisztika azonosítója rögzített');

const bytes = new ArrayBuffer(4);
new DataView(bytes).setFloat32(0, 3.456, true);
const parsed = adapter.parseLeicaDistoDistance(new DataView(bytes));
assert(Math.abs(parsed - 3.456) < 0.00001, `A little-endian Float32 távolság átalakítása hibás: ${parsed}`);
pass('A DISTO Float32 little-endian mérési adat méterértékké alakul');

assert(adapter.parseLeicaDistoDistance(null) === null, 'Hiányzó mérési adatnál null szükséges.');
const invalidBytes = new ArrayBuffer(4);
new DataView(invalidBytes).setFloat32(0, Number.NaN, true);
assert(adapter.parseLeicaDistoDistance(new DataView(invalidBytes)) === null, 'Nem szám mérési adat nem fogadható el.');
pass('A hiányzó vagy érvénytelen Bluetooth mérés biztonságosan elutasításra kerül');

for (const errorName of ['NotFoundError', 'SecurityError', 'NetworkError', 'NotSupportedError', 'InvalidStateError']) {
  const message = adapter.getBluetoothErrorMessage(new DOMException('teszt', errorName));
  assert(typeof message === 'string' && message.length > 20, `Hiányzó részletes Bluetooth hibaüzenet: ${errorName}`);
}
pass('A fő Web Bluetooth hibákhoz felhasználói hibaüzenet tartozik');

for (const marker of [
  'startNotifications()',
  'characteristicvaluechanged',
  'gattserverdisconnected',
  'getFloat32(0, true)',
  'namePrefix: "DISTO"',
]) assert(adapterSource.includes(marker), `Hiányzó Leica adapter marker: ${marker}`);
pass('A GATT-kapcsolat, értesítés-feliratkozás és kapcsolatbontás kezelése be van kötve');

for (const marker of [
  'Leica DISTO D2 csatlakoztatva',
  'bluetooth_leica',
  'onApplyRef.current(activeTarget',
  'Leica csatlakoztatása',
]) assert(panelSource.includes(marker), `Hiányzó mérési panel marker: ${marker}`);
assert(dimensionSource.includes('case "bluetooth_leica": return "Leica DISTO Bluetooth"'), 'A Leica mérési adatforrás címkéje hiányzik.');
pass('A közvetlen Leica mérés az aktív célmezőbe kerül és Leica DISTO Bluetooth forrásként naplózódik');

console.log(`DIMPRO Felmérő Leica DISTO D2 BLE teszt: ${testCount}/${testCount} sikeres`);
for (const [index, test] of tests.entries()) console.log(`${index + 1}. ${test}`);
