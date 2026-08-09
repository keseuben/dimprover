export type DimproModuleStatus = "available" | "mvp" | "planning" | "later";

export type DimproModule = {
  code: string;
  product: "DIMPRO" | "DIMPROVER";
  title: string;
  shortTitle: string;
  subtitle: string;
  description: string;
  icon: string;
  accent: string;
  status: DimproModuleStatus;
  appPath: string;
  marketingPath: string;
  shortHost?: string;
  requiredAccessCode?: string;
  enabledInSelector: boolean;
};

export const dimproModules: DimproModule[] = [
  {
    code: "MEETING_ASSISTANT",
    product: "DIMPRO",
    title: "DIMPRO Értekezleti Kísérő",
    shortTitle: "Értekezleti Kísérő",
    subtitle: "Teams oldalsó panel és értekezleti munkatér",
    description: "Teams jobb oldali panel, közös jegyzetek, feladatok, döntések, mellékletek és kézi AI-segédfunkciók.",
    icon: "◧",
    accent: "from-teal-300 to-emerald-400",
    status: "mvp",
    appPath: "/ertekezleti-kisero",
    marketingPath: "/ertekezleti-kisero",
    requiredAccessCode: "MEETING_ASSISTANT",
    enabledInSelector: true,
  },
  {
    code: "ARUTER",
    product: "DIMPRO",
    title: "DIMPRO Árutér",
    shortTitle: "Árutér",
    subtitle: "Külső árutérből a pénztárig",
    description: "Árufelvevő, pénztár, előkészítés és törzsvásárlói foglalás egy egyszerű, iparági modulban.",
    icon: "⌂",
    accent: "from-lime-300 to-teal-400",
    status: "available",
    appPath: "/aruter",
    marketingPath: "/aruter",
    shortHost: "aruter.dimpro.hu",
    requiredAccessCode: "ARUTER",
    enabledInSelector: true,
  },
  {
    code: "GAZDASEGED",
    product: "DIMPRO",
    title: "DIMPRO GazdaSegéd",
    shortTitle: "GazdaSegéd",
    subtitle: "Terepi adatgyűjtő gazdáknak",
    description: "Mobilközpontú terepi előrögzítő app napi munkákhoz, állattartáshoz, fotókhoz és exportokhoz.",
    icon: "♧",
    accent: "from-emerald-300 to-lime-500",
    status: "mvp",
    appPath: "/gazdaseged",
    marketingPath: "/gazdaseged",
    shortHost: "gazdaseged.dimpro.hu",
    requiredAccessCode: "GAZDASEGED",
    enabledInSelector: true,
  },
  {
    code: "MUNKALAP",
    product: "DIMPRO",
    title: "DIMPRO Munkalap",
    shortTitle: "Munkalap",
    subtitle: "Helyszíni munkalapok",
    description: "Szerelési, karbantartási és szervizmunkák papírmentes rögzítése.",
    icon: "▣",
    accent: "from-emerald-200 to-cyan-300",
    status: "planning",
    appPath: "/munkalap",
    marketingPath: "/munkalap",
    shortHost: "munkalap.dimpro.hu",
    requiredAccessCode: "MUNKALAP",
    enabledInSelector: false,
  },
  {
    code: "KEPBOX",
    product: "DIMPRO",
    title: "DIMPRO KépBOX",
    shortTitle: "KépBOX",
    subtitle: "Képfeltöltés és optimalizálás",
    description: "KépDrop, telefonos képfeltöltés, képméretezés, formátumváltás és későbbi képjelölés.",
    icon: "◒",
    accent: "from-teal-200 to-sky-300",
    status: "planning",
    appPath: "/kepbox",
    marketingPath: "/kepbox",
    shortHost: "kepbox.dimpro.hu",
    requiredAccessCode: "KEPBOX",
    enabledInSelector: false,
  },
  {
    code: "FELUJITASI_GYORSKALKULATOR",
    product: "DIMPRO",
    title: "DIMPRO Felújítási Gyorskalkulátor",
    shortTitle: "Felújítási Gyorskalkulátor",
    subtitle: "Becslésből költségkontroll",
    description: "Tájékoztató jellegű felújítási költségbecslés verziózással és későbbi költségkövetéssel.",
    icon: "⌁",
    accent: "from-orange-200 to-amber-400",
    status: "mvp",
    appPath: "/felujitasi-gyorskalkulator",
    marketingPath: "/felujitasi-gyorskalkulator",
    requiredAccessCode: "RENOVATION_CALCULATOR",
    enabledInSelector: true,
  },
  {
    code: "INGATLANFELMERO",
    product: "DIMPRO",
    title: "DIMPRO Ingatlanfelmérő",
    shortTitle: "Ingatlanfelmérő",
    subtitle: "Energetikai és műszaki helyszíni felmérés",
    description: "Tabletes alaprajzkészítés, LiDAR- és Bluetooth-lézer előkészítés, térképi tájolás, helyiségek, szerkezetek, gépészet és fotódokumentáció.",
    icon: "⌖",
    accent: "from-cyan-200 to-teal-400",
    status: "mvp",
    appPath: "/ingatlanfelmero",
    marketingPath: "/ingatlanfelmero",
    requiredAccessCode: "PROPERTY_SURVEY",
    enabledInSelector: true,
  },
  {
    code: "KOLTSEGADATBAZIS",
    product: "DIMPRO",
    title: "DIMPRO Költségadatbázis",
    shortTitle: "Költségadatbázis",
    subtitle: "Egységár és költségadatok",
    description: "Építőipari költségadatok, saját egységárak és kalkulációs háttértáblák kezelése.",
    icon: "▤",
    accent: "from-slate-300 to-emerald-300",
    status: "mvp",
    appPath: "/koltsegadatbazis",
    marketingPath: "/koltsegadatbazis",
    requiredAccessCode: "COST_DATABASE",
    enabledInSelector: true,
  },
];

