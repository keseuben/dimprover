import type { DevProject, DevVersion, DevWorkSession } from "./types";

export type DevPortfolioGroupId = "dimpro" | "dimprover" | "infrastructure" | "drive_drop" | "fajlmuhely" | "external" | "unassigned";

export type CoreDevProjectDefinition = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  status: DevProject["status"];
  accent: DevProject["accent"];
  startedAt: string;
  portfolioGroup: DevPortfolioGroupId;
  relationshipNote?: string;
};

export const CORE_DEV_PROJECT_DEFINITIONS: CoreDevProjectDefinition[] = [
  {
    id: "project_dimpro",
    name: "DIMPRO termékcsalád",
    slug: "dimpro-termekcsalad",
    category: "Digitális munkafolyamat-rendszerek",
    description: "A DIMPRO központi termékcsalád és a külön fejlesztett webes miniappok, számoló- és felmérőmodulok.",
    status: "active",
    accent: "cyan",
    startedAt: "2026-05-09T00:00:00.000Z",
    portfolioGroup: "dimpro",
  },
  {
    id: "project_dimprover",
    name: "DIMPROVER enterprise platform",
    slug: "dimprover-enterprise-platform",
    category: "Építőipari projektirányítási rendszer",
    description: "A teljes vállalati platform közös modulmotorokkal, projektirányítással, dokumentációval és terepi munkafolyamatokkal.",
    status: "active",
    accent: "blue",
    startedAt: "2026-05-09T00:00:00.000Z",
    portfolioGroup: "dimprover",
  },
  {
    id: "project_infrastructure",
    name: "DIMPRO Szerverüzemeltetés és Infrastruktúra",
    slug: "dimpro-szerveruzemeltetes-infrastruktura",
    category: "Szerverek, adatbázisok, mentés és üzemeltetés",
    description: "A DIMPRO és DIMPROVER szerverek, VPS-ek, adatbázisok, biztonsági mentések, helyreállítás, felügyelet, riasztások és üzemeltetési dokumentáció központi fejlesztési projektje.",
    status: "active",
    accent: "slate",
    startedAt: "2026-08-03T00:00:00.000Z",
    portfolioGroup: "infrastructure",
  },
  {
    id: "project_drive_drop",
    name: "DIMPRO Drive / DIMPRO Drop",
    slug: "dimpro-drive-drop",
    category: "Projektfájltár, szinkron és fájlátadás",
    description: "Tartós projektfájltár, asztali szinkron, ideiglenes fájlátadás, KépDrop és FájlDrop munkafolyamatok.",
    status: "active",
    accent: "lime",
    startedAt: "2026-06-17T00:00:00.000Z",
    portfolioGroup: "drive_drop",
  },
  {
    id: "project_fajlmuhely",
    name: "DIMPRO Fájlműhely",
    slug: "dimpro-fajlmuhely",
    category: "Asztali mérnöki szoftver",
    description: "Fájlrendezés, PDF-tervnéző, dokumentumcsomagok, mérnöki segédmodulok és Drive Desktop integráció.",
    status: "active",
    accent: "cyan",
    startedAt: "2026-06-24T00:00:00.000Z",
    portfolioGroup: "fajlmuhely",
    relationshipNote: "A DIMPRO Fájlműhely önálló asztali termék, ugyanakkor szorosan kapcsolódik a DIMPRO termékcsaládhoz és a DIMPRO Drive / Drop szolgáltatásokhoz.",
  },
];

const CORE_PROJECT_IDS = new Set(CORE_DEV_PROJECT_DEFINITIONS.map((project) => project.id));

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("hu-HU");
}

function versionSearchText(version: Pick<DevVersion, "moduleName" | "title" | "summary" | "version">) {
  return normalize([version.moduleName, version.title, version.summary, version.version].filter(Boolean).join(" "));
}

export function classifyDevVersionProjectId(version: Pick<DevVersion, "projectId" | "moduleName" | "title" | "summary" | "version">) {
  if (version.projectId === "project_fajlmuhely" || version.projectId === "project_hage" || version.projectId === "project_infrastructure") return version.projectId;

  const text = versionSearchText(version);
  if (
    text.includes("szerveruzemeltetes") ||
    text.includes("szerver uzemeltetes") ||
    text.includes("biztonsagi mentes") ||
    text.includes("offsite backup") ||
    text.includes("restic") ||
    text.includes("storage box") ||
    text.includes("backup watchdog") ||
    text.includes("postgresql mentes") ||
    text.includes("supabase backup") ||
    text.includes("smtp riasztas") ||
    text.includes("szerverfelugyelet") ||
    text.includes("helyreallitasi dokumentacio")
  ) return "project_infrastructure";
  if (/\b(drive|drop|kepdrop|fajldrop|photo ?drop)\b/.test(text)) return "project_drive_drop";

  if (
    text.includes("dimpro felmero") ||
    text.includes("ingatlanfelmero") ||
    text.includes("energetikai tervez") ||
    text.includes("energetikai anyag") ||
    text.includes("anyag- es termektor") ||
    text.includes("anyag es termektor") ||
    text.includes("felujitasi gyorskalkulator") ||
    text.includes("aruter") ||
    text.includes("gazdaseged") ||
    text.includes("esemenyszervezo") ||
    text.includes("koltsegadatbazis") ||
    text.includes("ajanlatkeszites")
  ) return "project_dimpro";

  if (version.projectId === "project_unassigned") return "project_unassigned";
  return "project_dimprover";
}

