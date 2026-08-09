export type EnergyFeatureFlags = {
  canUseEnergySurvey: boolean;
  canUseEnergySettings: boolean;
  canUseEnergyGeometry: boolean;
  canUseEnergyUValue: boolean;
  canUseEnergyOpenings: boolean;
  canUseEnergyThermalBridges: boolean;
  canUseEnergyDemand: boolean;
  canUseEnergySingleZone: boolean;
  canUseEnergyMultiZone: boolean;
  canUseEnergySystems: boolean;
  canUseEnergyFieldWorkflow: boolean;
  canUseEnergyExpertTables: boolean;
  canUseEnergyRenewables: boolean;
  canUseEnergySolarThermal: boolean;
  canUseEnergyBattery: boolean;
  canUseEnergyEvCharging: boolean;
  canUseEnergyVariants: boolean;
  canUseEnergyCertificateWorkspace: boolean;
  canUseEnergyWinWattExport: boolean;
};

export const propertySurveyEnergyFeatureFlags: EnergyFeatureFlags = {
  canUseEnergySurvey: true,
  canUseEnergySettings: true,
  canUseEnergyGeometry: true,
  canUseEnergyUValue: true,
  canUseEnergyOpenings: true,
  canUseEnergyThermalBridges: true,
  canUseEnergyDemand: true,
  canUseEnergySingleZone: true,
  canUseEnergyMultiZone: true,
  canUseEnergySystems: true,
  canUseEnergyFieldWorkflow: true,
  canUseEnergyExpertTables: true,
  canUseEnergyRenewables: true,
  canUseEnergySolarThermal: true,
  canUseEnergyBattery: true,
  canUseEnergyEvCharging: true,
  canUseEnergyVariants: true,
  canUseEnergyCertificateWorkspace: false,
  canUseEnergyWinWattExport: true,
};
