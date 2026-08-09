import type { EnergyAssemblyRuleRequirement, EnergyAssemblyRequirementType } from "@/components/energy/domain/energyAssemblyTypes";

export const huEkm20231101AssemblyRequirements: Record<EnergyAssemblyRequirementType, EnergyAssemblyRuleRequirement> = {
  externalWall: { type: "externalWall", label: "Homlokzati fal", maximumUValueWm2K: 0.24, equivalentGroundValue: false, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1" },
  flatRoof: { type: "flatRoof", label: "Lapostető", maximumUValueWm2K: 0.17, equivalentGroundValue: false, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1" },
  heatedAtticBoundary: { type: "heatedAtticBoundary", label: "Fűtött tetőteret határoló szerkezet", maximumUValueWm2K: 0.17, equivalentGroundValue: false, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1" },
  atticFloor: { type: "atticFloor", label: "Padlás és búvótér alatti födém", maximumUValueWm2K: 0.17, equivalentGroundValue: false, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1" },
  arcadeFloor: { type: "arcadeFloor", label: "Árkád és áthajtó feletti födém", maximumUValueWm2K: 0.17, equivalentGroundValue: false, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1" },
  lowerFloorUnheated: { type: "lowerFloorUnheated", label: "Alsó zárófödém fűtetlen terek felett", maximumUValueWm2K: 0.26, equivalentGroundValue: false, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1" },
  wallToUnheated: { type: "wallToUnheated", label: "Fűtött és fűtetlen terek közötti fal", maximumUValueWm2K: 0.4, equivalentGroundValue: false, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1" },
  adjacentHeatedWall: { type: "adjacentHeatedWall", label: "Szomszédos fűtött épületek és épületrészek közötti fal", maximumUValueWm2K: 1.5, equivalentGroundValue: false, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1" },
  plinthWall: { type: "plinthWall", label: "Lábazati fal", maximumUValueWm2K: 0.3, equivalentGroundValue: false, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1" },
  groundWall: { type: "groundWall", label: "Talajjal érintkező fal – csak új épületnél", maximumUValueWm2K: 0.3, equivalentGroundValue: true, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1", note: "A követelmény a talaj hatását is tartalmazó egyenértékű hőátbocsátási tényezőre vonatkozik." },
  groundFloor: { type: "groundFloor", label: "Talajon fekvő padló – csak új épületnél", maximumUValueWm2K: 0.3, equivalentGroundValue: true, sourceReferenceId: "HU-EKM-9-2023-ANNEX-1", note: "A követelmény a talaj hatását is tartalmazó egyenértékű hőátbocsátási tényezőre vonatkozik." },
  custom: { type: "custom", label: "Egyedi összehasonlítás", maximumUValueWm2K: null, equivalentGroundValue: false, sourceReferenceId: "USER-CUSTOM-REQUIREMENT" },
};