export function canonicalDevModuleName(version: Pick<DevVersion, "projectId" | "moduleName" | "title" | "summary" | "version">) {
  const projectId = classifyDevVersionProjectId(version);
  const text = versionSearchText(version);

  if (projectId === "project_infrastructure") {
    if (text.includes("mentes") || text.includes("backup") || text.includes("restic")) return "Biztonsági mentés és helyreállítás";
    if (text.includes("riasztas") || text.includes("watchdog") || text.includes("felugyelet")) return "Szerverfelügyelet és riasztás";
    if (text.includes("postgres") || text.includes("supabase") || text.includes("adatbazis")) return "Adatbázis-üzemeltetés";
    if (text.includes("nginx") || text.includes("pm2") || text.includes("systemd") || text.includes("tuzfal")) return "Szerverkonfiguráció és telepítés";
    return version.moduleName?.trim() || "Szerverüzemeltetés és infrastruktúra";
  }

  if (projectId === "project_fajlmuhely") {
    if (text.includes("drive")) return "DIMPRO Drive Desktop";
    if (text.includes("ertekezlet")) return "Értekezleti Kísérő";
    if (text.includes("koltsegvet")) return "Költségvetés Műhely";
    if (text.includes("pdf")) return "PDF Tervnéző és PDF Műhely";
    if (text.includes("mennyiseg")) return "Szakági Mennyiségmérő";
    return version.moduleName?.trim() || "DIMPRO Fájlműhely Core";
  }

  if (projectId === "project_drive_drop") {
    if (text.includes("drop")) return "DIMPRO Drop";
    if (text.includes("drive")) return "DIMPRO Drive";
    return "Drive / Drop közös szolgáltatások";
  }

  if (projectId === "project_dimpro") {
    if (text.includes("felmero") || text.includes("ingatlanfelmero") || text.includes("energetikai")) return "DIMPRO Felmérő";
    if (text.includes("anyag") || text.includes("termektor")) return "DIMPRO Anyag- és Terméktörzs";
    if (text.includes("felujitasi")) return "DIMPRO Felújítási Gyorskalkulátor";
    if (text.includes("aruter")) return "DIMPRO Árutér";
    if (text.includes("gazdaseged")) return "DIMPRO GazdaSegéd";
    if (text.includes("esemeny")) return "DIMPRO Eseményszervező";
    if (text.includes("koltseg")) return "DIMPRO Költségadatbázis";
    return version.moduleName?.trim() || "DIMPRO Core";
  }

  if (projectId === "project_dimprover") {
    if (text.includes("fejlesztesi") || text.includes("dev-center") || text.includes("licenckozpont") || text.includes("licenckezeles")) return "Fejlesztési és Licencközpont";
    if (text.includes("rendszerstruktura") || text.includes("szerverarchitektura") || text.includes("infra")) return "Rendszerstruktúra és infrastruktúra";
    if (text.includes("utem")) return "Ütemterv";
    if (text.includes("jegyzokonyv") || text.includes("hibajegy")) return "Jegyzőkönyvek és hibakezelés";
    if (text.includes("ertesites")) return "Értesítési Központ";
    if (text.includes("projektkapu")) return "Projektkapu";
    return version.moduleName?.trim() || "DIMPROVER Core";
  }

  return version.moduleName?.trim() || "Általános fejlesztés";
}

export function isCoreDevProject(projectId: string) {
  return CORE_PROJECT_IDS.has(projectId);
}

