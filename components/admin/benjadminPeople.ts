export type BenjadminPersonCode = "BENJADMIN" | "BENAI" | "ARMINAI" | "JAZMINAI" | "OUTMINAI" | "MFORGE" | "VGUARD";

export type BenjadminPersonProfile = {
  code: BenjadminPersonCode;
  name: string;
  personalName?: string;
  title: string;
  category: string;
  image: string;
  shortDescription: string;
  detailedDescription: string;
  responsibilities: string[];
};

export const BENJADMIN_PEOPLE: Record<BenjadminPersonCode, BenjadminPersonProfile> = {
  BENJADMIN: {
    code: "BENJADMIN",
    name: "BenjAdmin",
    title: "Rendszergazda · fejlesztési vezető · rendszertulajdonos",
    category: "Emberi főirányító",
    image: "/benjadmin/team/01_BenjAdmin.webp",
    shortDescription: "A DIMPRO BENJADMIN fejlesztési és üzemeltetési rendszer végső emberi döntéshozója.",
    detailedDescription: "Meghatározza a fejlesztési prioritásokat, jóváhagyja a műszaki irányokat és az érzékeny műveleteket. A PROD környezetet érintő módosításokhoz kizárólag az ő explicit engedélye adhat felhatalmazást. A csapat és az AI workerek működését termék- és műszaki nyelven vezérli.",
    responsibilities: ["Fejlesztési prioritások és végső döntések", "BENJADMIN Gate és érzékeny műveletek jóváhagyása", "PROD módosítások explicit engedélyezése"],
  },
  BENAI: {
    code: "BENAI",
    name: "Ben-AI",
    title: "Fejlesztésirányító AI · koordinátor",
    category: "AI koordináció",
    image: "/benjadmin/team/02_BenAI.webp",
    shortDescription: "A BENJADMIN fejlesztési feladatainak központi AI koordinátora.",
    detailedDescription: "A BenjAdmin terméknyelvű utasításait technikai fejlesztési feladatokká bontja, automatikus scope-ot készít, workert választ, figyeli a task/session/worktree/scope-lock láncot, és összefogja az acceptance, build, review és dokumentációs kapukat. Nem helyettesíti az emberi végső döntést.",
    responsibilities: ["Feladatbontás és worker-kiosztás", "Scope, worktree és fejlesztési sorrend koordináció", "Acceptance, build és quality gate összefogása"],
  },
  ARMINAI: {
    code: "ARMINAI",
    name: "Ármin-AI",
    title: "Belső kódmérnök · frontend / alkalmazás",
    category: "Belső kódmérnök",
    image: "/benjadmin/team/03_ArminAI.webp",
    shortDescription: "Frontend, alkalmazáslogika és reszponzív felületek elsődleges belső kódmérnöke.",
    detailedDescription: "A DIMPRO és DIMPROVER felhasználói felületeinek, komponenseinek és kliensoldali alkalmazáslogikájának fejlesztésére specializált belső kódmérnök. Munkája izolált DEV task/session/worktree és scope-lock keretben történik, kötelező teszt- és acceptance ellenőrzéssel.",
    responsibilities: ["Frontend és komponensfejlesztés", "Reszponzív UI és alkalmazáslogika", "Frontend teszt és browser acceptance"],
  },
  JAZMINAI: {
    code: "JAZMINAI",
    name: "Jázmin-AI",
    title: "Belső kódmérnök · backend / adatbázis",
    category: "Belső kódmérnök",
    image: "/benjadmin/team/04_JazminAI.webp",
    shortDescription: "Backend, API, adatmodell és tesztelés elsődleges belső kódmérnöke.",
    detailedDescription: "A szerveroldali logika, API-k, adatmodellek, migrációs tervek, integrációk és backend tesztek fejlesztésére fókuszál. Adatbázis- és biztonságérzékeny változtatásai a BENJADMIN szabályai szerint külön preflight és acceptance kapukon mennek át.",
    responsibilities: ["Backend és API implementáció", "Adatmodell és migrációs fejlesztés", "Backend teszt, regresszió és adatbiztonság"],
  },
  OUTMINAI: {
    code: "OUTMINAI",
    name: "Outmin-AI",
    title: "Külső kódmérnök · partner fejlesztési sík",
    category: "Partner kódmérnök",
    image: "/benjadmin/team/05_OutminAI.webp",
    shortDescription: "Partner- és külső termékek izolált fejlesztési síkjának kódmérnöke.",
    detailedDescription: "Kizárólag a Partner Development Plane kijelölt projektjein dolgozhat. Saját repository/worktree/secret/storage izolációt kap, a belső DIMPRO írás és a PROD hozzáférés alapértelmezetten tiltott. A partnerfejlesztések átadását auditált handoff folyamat zárja.",
    responsibilities: ["Partner- és külső projektek fejlesztése", "Elkülönített partner worktree és scope", "Belső DIMPRO/PROD hozzáférés: DEFAULT DENY"],
  },
  MFORGE: {
    code: "MFORGE",
    name: "M.Forge-AI",
    personalName: "Márk",
    title: "Coding Worker · külső AI fejlesztő",
    category: "Külső AI worker",
    image: "/benjadmin/team/06_M_ForgeAI.webp",
    shortDescription: "Kontrollált DEV kódolási feladatokat végrehajtó külső AI worker.",
    detailedDescription: "A BENJADMIN által automatikusan meghatározott GREEN scope-on belül frontend, backend, API, refaktor és jól körülhatárolt implementációs feladatokat végezhet. Saját JIT DEV worktree-t és scope lockot kap. Eredménye nem integrálódik automatikusan: először V.Guard-AI független review-ja, majd a BENJADMIN Gate következik.",
    responsibilities: ["Kontrollált DEV implementáció és refaktor", "Csak saját JIT worktree + engedélyezett GREEN scope", "Eredmény átadása V.Guard-AI független review-jára"],
  },
  VGUARD: {
    code: "VGUARD",
    name: "V.Guard-AI",
    personalName: "Viktória",
    title: "Review & Quality Worker · külső AI ellenőr",
    category: "Külső AI worker",
    image: "/benjadmin/team/07_V_GuardAI.webp",
    shortDescription: "M.Forge-AI munkáját függetlenül ellenőrző, egyenrangú quality worker.",
    detailedDescription: "Önálló, M.Forge-AI-tól független review szerepkör. Kódot jelenleg nem ír: commit/diff/test artifact alapján security, regresszió, scope, kódminőség és tesztelhetőség szempontjából ellenőriz. Eredménye PASS, PASS WITH NOTES vagy FAIL lehet. Közvetlen PROD- és integrációs joga nincs.",
    responsibilities: ["Független code review és security ellenőrzés", "Regresszió- és teszteredmény-ellenőrzés", "PASS / PASS WITH NOTES / FAIL minőségi döntés"],
  },
};

export function getBenjadminPerson(code: BenjadminPersonCode) {
  return BENJADMIN_PEOPLE[code];
}
