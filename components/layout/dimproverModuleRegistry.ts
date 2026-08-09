import {
  BriefcaseBusiness,
  Building2,
  HardHat,
  Lock,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type DimproverModuleTone = "green" | "blue" | "orange" | "teal" | "violet" | "slate";
export type DimproverModuleState = "active" | "available" | "locked" | "soon";

export type DimproverModuleItem = {
  id: string;
  title: string;
  label: string;
  href: string;
  description: string;
  bullets: string[];
  Icon: LucideIcon;
  tone: DimproverModuleTone;
  state: DimproverModuleState;
  featureFlag: string;
  pathPrefixes: string[];
};

export const dimproverModuleRegistry: DimproverModuleItem[] = [
  {
    id: "workspace",
    title: "Munkatér",
    label: "Céges munkatér",
    href: "/dashboard",
    description: "Napi működés, belső dokumentumok, linkek és irodai feladatok.",
    bullets: ["Feladatkezelés", "Belső dokumentumok", "Naptár és határidők"],
    Icon: BriefcaseBusiness,
    tone: "green",
    state: "available",
    featureFlag: "module.workspace",
    pathPrefixes: ["/", "/dashboard", "/dokumentumok", "/naptar", "/drive"],
  },
  {
    id: "projektkapu",
    title: "Projektkapu",
    label: "DIMPRO Projektkapu – D6 Core",
    href: "/projektkapu",
    description: "Egyprojektes projektplatform hat összekapcsolt modullal, közös projekt- és jogosultsági magon.",
    bullets: ["DOCK – ProjektTér", "DRIVE / DROP – fájlfolyamatok", "DIALOG / DECIDE / DIARY"],
    Icon: Building2,
    tone: "blue",
    state: "available",
    featureFlag: "module.projectgate",
    pathPrefixes: ["/projektkapu", "/projektek", "/utemezes", "/projektiktato", "/penzugyi-iktato", "/ajanlatkeszites", "/partnerek"],
  },
  {
    id: "epiteshely",
    title: "Építéshely",
    label: "Terepi munkatér",
    href: "/epiteshely",
    description: "Kivitelezési folyamatok, terepi rögzítés, hibajegyzék és e-napló előkészítés.",
    bullets: ["Hibajegyzék", "Terepi állapotrögzítés", "Fotók és jelentések"],
    Icon: HardHat,
    tone: "orange",
    state: "active",
    featureFlag: "module.fieldsite",
    pathPrefixes: ["/epiteshely", "/jegyzokonyvek", "/enaplo"],
  },
  {
    id: "vallalkozoi-muhely",
    title: "Vállalkozói Műhely",
    label: "Kivitelezői szervezés",
    href: "/vallalkozoi-muhely",
    description: "Brigádok, munkalapok, anyag- és eszközkezelés kivitelező cégeknek.",
    bullets: ["Brigádok és munkalapok", "Anyag- és eszköznyilvántartás", "Teljesítés és elszámolás"],
    Icon: Wrench,
    tone: "teal",
    state: "available",
    featureFlag: "module.contractor-workshop",
    pathPrefixes: ["/vallalkozoi-muhely", "/munkaero"],
  },
  {
    id: "uzemeltetes",
    title: "Üzemeltetés",
    label: "Átadás utáni életciklus",
    href: "/uzemeltetes",
    description: "Garancia, karbantartás, hibabejelentések és létesítménykövetés.",
    bullets: ["Karbantartási tervek", "Hibabejelentések", "Létesítmény nyilvántartás"],
    Icon: ShieldCheck,
    tone: "violet",
    state: "soon",
    featureFlag: "module.operations",
    pathPrefixes: ["/uzemeltetes"],
  },
  {
    id: "admin",
    title: "Admin",
    label: "Rendszerbeállítás",
    href: "/admin",
    description: "Felhasználók, szerepkörök, csomagok, licencelés és sablonok kezelése.",
    bullets: ["Felhasználók és szerepkörök", "Csomagok és licencelés", "Sablonok és rendszeradatok"],
    Icon: Lock,
    tone: "slate",
    state: "available",
    featureFlag: "module.admin",
    pathPrefixes: ["/admin", "/adminlog", "/beallitasok", "/account", "/releases"],
  },
];

function isPathMatch(pathname: string, prefix: string) {
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getDimproverModuleByPathname(pathname?: string | null) {
  const safePathname = pathname || "/dashboard";
  return (
    dimproverModuleRegistry.find((module) => module.pathPrefixes.some((prefix) => isPathMatch(safePathname, prefix))) ??
    dimproverModuleRegistry[0]
  );
}