function dateMs(value?: string | null) {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function minDate(values: Array<string | null | undefined>, fallback: string) {
  const valid = values.filter(Boolean).map((value) => ({ value: value as string, time: dateMs(value) })).filter((item) => Number.isFinite(item.time));
  if (!valid.length) return fallback;
  valid.sort((left, right) => left.time - right.time);
  return valid[0].value;
}

function maxDate(values: Array<string | null | undefined>, fallback: string) {
  const valid = values.filter(Boolean).map((value) => ({ value: value as string, time: dateMs(value) })).filter((item) => Number.isFinite(item.time));
  if (!valid.length) return fallback;
  valid.sort((left, right) => right.time - left.time);
  return valid[0].value;
}

function sessionMinutes(session: DevWorkSession, now: number) {
  if (typeof session.durationMinutes === "number") return Math.max(0, session.durationMinutes);
  const start = dateMs(session.startedAt);
  const end = session.endedAt ? dateMs(session.endedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(1, Math.round((end - start) / 60_000));
}

export type DevPortfolioModule = {
  id: string;
  name: string;
  projectId: string;
  versionCount: number;
  latestVersion: string;
  latestTitle: string;
  latestSummary: string;
  latestStatus: DevVersion["status"];
  startedAt: string;
  lastActivityAt: string;
  timeMinutes: number;
};

export type DevPortfolioProject = {
  id: string;
  name: string;
  category: string;
  description: string;
  accent: DevProject["accent"];
  status: DevProject["status"];
  startedAt: string;
  lastActivityAt: string;
  versionCount: number;
  timeMinutes: number;
  modules: DevPortfolioModule[];
  relationshipNote?: string;
  isCore: boolean;
};

export function buildDevPortfolio(projects: DevProject[], versions: DevVersion[], workSessions: DevWorkSession[], now = Date.now()) {
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const effectiveVersions = versions.map((version) => ({ ...version, projectId: classifyDevVersionProjectId(version) }));
  const versionMap = new Map(effectiveVersions.map((version) => [version.id, version]));
  const effectiveSessions = workSessions.map((session) => {
    const version = versionMap.get(session.versionId);
    return { ...session, projectId: version?.projectId || session.projectId, moduleName: version ? canonicalDevModuleName(version) : session.moduleName };
  });

  const allProjectDefinitions: DevProject[] = CORE_DEV_PROJECT_DEFINITIONS.map((definition) => {
    const existing = projectMap.get(definition.id);
    return {
      id: definition.id,
      name: definition.name,
      slug: definition.slug,
      category: definition.category,
      description: definition.description,
      status: existing?.status || definition.status,
      accent: existing?.accent || definition.accent,
      startedAt: existing?.startedAt || definition.startedAt,
      createdAt: existing?.createdAt || definition.startedAt,
      updatedAt: existing?.updatedAt || definition.startedAt,
    };
  });

  const extraProjects = projects.filter((project) => !CORE_PROJECT_IDS.has(project.id));
  const projectDefinitions = [...allProjectDefinitions, ...extraProjects];

  const portfolio = projectDefinitions.map<DevPortfolioProject>((project) => {
    const projectVersions = effectiveVersions.filter((version) => version.projectId === project.id);
    const projectSessions = effectiveSessions.filter((session) => session.projectId === project.id);
    const moduleNames = [...new Set(projectVersions.map(canonicalDevModuleName))];
    const modules = moduleNames.map<DevPortfolioModule>((moduleName) => {
      const moduleVersions = projectVersions
        .filter((version) => canonicalDevModuleName(version) === moduleName)
        .sort((left, right) => dateMs(right.updatedAt) - dateMs(left.updatedAt));
      const latest = moduleVersions[0];
      const versionIds = new Set(moduleVersions.map((version) => version.id));
      const moduleSessions = projectSessions.filter((session) => versionIds.has(session.versionId));
      return {
        id: `${project.id}:${moduleName}`,
        name: moduleName,
        projectId: project.id,
        versionCount: moduleVersions.length,
        latestVersion: latest?.version || "—",
        latestTitle: latest?.title || "Nincs rögzített fejlesztési verzió.",
        latestSummary: latest?.summary || "Ehhez a modulhoz még nincs részletes fejlesztési leírás.",
        latestStatus: latest?.status || "planned",
        startedAt: minDate(moduleVersions.map((version) => version.startedAt), project.startedAt || project.createdAt),
        lastActivityAt: maxDate(moduleVersions.flatMap((version) => [version.completedAt, version.updatedAt]), project.updatedAt),
        timeMinutes: moduleSessions.reduce((total, session) => total + sessionMinutes(session, now), 0),
      };
    }).sort((left, right) => dateMs(right.lastActivityAt) - dateMs(left.lastActivityAt));

    const coreDefinition = CORE_DEV_PROJECT_DEFINITIONS.find((definition) => definition.id === project.id);
    return {
      id: project.id,
      name: project.name,
      category: project.category,
      description: project.description,
      accent: project.accent,
      status: project.status,
      startedAt: project.startedAt || minDate(projectVersions.map((version) => version.startedAt), project.createdAt),
      lastActivityAt: maxDate(projectVersions.flatMap((version) => [version.completedAt, version.updatedAt]), project.updatedAt),
      versionCount: projectVersions.length,
      timeMinutes: projectSessions.reduce((total, session) => total + sessionMinutes(session, now), 0),
      modules,
      relationshipNote: coreDefinition?.relationshipNote,
      isCore: CORE_PROJECT_IDS.has(project.id),
    };
  });

  return {
    coreProjects: CORE_DEV_PROJECT_DEFINITIONS.map((definition) => portfolio.find((project) => project.id === definition.id)).filter(Boolean) as DevPortfolioProject[],
    externalProjects: portfolio.filter((project) => !project.isCore && project.id !== "project_unassigned"),
    unassignedProject: portfolio.find((project) => project.id === "project_unassigned"),
  };
}