export const dimproverModules: DimproModule[] = [
  {
    code: "DIMPROVER_WORKSPACE",
    product: "DIMPROVER",
    title: "DIMPROVER Munkafelület",
    shortTitle: "Munkafelület",
    subtitle: "Projektirányítási központ",
    description: "Digitális műszaki projektirányítási munkafelület ütemtervekkel, jegyzőkönyvekkel és dokumentumokkal.",
    icon: "⌬",
    accent: "from-blue-500 to-cyan-300",
    status: "available",
    appPath: "/dashboard",
    marketingPath: "/dimprover",
    requiredAccessCode: "DIMPROVER",
    enabledInSelector: true,
  },
  {
    code: "MINUTES",
    product: "DIMPROVER",
    title: "Jegyzőkönyvek",
    shortTitle: "Jegyzőkönyvek",
    subtitle: "Kooperáció, terepi hiba, állapot",
    description: "Jegyzőkönyv készítés, terepi hibafelvétel, fotómelléklet és PDF export.",
    icon: "▣",
    accent: "from-cyan-400 to-blue-500",
    status: "available",
    appPath: "/jegyzokonyvek",
    marketingPath: "/dimprover/jegyzokonyvek",
    requiredAccessCode: "MINUTES",
    enabledInSelector: true,
  },
  {
    code: "SCHEDULE",
    product: "DIMPROVER",
    title: "Ütemterv",
    shortTitle: "Ütemterv",
    subtitle: "Sávos építőipari ütemezés",
    description: "Projektütemterv, heti sávok, hierarchia, készültségi réteg és export előkészítés.",
    icon: "▤",
    accent: "from-blue-500 to-indigo-400",
    status: "available",
    appPath: "/utemezes",
    marketingPath: "/dimprover/utemezes",
    requiredAccessCode: "SCHEDULE",
    enabledInSelector: true,
  },
  {
    code: "DOCUMENTS",
    product: "DIMPROVER",
    title: "Dokumentumtár",
    shortTitle: "Dokumentumtár",
    subtitle: "Projekt dokumentumok",
    description: "Projekt dokumentumkezelés, tervtár, iktatás és későbbi Mappaőr kapcsolat.",
    icon: "◫",
    accent: "from-sky-400 to-cyan-300",
    status: "available",
    appPath: "/dokumentumok",
    marketingPath: "/dimprover/dokumentumtar",
    requiredAccessCode: "DOCUMENTS",
    enabledInSelector: true,
  },
];

export function getDimproModuleByHost(host: string) {
  const normalizedHost = host.toLowerCase().split(":")[0];
  return dimproModules.find((module) => module.shortHost === normalizedHost || `www.${module.shortHost}` === normalizedHost);
}

export function getDimproAppUrl(module: DimproModule, origin = "https://app.dimpro.hu") {
  return `${origin}${module.appPath}`;
}
