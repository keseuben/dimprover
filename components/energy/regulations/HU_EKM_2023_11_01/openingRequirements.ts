import type { EnergyOpeningRequirementType } from "@/components/energy/domain/energyOpeningTypes";

export type EnergyOpeningRequirementRule = {
  type: EnergyOpeningRequirementType;
  label: string;
  maximumUValueWm2K: number | null;
  minimumAreaExclusiveSquareMeters?: number;
  sourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS" | "USER-CUSTOM-REQUIREMENT";
};

export const huEkm20231101OpeningRequirements: Record<EnergyOpeningRequirementType, EnergyOpeningRequirementRule> = {
  glazing: { type: "glazing", label: "Üvegezés", maximumUValueWm2K: 1.0, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS" },
  specialGlazing: { type: "specialGlazing", label: "Különleges üvegezés", maximumUValueWm2K: 1.2, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS" },
  woodPvcFacadeGlazed: { type: "woodPvcFacadeGlazed", label: "Fa/PVC keretszerkezetű homlokzati üvegezett nyílászáró", maximumUValueWm2K: 1.1, minimumAreaExclusiveSquareMeters: 0.5, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS" },
  metalFacadeGlazed: { type: "metalFacadeGlazed", label: "Fém keretszerkezetű homlokzati üvegezett nyílászáró", maximumUValueWm2K: 1.4, minimumAreaExclusiveSquareMeters: 0.5, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS" },
  curtainWall: { type: "curtainWall", label: "Függönyfal", maximumUValueWm2K: 1.4, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS" },
  glassRoof: { type: "glassRoof", label: "Üvegtető", maximumUValueWm2K: 1.5, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS" },
  rooflight: { type: "rooflight", label: "Felülvilágító és füstelvezető kupola", maximumUValueWm2K: 1.7, minimumAreaExclusiveSquareMeters: 0.5, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS" },
  roofWindow: { type: "roofWindow", label: "Tetősík ablak", maximumUValueWm2K: 1.3, minimumAreaExclusiveSquareMeters: 0.5, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS" },
  industrialFireDoorGate: { type: "industrialFireDoorGate", label: "Ipari és tűzgátló ajtó és kapu", maximumUValueWm2K: 2.0, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS" },
  facadeDoor: { type: "facadeDoor", label: "Homlokzati vagy fűtött–fűtetlen ajtó", maximumUValueWm2K: 1.4, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS" },
  facadeGate: { type: "facadeGate", label: "Homlokzati vagy fűtött–fűtetlen kapu", maximumUValueWm2K: 1.8, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS" },
  custom: { type: "custom", label: "Egyedi követelmény", maximumUValueWm2K: null, sourceReferenceId: "USER-CUSTOM-REQUIREMENT" },
};
