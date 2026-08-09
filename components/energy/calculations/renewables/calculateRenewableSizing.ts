import {
  normalizeEnergyRenewableWorkspace,
  type EnergyRenewableSizingResult,
  type EnergyRenewableValidationMessage,
  type EnergyRenewableWorkspace,
} from "@/components/energy/domain/energyRenewableTypes";

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function addMessage(messages: EnergyRenewableValidationMessage[], code: string, severity: EnergyRenewableValidationMessage["severity"], message: string, entityId?: string) {
  if (!messages.some((item) => item.code === code && item.entityId === entityId)) messages.push({ code, severity, message, entityId });
}

function currentForPower(powerKw: number, phaseMode: "singlePhase" | "threePhase", voltageV: number) {
  if (!(powerKw > 0) || !(voltageV > 0)) return null;
  return phaseMode === "threePhase"
    ? (powerKw * 1000) / (Math.sqrt(3) * voltageV)
    : (powerKw * 1000) / voltageV;
}

export function calculateEnergyRenewableSizing(rawWorkspace: EnergyRenewableWorkspace): EnergyRenewableSizingResult {
  const workspace = normalizeEnergyRenewableWorkspace(rawWorkspace);
  const messages: EnergyRenewableValidationMessage[] = [];
  const selectedSurfaces = workspace.roofSurfaces.filter((surface) => surface.status === "selected" && workspace.pv.roofSurfaceIds.includes(surface.id));
  const solarThermalSurface = workspace.roofSurfaces.find((surface) => surface.id === workspace.solarThermal.roofSurfaceId);
  const grossArea = selectedSurfaces.reduce((sum, surface) => sum + surface.grossAreaSquareMeters, 0);
  const usableArea = selectedSurfaces.reduce((sum, surface) => sum + surface.usableAreaSquareMeters, 0);
  const weightedShadingFactor = usableArea > 0
    ? selectedSurfaces.reduce((sum, surface) => sum + surface.usableAreaSquareMeters * surface.shadingFactor, 0) / usableArea
    : 1;

  if (!workspace.enabled) {
    return {
      schema: "dimpro.energy-renewable-sizing.v0.8.0",
      enabled: false,
      roof: { selectedSurfaceCount: 0, grossAreaSquareMeters: 0, usableAreaSquareMeters: 0 },
      pv: { maxPanelCount: 0, selectedPanelCount: 0, installedPowerKwp: 0, inverterDcAcRatio: null, estimatedAnnualYieldKwh: null, estimatedDirectSelfConsumptionKwh: null, estimatedSurplusKwh: null, estimatedSelfConsumptionRatePercent: null },
      solarThermal: { annualHotWaterDemandKwh: null, estimatedAnnualYieldKwh: null, estimatedCoveragePercent: null, suggestedStorageVolumeLiters: null },
      battery: { estimatedEveningDemandKwhPerDay: null, estimatedPvSurplusKwhPerDay: null, backupUsableCapacityKwh: null, suggestedUsableCapacityKwh: null, suggestedNominalCapacityKwh: null, selectedNominalCapacityKwh: workspace.battery.nominalCapacityKwh, selectedUsableCapacityKwh: workspace.battery.usableCapacityKwh },
      evCharging: { annualHomeChargingEnergyKwh: null, averageDailyChargingEnergyKwh: null, averageDailyChargingHours: null, chargerCurrentAmps: null, availableCurrentHeadroomAmps: null, connectionSufficient: null },
      totals: { annualBuildingAndEvElectricityKwh: workspace.electricityProfile.annualConsumptionKwh, estimatedPvCoveragePercent: null },
      validationMessages: [],
      limitation: "A megújuló és villamos helyszíni előméretezés nincs bekapcsolva.",
    };
  }

  if (!workspace.electricityProfile.sourceReference.trim()) addMessage(messages, "ELECTRICITY_SOURCE_REQUIRED", "warning", "Az éves villamosenergia-fogyasztás és a hálózati csatlakozás forrását rögzíteni kell.");
  if (!(workspace.electricityProfile.connectionAmpsPerPhase > 0)) addMessage(messages, "CONNECTION_CURRENT_REQUIRED", "blocking", "A rendelkezésre álló csatlakozási áramerősség szükséges a töltő és az inverter ellenőrzéséhez.");

  const pv = workspace.pv;
  const maxPanelCount = pv.moduleAreaSquareMeters > 0 ? Math.floor(usableArea / pv.moduleAreaSquareMeters) : 0;
  const installedPowerKwp = round((pv.panelCount * pv.modulePowerWp) / 1000);
  const inverterDcAcRatio = pv.inverterAcPowerKw > 0 ? round(installedPowerKwp / pv.inverterAcPowerKw, 3) : null;
  let estimatedAnnualPvYield: number | null = null;
  let directSelfConsumption: number | null = null;
  let estimatedSurplus: number | null = null;
  let pvSelfConsumptionRate: number | null = null;

  if (pv.enabled) {
    if (!selectedSurfaces.length) addMessage(messages, "PV_ROOF_REQUIRED", "blocking", "A napelemhez legalább egy kiválasztott tetősík szükséges.");
    if (!(pv.moduleAreaSquareMeters > 0) || !(pv.modulePowerWp > 0)) addMessage(messages, "PV_MODULE_REQUIRED", "blocking", "A modul teljesítményét és felületét meg kell adni.");
    if (!(pv.panelCount > 0)) addMessage(messages, "PV_PANEL_COUNT_REQUIRED", "blocking", "A kiválasztott napelemszám legyen nagyobb nullánál.");
    if (pv.panelCount > maxPanelCount && maxPanelCount >= 0) addMessage(messages, "PV_PANEL_COUNT_EXCEEDS_ROOF", "blocking", `A kiválasztott ${pv.panelCount} panel nem fér el a megadott ${round(usableArea, 2)} m² hasznos tetőfelületen.`, "pv");
    if (!(pv.inverterAcPowerKw > 0)) addMessage(messages, "PV_INVERTER_REQUIRED", "blocking", "Az inverter névleges AC teljesítménye szükséges.");
    if (!(pv.specificYieldKwhPerKwpYear > 0)) addMessage(messages, "PV_SPECIFIC_YIELD_REQUIRED", "blocking", "A fajlagos éves napelemes hozamot dokumentált forrásból meg kell adni.");
    if (!pv.sourceReference.trim()) addMessage(messages, "PV_SOURCE_REQUIRED", "warning", "A napelemes előméretezés forráshivatkozása hiányzik.");
    if (installedPowerKwp > 0 && pv.specificYieldKwhPerKwpYear > 0) {
      estimatedAnnualPvYield = round(installedPowerKwp * pv.specificYieldKwhPerKwpYear * (1 - pv.systemLossPercent / 100) * weightedShadingFactor, 1);
    }
  }

  const ev = workspace.evCharging;
  let annualEvEnergy: number | null = null;
  let dailyEvEnergy: number | null = null;
  let dailyChargingHours: number | null = null;
  let chargerCurrentAmps: number | null = null;
  let availableHeadroomAmps: number | null = null;
  let connectionSufficient: boolean | null = null;

  if (ev.enabled) {
    if (!(ev.annualDistanceKm > 0) || !(ev.vehicleConsumptionKwhPer100Km > 0)) addMessage(messages, "EV_USAGE_REQUIRED", "blocking", "Az éves futásteljesítmény és a jármű fogyasztása szükséges.");
    if (!(ev.chargerPowerKw > 0)) addMessage(messages, "EV_CHARGER_POWER_REQUIRED", "blocking", "A töltő névleges teljesítménye szükséges.");
    if (!ev.sourceReference.trim()) addMessage(messages, "EV_SOURCE_REQUIRED", "warning", "Az autóhasználati és töltési adatok forráshivatkozása hiányzik.");
    annualEvEnergy = round(ev.annualDistanceKm * ev.vehicleConsumptionKwhPer100Km / 100 * (ev.homeChargingSharePercent / 100) * ev.vehicles, 1);
    dailyEvEnergy = round(annualEvEnergy / 365, 2);
    dailyChargingHours = ev.chargerPowerKw > 0 ? round(dailyEvEnergy / ev.chargerPowerKw, 2) : null;
    chargerCurrentAmps = currentForPower(ev.chargerPowerKw, ev.phaseMode, ev.phaseMode === "threePhase" ? 400 : 230);
    const baseCurrent = currentForPower(workspace.electricityProfile.simultaneousBaseLoadKw, workspace.electricityProfile.phaseMode, workspace.electricityProfile.connectionVoltageV);
    availableHeadroomAmps = baseCurrent === null ? null : round(workspace.electricityProfile.connectionAmpsPerPhase - baseCurrent, 2);
    connectionSufficient = chargerCurrentAmps === null || availableHeadroomAmps === null ? null : availableHeadroomAmps >= chargerCurrentAmps;
    if (connectionSufficient === false && !ev.dynamicLoadBalancing) addMessage(messages, "EV_CONNECTION_INSUFFICIENT", "blocking", "A töltő becsült áramigénye meghaladja a rendelkezésre álló hálózati tartalékot. Dinamikus terhelésmenedzsment vagy hálózatbővítés szükséges.");
    if (connectionSufficient === false && ev.dynamicLoadBalancing) addMessage(messages, "EV_DYNAMIC_BALANCING_REQUIRED", "warning", "A névleges töltőteljesítmény csak dinamikus terhelésmenedzsmenttel tartható a jelenlegi csatlakozáson.");
  }

  const annualBuildingAndEv = round(workspace.electricityProfile.annualConsumptionKwh + (annualEvEnergy || 0), 1);
  if (estimatedAnnualPvYield !== null) {
    const daytimeFraction = workspace.electricityProfile.daytimeConsumptionSharePercent / 100;
    const annualDaytimeDemand = annualBuildingAndEv * daytimeFraction;
    directSelfConsumption = round(Math.min(estimatedAnnualPvYield, annualDaytimeDemand), 1);
    estimatedSurplus = round(Math.max(0, estimatedAnnualPvYield - directSelfConsumption), 1);
    pvSelfConsumptionRate = estimatedAnnualPvYield > 0 ? round((directSelfConsumption / estimatedAnnualPvYield) * 100, 1) : null;
  }

  const thermal = workspace.solarThermal;
  let annualHotWaterDemand: number | null = null;
  let annualThermalYield: number | null = null;
  let thermalCoverage: number | null = null;
  let suggestedStorage: number | null = null;
  if (thermal.enabled) {
    if (!thermal.roofSurfaceId || !solarThermalSurface) addMessage(messages, "SOLAR_THERMAL_ROOF_REQUIRED", "blocking", "A napkollektorhoz kiválasztott tetősík szükséges.");
    if (!(thermal.collectorAreaSquareMeters > 0)) addMessage(messages, "SOLAR_THERMAL_AREA_REQUIRED", "blocking", "A napkollektor hasznos felületét meg kell adni.");
    if (!(thermal.persons > 0) || !(thermal.dailyHotWaterLitersPerPerson > 0)) addMessage(messages, "SOLAR_THERMAL_HOT_WATER_REQUIRED", "blocking", "A használók száma és a napi HMV-igény szükséges.");
    if (!(thermal.hotWaterTemperatureC > thermal.coldWaterTemperatureC)) addMessage(messages, "SOLAR_THERMAL_TEMPERATURE_INVALID", "blocking", "A HMV célhőmérséklete legyen magasabb a hidegvíz hőmérsékleténél.");
    if (!(thermal.specificYieldKwhPerSquareMeterYear > 0)) addMessage(messages, "SOLAR_THERMAL_SPECIFIC_YIELD_REQUIRED", "blocking", "A kollektor fajlagos éves hozamát dokumentált forrásból meg kell adni.");
    if (!thermal.sourceReference.trim()) addMessage(messages, "SOLAR_THERMAL_SOURCE_REQUIRED", "warning", "A napkollektoros előméretezés forráshivatkozása hiányzik.");
    if (thermal.persons > 0 && thermal.dailyHotWaterLitersPerPerson > 0 && thermal.hotWaterTemperatureC > thermal.coldWaterTemperatureC) {
      annualHotWaterDemand = round(thermal.persons * thermal.dailyHotWaterLitersPerPerson * 365 * 4.186 * (thermal.hotWaterTemperatureC - thermal.coldWaterTemperatureC) / 3600, 1);
    }
    if (thermal.collectorAreaSquareMeters > 0 && thermal.specificYieldKwhPerSquareMeterYear > 0) {
      const shading = solarThermalSurface?.shadingFactor ?? 1;
      annualThermalYield = round(thermal.collectorAreaSquareMeters * thermal.specificYieldKwhPerSquareMeterYear * (1 - thermal.systemLossPercent / 100) * shading, 1);
    }
    thermalCoverage = annualHotWaterDemand && annualThermalYield !== null ? round(Math.min(100, annualThermalYield / annualHotWaterDemand * 100), 1) : null;
    suggestedStorage = thermal.collectorAreaSquareMeters > 0 ? round(thermal.collectorAreaSquareMeters * thermal.storageLitersPerSquareMeter, 0) : null;
  }

  const battery = workspace.battery;
  const eveningDaily = annualBuildingAndEv > 0 ? round(annualBuildingAndEv * (1 - workspace.electricityProfile.daytimeConsumptionSharePercent / 100) / 365, 2) : null;
  const pvSurplusDaily = estimatedSurplus !== null ? round(estimatedSurplus / 365, 2) : null;
  const backupNeed = battery.enabled && battery.criticalLoadKw > 0 && battery.backupHours > 0
    ? round(battery.criticalLoadKw * battery.backupHours / battery.roundTripEfficiency, 2)
    : null;
  let suggestedUsable: number | null = null;
  let suggestedNominal: number | null = null;
  if (battery.enabled) {
    if (!pv.enabled && battery.purpose !== "backup") addMessage(messages, "BATTERY_PV_REQUIRED", "warning", "Sajátfogyasztás-növelési célhoz napelemes termelési adat szükséges.");
    if (!(battery.usableFraction > 0) || !(battery.roundTripEfficiency > 0)) addMessage(messages, "BATTERY_EFFICIENCY_INVALID", "blocking", "Az akkumulátor használható hányada és körfolyamati hatásfoka legyen pozitív.");
    if (!battery.sourceReference.trim()) addMessage(messages, "BATTERY_SOURCE_REQUIRED", "warning", "Az akkumulátor termék- vagy tervezési forráshivatkozása hiányzik.");
    const selfConsumptionTarget = eveningDaily !== null && pvSurplusDaily !== null ? Math.min(eveningDaily, pvSurplusDaily) : 0;
    const backupTarget = backupNeed || 0;
    suggestedUsable = round(battery.purpose === "selfConsumption" ? selfConsumptionTarget : battery.purpose === "backup" ? backupTarget : Math.max(selfConsumptionTarget, backupTarget), 2);
    suggestedNominal = battery.usableFraction > 0 ? round(suggestedUsable / battery.usableFraction, 2) : null;
    if (battery.usableCapacityKwh > battery.nominalCapacityKwh && battery.nominalCapacityKwh > 0) addMessage(messages, "BATTERY_USABLE_EXCEEDS_NOMINAL", "blocking", "A használható akkumulátorkapacitás nem lehet nagyobb a névleges kapacitásnál.");
    if (battery.maxDischargePowerKw > 0 && battery.criticalLoadKw > battery.maxDischargePowerKw) addMessage(messages, "BATTERY_BACKUP_POWER_INSUFFICIENT", "blocking", "A kritikus fogyasztók teljesítménye meghaladja az akkumulátor maximális kisütési teljesítményét.");
  }

  const pvCoverage = estimatedAnnualPvYield !== null && annualBuildingAndEv > 0 ? round(Math.min(100, estimatedAnnualPvYield / annualBuildingAndEv * 100), 1) : null;
  if (!workspace.roofSurfaces.length && (pv.enabled || thermal.enabled)) addMessage(messages, "ROOF_SURVEY_REQUIRED", "blocking", "A megújuló rendszerhez legalább egy helyszínen felmért tetősík szükséges.");
  workspace.roofSurfaces.forEach((surface) => {
    if (surface.usableAreaSquareMeters > surface.grossAreaSquareMeters) addMessage(messages, "ROOF_USABLE_EXCEEDS_GROSS", "blocking", `${surface.name}: a hasznos tetőfelület nem lehet nagyobb a bruttó felületnél.`, surface.id);
    if (!surface.sourceReference.trim()) addMessage(messages, "ROOF_SOURCE_REQUIRED", "warning", `${surface.name}: a tájolás, dőlés és felület forráshivatkozása hiányzik.`, surface.id);
    if (!surface.structuralAssessment.trim()) addMessage(messages, "ROOF_STRUCTURE_REQUIRED", "warning", `${surface.name}: a tetőszerkezet teherbírási ellenőrzési státusza hiányzik.`, surface.id);
  });

  return {
    schema: "dimpro.energy-renewable-sizing.v0.8.0",
    enabled: true,
    roof: { selectedSurfaceCount: selectedSurfaces.length, grossAreaSquareMeters: round(grossArea, 2), usableAreaSquareMeters: round(usableArea, 2) },
    pv: {
      maxPanelCount,
      selectedPanelCount: pv.panelCount,
      installedPowerKwp,
      inverterDcAcRatio,
      estimatedAnnualYieldKwh: estimatedAnnualPvYield,
      estimatedDirectSelfConsumptionKwh: directSelfConsumption,
      estimatedSurplusKwh: estimatedSurplus,
      estimatedSelfConsumptionRatePercent: pvSelfConsumptionRate,
    },
    solarThermal: {
      annualHotWaterDemandKwh: annualHotWaterDemand,
      estimatedAnnualYieldKwh: annualThermalYield,
      estimatedCoveragePercent: thermalCoverage,
      suggestedStorageVolumeLiters: suggestedStorage,
    },
    battery: {
      estimatedEveningDemandKwhPerDay: eveningDaily,
      estimatedPvSurplusKwhPerDay: pvSurplusDaily,
      backupUsableCapacityKwh: backupNeed,
      suggestedUsableCapacityKwh: suggestedUsable,
      suggestedNominalCapacityKwh: suggestedNominal,
      selectedNominalCapacityKwh: battery.nominalCapacityKwh,
      selectedUsableCapacityKwh: battery.usableCapacityKwh,
    },
    evCharging: {
      annualHomeChargingEnergyKwh: annualEvEnergy,
      averageDailyChargingEnergyKwh: dailyEvEnergy,
      averageDailyChargingHours: dailyChargingHours,
      chargerCurrentAmps: chargerCurrentAmps === null ? null : round(chargerCurrentAmps, 2),
      availableCurrentHeadroomAmps: availableHeadroomAmps,
      connectionSufficient,
    },
    totals: { annualBuildingAndEvElectricityKwh: annualBuildingAndEv, estimatedPvCoveragePercent: pvCoverage },
    validationMessages: messages,
    limitation: "Előzetes helyszíni méretezés. Nem helyettesít statikai, villamos, tűzvédelmi, hálózati csatlakozási, gyártói vagy kivitelezési tervet, illetve validált energetikai tanúsítási számítást.",
  };
}
