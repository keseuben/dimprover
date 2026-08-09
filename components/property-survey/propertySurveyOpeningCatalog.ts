import type { SurveyPlanOpeningKind, SurveyPlanOpeningSuggestion } from "@/components/property-survey/propertySurveyPlanDocumentTypes";

export type SurveyOpeningCatalogProfile = {
  id: string;
  name: string;
  kinds: SurveyPlanOpeningKind[];
  frame: string;
  glazing: string;
  declaredUwWm2K: number | null;
  solarGValue: number | null;
  shading: string;
  installationPsiWmK: number | null;
  sourceReference: string;
  note: string;
};

const templateSource = "DIMPRO katalógussablon – a végleges energetikai számításhoz gyártói teljesítménynyilatkozattal vagy termékadatlappal ellenőrizendő";

export const surveyOpeningCatalogProfiles: SurveyOpeningCatalogProfile[] = [
  {
    id: "custom",
    name: "Egyedi / kézi adatok",
    kinds: ["window", "door", "balconyDoor", "garageDoor", "unknown"],
    frame: "",
    glazing: "",
    declaredUwWm2K: null,
    solarGValue: null,
    shading: "Nincs megadva",
    installationPsiWmK: null,
    sourceReference: "",
    note: "A felhasználó saját gyártói vagy helyszíni adatokat ad meg.",
  },
  {
    id: "pvc-triple-template",
    name: "PVC, 3 rétegű üveg – ellenőrzendő minta",
    kinds: ["window", "balconyDoor"],
    frame: "PVC / műanyag",
    glazing: "3 rétegű hőszigetelő üveg",
    declaredUwWm2K: 1.1,
    solarGValue: 0.5,
    shading: "Nincs",
    installationPsiWmK: 0.04,
    sourceReference: templateSource,
    note: "Nem gyártóspecifikus érték; a termék kiválasztása után cserélendő vagy igazolandó.",
  },
  {
    id: "wood-triple-template",
    name: "Fa, 3 rétegű üveg – ellenőrzendő minta",
    kinds: ["window", "balconyDoor"],
    frame: "Fa",
    glazing: "3 rétegű hőszigetelő üveg",
    declaredUwWm2K: 1.2,
    solarGValue: 0.5,
    shading: "Nincs",
    installationPsiWmK: 0.04,
    sourceReference: templateSource,
    note: "Nem gyártóspecifikus érték; a termék kiválasztása után cserélendő vagy igazolandó.",
  },
  {
    id: "aluminium-triple-template",
    name: "Hőhídmegszakított alumínium – ellenőrzendő minta",
    kinds: ["window", "balconyDoor"],
    frame: "Hőhídmegszakított alumínium",
    glazing: "3 rétegű hőszigetelő üveg",
    declaredUwWm2K: 1.5,
    solarGValue: 0.48,
    shading: "Nincs",
    installationPsiWmK: 0.05,
    sourceReference: templateSource,
    note: "Nem gyártóspecifikus érték; a termék kiválasztása után cserélendő vagy igazolandó.",
  },
  {
    id: "facade-door-template",
    name: "Hőszigetelt homlokzati ajtó – ellenőrzendő minta",
    kinds: ["door"],
    frame: "Hőszigetelt ajtószerkezet",
    glazing: "Tömör vagy részben üvegezett kitöltés",
    declaredUwWm2K: 1.4,
    solarGValue: null,
    shading: "Nem alkalmazandó",
    installationPsiWmK: 0.05,
    sourceReference: templateSource,
    note: "Nem gyártóspecifikus érték; a termék kiválasztása után cserélendő vagy igazolandó.",
  },
  {
    id: "garage-gate-template",
    name: "Hőszigetelt garázskapu – ellenőrzendő minta",
    kinds: ["garageDoor"],
    frame: "Szekcionált kapuszerkezet",
    glazing: "Hőszigetelt panel",
    declaredUwWm2K: 1.8,
    solarGValue: null,
    shading: "Nem alkalmazandó",
    installationPsiWmK: 0.06,
    sourceReference: templateSource,
    note: "Nem gyártóspecifikus érték; a termék kiválasztása után cserélendő vagy igazolandó.",
  },
];

export function getSurveyOpeningCatalogProfile(profileId: string | null | undefined) {
  return surveyOpeningCatalogProfiles.find((profile) => profile.id === profileId) || surveyOpeningCatalogProfiles[0];
}

export function getSurveyOpeningCatalogProfilesForKind(kind: SurveyPlanOpeningKind) {
  return surveyOpeningCatalogProfiles.filter((profile) => profile.id === "custom" || profile.kinds.includes(kind));
}

export function applySurveyOpeningCatalogProfile(opening: SurveyPlanOpeningSuggestion, profileId: string): Partial<SurveyPlanOpeningSuggestion> {
  const profile = getSurveyOpeningCatalogProfile(profileId);
  if (profile.id === "custom") return { catalogProfileId: "custom", sourceReference: opening.sourceReference || "" };
  return {
    catalogProfileId: profile.id,
    frame: profile.frame,
    glazing: profile.glazing,
    uValueWm2K: profile.declaredUwWm2K == null ? "" : profile.declaredUwWm2K.toFixed(2),
    solarGValue: profile.solarGValue == null ? "" : profile.solarGValue.toFixed(2),
    shading: profile.shading,
    installationPsiWmK: profile.installationPsiWmK == null ? "" : profile.installationPsiWmK.toFixed(3),
    installationPsiSourceReference: profile.sourceReference,
    sourceReference: profile.sourceReference,
    thermalBridgeMode: profile.installationPsiWmK == null ? "none" : "installationPerimeter",
    source: "userCorrected",
    sourceDetails: `${opening.sourceDetails} Katalógussablon: ${profile.name}. ${profile.note}`.trim(),
    userModified: true,
  };
}
