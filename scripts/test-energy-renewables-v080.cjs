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
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
    fileName: filename,
  }).outputText, filename);
};

const {
  createDefaultEnergyRenewableWorkspace,
  createEnergyRoofSurface,
  normalizeEnergyRenewableWorkspace,
} = require('../components/energy/domain/energyRenewableTypes.ts');
const { calculateEnergyRenewableSizing } = require('../components/energy/calculations/renewables/calculateRenewableSizing.ts');

let count = 0;
function assert(condition, message) {
  count += 1;
  if (!condition) throw new Error(`Teszt ${count}: ${message}`);
}
function near(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance, `${message}; várt=${expected}, kapott=${actual}`);
}
function hasCode(result, code) {
  return result.validationMessages.some((item) => item.code === code);
}

const disabled = calculateEnergyRenewableSizing(createDefaultEnergyRenewableWorkspace());
assert(disabled.enabled === false, 'A gyári munkatér legyen kikapcsolva.');
assert(disabled.schema === 'dimpro.energy-renewable-sizing.v0.8.0', 'Hibás eredményséma.');
assert(disabled.pv.estimatedAnnualYieldKwh === null, 'Kikapcsolt állapot ne számítson napelemes hozamot.');

const roof = createEnergyRoofSurface({
  id: 'roof-south',
  name: 'Déli tetősík',
  status: 'selected',
  azimuthDegrees: 180,
  tiltDegrees: 35,
  grossAreaSquareMeters: 50,
  usableAreaSquareMeters: 40,
  shadingFactor: 0.9,
  structuralAssessment: 'Helyszíni szemrevételezés alapján alkalmas, statikus ellenőrizze.',
  sourceReference: 'Helyszíni mérés 2026-07-29',
});
const workspace = normalizeEnergyRenewableWorkspace({
  enabled: true,
  roofSurfaces: [roof],
  electricityProfile: {
    annualConsumptionKwh: 6000,
    daytimeConsumptionSharePercent: 40,
    simultaneousBaseLoadKw: 2,
    phaseMode: 'threePhase',
    connectionAmpsPerPhase: 32,
    connectionVoltageV: 400,
    sourceReference: 'Éves villanyszámla és mérőhely',
    dataStatus: 'documented',
  },
  pv: {
    enabled: true,
    name: 'PV referencia',
    roofSurfaceIds: ['roof-south'],
    modulePowerWp: 450,
    moduleAreaSquareMeters: 2,
    panelCount: 18,
    inverterAcPowerKw: 8,
    specificYieldKwhPerKwpYear: 1200,
    systemLossPercent: 10,
    connectionMode: 'hybrid',
    sourceReference: 'Helyszíni előméretezés és dokumentált hozamadat',
    dataStatus: 'estimated',
    note: '',
  },
  solarThermal: {
    enabled: true,
    name: 'Napkollektor referencia',
    roofSurfaceId: 'roof-south',
    collectorType: 'flatPlate',
    collectorAreaSquareMeters: 4,
    persons: 4,
    dailyHotWaterLitersPerPerson: 50,
    coldWaterTemperatureC: 10,
    hotWaterTemperatureC: 45,
    specificYieldKwhPerSquareMeterYear: 500,
    systemLossPercent: 20,
    storageLitersPerSquareMeter: 60,
    sourceReference: 'Gyártói adat és helyszíni előméretezés',
    dataStatus: 'estimated',
    note: '',
  },
  battery: {
    enabled: true,
    name: 'Tároló referencia',
    purpose: 'combined',
    nominalCapacityKwh: 10,
    usableCapacityKwh: 9,
    usableFraction: 0.9,
    roundTripEfficiency: 0.9,
    maxChargePowerKw: 5,
    maxDischargePowerKw: 5,
    reservePercent: 10,
    criticalLoadKw: 1,
    backupHours: 4,
    sourceReference: 'Gyártói adatlap',
    dataStatus: 'documented',
    note: '',
  },
  evCharging: {
    enabled: true,
    name: 'EV referencia',
    annualDistanceKm: 15000,
    vehicleConsumptionKwhPer100Km: 18,
    homeChargingSharePercent: 80,
    chargerPowerKw: 11,
    phaseMode: 'threePhase',
    dynamicLoadBalancing: true,
    smartPvCharging: true,
    vehicles: 1,
    sourceReference: 'Tulajdonosi használati adat',
    dataStatus: 'documented',
    note: '',
  },
});
const result = calculateEnergyRenewableSizing(workspace);
assert(result.enabled === true, 'Bekapcsolt eredmény legyen aktív.');
assert(result.roof.selectedSurfaceCount === 1, 'Egy kiválasztott tetősík szükséges.');
near(result.roof.grossAreaSquareMeters, 50, 0.0001, 'Hibás bruttó tetőfelület.');
near(result.roof.usableAreaSquareMeters, 40, 0.0001, 'Hibás hasznos tetőfelület.');
assert(result.pv.maxPanelCount === 20, 'A 40 m² felületre 20 darab 2 m²-es modul férjen.');
assert(result.pv.selectedPanelCount === 18, 'A kiválasztott paneldarabszám hibás.');
near(result.pv.installedPowerKwp, 8.1, 0.0001, 'Hibás PV kWp.');
near(result.pv.inverterDcAcRatio, 1.013, 0.001, 'Hibás DC/AC arány.');
near(result.pv.estimatedAnnualYieldKwh, 7873.2, 0.1, 'Hibás éves PV hozam.');
near(result.evCharging.annualHomeChargingEnergyKwh, 2160, 0.1, 'Hibás éves otthoni EV energia.');
near(result.evCharging.averageDailyChargingEnergyKwh, 5.92, 0.01, 'Hibás napi EV energia.');
near(result.evCharging.averageDailyChargingHours, 0.54, 0.01, 'Hibás napi töltési idő.');
near(result.evCharging.chargerCurrentAmps, 15.88, 0.02, 'Hibás 3 fázisú töltőáram.');
assert(result.evCharging.connectionSufficient === true, 'A 3x32 A csatlakozás a referencia terheléssel legyen elegendő.');
near(result.totals.annualBuildingAndEvElectricityKwh, 8160, 0.1, 'Hibás teljes villamos energiaigény.');
near(result.pv.estimatedDirectSelfConsumptionKwh, 3264, 0.1, 'Hibás közvetlen sajátfogyasztás.');
near(result.pv.estimatedSurplusKwh, 4609.2, 0.1, 'Hibás PV többlet.');
near(result.pv.estimatedSelfConsumptionRatePercent, 41.5, 0.1, 'Hibás közvetlen sajátfogyasztási arány.');
near(result.solarThermal.annualHotWaterDemandKwh, 2970.9, 0.2, 'Hibás éves HMV-hőigény.');
near(result.solarThermal.estimatedAnnualYieldKwh, 1440, 0.1, 'Hibás kollektorhozam.');
near(result.solarThermal.estimatedCoveragePercent, 48.5, 0.2, 'Hibás napkollektoros lefedettség.');
near(result.solarThermal.suggestedStorageVolumeLiters, 240, 0.1, 'Hibás javasolt tárolótérfogat.');
near(result.battery.estimatedEveningDemandKwhPerDay, 13.41, 0.02, 'Hibás esti napi villamos igény.');
near(result.battery.estimatedPvSurplusKwhPerDay, 12.63, 0.02, 'Hibás napi PV többlet.');
near(result.battery.backupUsableCapacityKwh, 4.44, 0.02, 'Hibás tartaléküzemi használható kapacitás.');
near(result.battery.suggestedUsableCapacityKwh, 12.63, 0.02, 'Hibás javasolt használható tárolókapacitás.');
near(result.battery.suggestedNominalCapacityKwh, 14.03, 0.03, 'Hibás javasolt névleges tárolókapacitás.');
assert(result.validationMessages.filter((item) => item.severity === 'blocking').length === 0, 'A teljes referencia ne legyen blokkolt.');

