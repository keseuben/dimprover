import {
  BadgeCheck,
  BookOpenCheck,
  Download,
  FolderOpen,
  MessageCircleMore,
  Network,
  type LucideIcon,
} from "lucide-react";

export type D6ModuleId = "dock" | "drive" | "drop" | "dialog" | "decide" | "diary";

export type D6ModuleDefinition = {
  id: D6ModuleId;
  order: number;
  brandName: string;
  hungarianName: string;
  description: string;
  Icon: LucideIcon;
  tone: "teal" | "sage";
  state: "active" | "prepared" | "external-development";
};

export const DEFAULT_PROJECT_ID = "d6-irodaepulet";

export const D6_MODULES: D6ModuleDefinition[] = [
  {
    id: "dock",
    order: 1,
    brandName: "DOCK",
    hungarianName: "ProjektTér",
    description: "Központi projektáttekintés, feladatok, résztvevők és aktivitás.",
    Icon: Network,
    tone: "teal",
    state: "active",
  },
  {
    id: "drive",
    order: 2,
    brandName: "DRIVE",
    hungarianName: "Dokumentumtár",
    description: "Tartós projektfájltár, dokumentumverziók és hozzáférések.",
    Icon: FolderOpen,
    tone: "teal",
    state: "active",
  },
  {
    id: "drop",
    order: 3,
    brandName: "DROP",
    hungarianName: "Fájlkapu",
    description: "Meghívásos, időkorlátos külső fájlátadás és fájlfogadás.",
    Icon: Download,
    tone: "teal",
    state: "external-development",
  },
  {
    id: "dialog",
    order: 4,
    brandName: "DIALOG",
    hungarianName: "Egyeztetések",
    description: "Témakártyák, szakági kérdések, hozzászólások és kooperációs pontok.",
    Icon: MessageCircleMore,
    tone: "teal",
    state: "active",
  },
  {
    id: "decide",
    order: 5,
    brandName: "DECIDE",
    hungarianName: "Jóváhagyások",
    description: "Auditálható döntések, terv- és termékkiváltási jóváhagyások.",
    Icon: BadgeCheck,
    tone: "sage",
    state: "active",
  },
  {
    id: "diary",
    order: 6,
    brandName: "DIARY",
    hungarianName: "Projektnapló",
    description: "Projekt- és kivitelezési események, naplóworkflow és ellenőrzési kérelmek.",
    Icon: BookOpenCheck,
    tone: "sage",
    state: "active",
  },
];

export function getD6Module(moduleId?: string | null) {
  return D6_MODULES.find((module) => module.id === moduleId) ?? D6_MODULES[0];
}

export function projectGateModuleHref(projectId: string, moduleId: D6ModuleId) {
  return `/projektkapu/project/${encodeURIComponent(projectId)}/${moduleId}`;
}
