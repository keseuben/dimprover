import type { EnergyAirGapResistanceRow, EnergyAssemblyRuleData, EnergyHeatFlowDirection, EnergySurfaceResistanceRule } from "@/components/energy/domain/energyAssemblyTypes";
import { huEkm20231101AssemblyRequirements } from "@/components/energy/regulations/HU_EKM_2023_11_01/requirements";

export const huEkm20231101SurfaceResistance: Record<EnergyHeatFlowDirection, EnergySurfaceResistanceRule> = {
  upward: { direction: "upward", rsiM2KPerW: 0.1, rseM2KPerW: 0.04 },
  horizontal: { direction: "horizontal", rsiM2KPerW: 0.13, rseM2KPerW: 0.04 },
  downward: { direction: "downward", rsiM2KPerW: 0.17, rseM2KPerW: 0.04 },
};

export const huEkm20231101ClosedAirGapResistanceRows: EnergyAirGapResistanceRow[] = [
  { thicknessMm: 0, upwardM2KPerW: 0, horizontalM2KPerW: 0, downwardM2KPerW: 0 },
  { thicknessMm: 5, upwardM2KPerW: 0.11, horizontalM2KPerW: 0.11, downwardM2KPerW: 0.11 },
  { thicknessMm: 7, upwardM2KPerW: 0.13, horizontalM2KPerW: 0.13, downwardM2KPerW: 0.13 },
  { thicknessMm: 10, upwardM2KPerW: 0.15, horizontalM2KPerW: 0.15, downwardM2KPerW: 0.15 },
  { thicknessMm: 15, upwardM2KPerW: 0.16, horizontalM2KPerW: 0.17, downwardM2KPerW: 0.17 },
  { thicknessMm: 25, upwardM2KPerW: 0.16, horizontalM2KPerW: 0.18, downwardM2KPerW: 0.19 },
  { thicknessMm: 50, upwardM2KPerW: 0.16, horizontalM2KPerW: 0.18, downwardM2KPerW: 0.21 },
  { thicknessMm: 100, upwardM2KPerW: 0.16, horizontalM2KPerW: 0.18, downwardM2KPerW: 0.22 },
  { thicknessMm: 300, upwardM2KPerW: 0.16, horizontalM2KPerW: 0.18, downwardM2KPerW: 0.23 },
];

export const huEkm20231101AssemblyRuleData: EnergyAssemblyRuleData = {
  sourceReferenceId: "HU-EM-CALCULATION-METHOD-APPENDIX-1",
  checkedAt: "2026-07-29",
  surfaceResistance: huEkm20231101SurfaceResistance,
  closedAirGapResistanceRows: huEkm20231101ClosedAirGapResistanceRows,
  requirements: huEkm20231101AssemblyRequirements,
};