const overflow = calculateEnergyRenewableSizing(normalizeEnergyRenewableWorkspace({
  ...workspace,
  pv: { ...workspace.pv, panelCount: 25 },
}));
assert(hasCode(overflow, 'PV_PANEL_COUNT_EXCEEDS_ROOF'), 'A tetőfelületet meghaladó paneldarabszám legyen blokkolt.');

const missingYield = calculateEnergyRenewableSizing(normalizeEnergyRenewableWorkspace({
  ...workspace,
  pv: { ...workspace.pv, specificYieldKwhPerKwpYear: 0 },
}));
assert(hasCode(missingYield, 'PV_SPECIFIC_YIELD_REQUIRED'), 'Hiányzó fajlagos PV hozam legyen blokkolt.');
assert(missingYield.pv.estimatedAnnualYieldKwh === null, 'Hiányzó PV hozamadat mellett ne készüljön éves hozam.');

const roofInvalid = calculateEnergyRenewableSizing(normalizeEnergyRenewableWorkspace({
  ...workspace,
  roofSurfaces: [{ ...roof, grossAreaSquareMeters: 20, usableAreaSquareMeters: 25 }],
}));
assert(hasCode(roofInvalid, 'ROOF_USABLE_EXCEEDS_GROSS'), 'A bruttónál nagyobb hasznos tetőfelület legyen blokkolt.');

const evInsufficient = calculateEnergyRenewableSizing(normalizeEnergyRenewableWorkspace({
  ...workspace,
  electricityProfile: { ...workspace.electricityProfile, connectionAmpsPerPhase: 16, simultaneousBaseLoadKw: 5 },
  evCharging: { ...workspace.evCharging, dynamicLoadBalancing: false },
}));
assert(evInsufficient.evCharging.connectionSufficient === false, 'A kis hálózati tartalék legyen elégtelen.');
assert(hasCode(evInsufficient, 'EV_CONNECTION_INSUFFICIENT'), 'Terhelésmenedzsment nélküli elégtelen csatlakozás legyen blokkolt.');

const evManaged = calculateEnergyRenewableSizing(normalizeEnergyRenewableWorkspace({
  ...workspace,
  electricityProfile: { ...workspace.electricityProfile, connectionAmpsPerPhase: 16, simultaneousBaseLoadKw: 5 },
  evCharging: { ...workspace.evCharging, dynamicLoadBalancing: true },
}));
assert(hasCode(evManaged, 'EV_DYNAMIC_BALANCING_REQUIRED'), 'Dinamikus töltésnél figyelmeztetés szükséges.');
assert(!evManaged.validationMessages.some((item) => item.code === 'EV_CONNECTION_INSUFFICIENT'), 'Dinamikus töltés ne kapjon végleges blokkolást csak a névleges teljesítmény miatt.');

const batteryInvalid = calculateEnergyRenewableSizing(normalizeEnergyRenewableWorkspace({
  ...workspace,
  battery: { ...workspace.battery, nominalCapacityKwh: 8, usableCapacityKwh: 9 },
}));
assert(hasCode(batteryInvalid, 'BATTERY_USABLE_EXCEEDS_NOMINAL'), 'A névlegesnél nagyobb használható kapacitás legyen blokkolt.');

const batteryPowerInvalid = calculateEnergyRenewableSizing(normalizeEnergyRenewableWorkspace({
  ...workspace,
  battery: { ...workspace.battery, criticalLoadKw: 6, maxDischargePowerKw: 5 },
}));
assert(hasCode(batteryPowerInvalid, 'BATTERY_BACKUP_POWER_INSUFFICIENT'), 'A kisütési teljesítmény hiánya legyen blokkolt.');

const thermalInvalid = calculateEnergyRenewableSizing(normalizeEnergyRenewableWorkspace({
  ...workspace,
  solarThermal: { ...workspace.solarThermal, hotWaterTemperatureC: 10, coldWaterTemperatureC: 10 },
}));
assert(hasCode(thermalInvalid, 'SOLAR_THERMAL_TEMPERATURE_INVALID'), 'Hibás HMV hőmérséklet legyen blokkolt.');

const commaNormalized = normalizeEnergyRenewableWorkspace({
  enabled: true,
  pv: { ...workspace.pv, modulePowerWp: '450', moduleAreaSquareMeters: '2,05', panelCount: '10', inverterAcPowerKw: '4,5', specificYieldKwhPerKwpYear: '1100', systemLossPercent: '14' },
});
near(commaNormalized.pv.moduleAreaSquareMeters, 2.05, 0.0001, 'A magyar tizedesvessző normalizálása hibás.');
near(commaNormalized.pv.inverterAcPowerKw, 4.5, 0.0001, 'Az inverter tizedesvessző normalizálása hibás.');

console.log(JSON.stringify({ ok: true, testCount: count, sample: result }, null, 2));
