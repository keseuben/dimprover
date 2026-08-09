export type StructureStatus = "active" | "in_development" | "planned" | "transition";

export type StructureItem = {
  name: string;
  description: string;
  status: StructureStatus;
};

export type StructureSection = {
  title: string;
  note?: string;
  items: StructureItem[];
};

export type ProductGroup = {
  id: string;
  title: string;
  shortName: string;
  role: string;
  description: string;
  status: StructureStatus;
  domains: string[];
  sections: StructureSection[];
};

export type ServerNode = {
  id: string;
  title: string;
  environment: string;
  status: StructureStatus;
  hostname: string;
  operatingSystem: string;
  size: string;
  purpose: string;
  responsibilities: string[];
  restrictions: string[];
};

export const structureUpdatedAt = "2026. augusztus 1.";

export const statusMeta: Record<StructureStatus, { label: string; className: string }> = {
  active: {
    label: "Működő / aktív",
    className: "structure-status-badge structure-status-badge--active",
  },
  in_development: {
    label: "Fejlesztés alatt",
    className: "structure-status-badge structure-status-badge--development",
  },
  planned: {
    label: "Tervezett",
    className: "structure-status-badge structure-status-badge--planned",
  },
  transition: {
    label: "Átmeneti állapot",
    className: "structure-status-badge structure-status-badge--transition",
  },
};

export const serverNodes: ServerNode[] = [
  {
    id: "prod",
    title: "DIMPRO PROD VPS",
    environment: "Éles működés",
    status: "active",
    hostname: "app.dimpro.hu / projektkapu.dimpro.hu / drop.dimpro.hu / license.dimpro.hu",
    operatingSystem: "Ubuntu 24.04 LTS",
    size: "Jelenlegi Prémium Medium VPS · 4 GB RAM · kb. 80 GB SSD",
    purpose: "A felhasználók által elért éles DIMPRO és DIMPROVER szolgáltatások stabil futtatása.",
    responsibilities: [
      "Next.js éles webalkalmazások és API-k",
      "Nginx, TLS és domain routing",
      "PM2 éles folyamatok",
      "licencadmin, Fejlesztési Központ és release felületek",
      "DIMPRO Drop jelenlegi biztonságos UI shell",
      "DIMPRO Projektkapu – D6 Core jelenlegi egyprojektes UI shell",
    ],
    restrictions: [
      "Normál fejlesztési buildet nem itt kell futtatni az új DEV VPS elkészülte után.",
      "Éles módosítás csak DEV teszt, backup, release és smoke ellenőrzés után történhet.",
    ],
  },
  {
    id: "dev",
    title: "DIMPRO DEV VPS",
    environment: "Fejlesztés és staging",
    status: "planned",
    hostname: "dev.dimpro.hu",
    operatingSystem: "Ubuntu 24.04 LTS",
    size: "Igényelt Prémium Large VPS · 4 vCore · 8 GB RAM · 120 GB SSD",
    purpose: "Közös fejlesztői környezet a DIMPRO, DIMPROVER és további saját vagy ügyfél-SaaS rendszerek számára.",
    responsibilities: [
      "kódolás, build, lint, TypeScript és automatikus tesztek",
      "staging felületek és tesztadatok",
      "külön projektmappák, repository-k, portok és környezeti változók",
      "DEV PostgreSQL adatbázisok és háttérworkerek",
      "új ügyfélappok fejlesztése külön DEV szerver bérlése nélkül",
    ],
    restrictions: [
      "Nem tárolhat éles ügyféladatot kontrollálatlanul.",
      "Minden projekt saját adatbázist, felhasználót, env fájlt és fájlteret kap.",
    ],
  },
  {
    id: "database",
    title: "DIMPRO DATABASE VPS",
    environment: "Központi éles adatbázis",
    status: "planned",
    hostname: "db.dimpro.hu",
    operatingSystem: "Ubuntu 24.04 LTS",
    size: "Igényelt Prémium Medium VPS · 2 vCore · 4 GB RAM · 80 GB SSD",
    purpose: "Különálló PostgreSQL-adatbázis a DIMPRO/DIMPROVER éles üzleti és rendszeradataihoz.",
    responsibilities: [
      "PostgreSQL és connection pooling",
      "DIMPRO Drop, Drive, projektek, jogosultságok és értesítések adatbázisai",
      "külön adatbázisok és adatbázis-felhasználók az egyes termékekhez",
      "napi automatikus mentés, külső backup és visszaállítási próba",
      "audit, lassú lekérdezések és kapacitásfigyelés",
    ],
    restrictions: [
      "A PostgreSQL port nem lehet általánosan nyitott az internet felé.",
      "Csak a PROD VPS, a DEV VPS és szabályozott admincsatorna csatlakozhat.",
      "PDF, kép és ZIP fájl nem kerül közvetlenül az adatbázisba.",
    ],
  },
  {
    id: "storage",
    title: "DIMPRO OBJECT STORAGE",
    environment: "Tartós és ideiglenes fájltár",
    status: "planned",
    hostname: "S3-kompatibilis privát tárhely",
    operatingSystem: "Szolgáltatott objektumtár",
    size: "Igény szerint bővíthető",
    purpose: "A Drive és Drop tényleges PDF-, kép-, dokumentum- és ZIP-fájljainak tárolása.",
    responsibilities: [
      "privát bucketek és projekt/csomag alapú objektumkulcsok",
      "rövid idejű signed upload és download jogosultság",
      "verziózás, életciklus-kezelés és ideiglenes Drop-törlés",
      "backup- és archív réteg előkészítése",
    ],
    restrictions: [
      "A böngésző nem kap hosszú életű tárhelykulcsot.",
      "A VPS csak átmeneti feldolgozási cache-t használhat.",
    ],
  },
  {
    id: "supabase",
    title: "SUPABASE ÁTMENETI RÉTEG",
    environment: "Jelenlegi szolgáltatás",
    status: "transition",
    hostname: "Meglévő Supabase projekt",
    operatingSystem: "Menedzselt PostgreSQL és kapcsolódó szolgáltatások",
    size: "Jelenlegi előfizetés szerint",
    purpose: "A már működő belépési és modulkapcsolatok megtartása a saját PostgreSQL-re történő ellenőrzött átállásig.",
    responsibilities: [
      "meglévő auth- és adatkapcsolatok változatlan működtetése",
      "adatkiexport és migrációs forrás",
      "párhuzamos próbaüzem az átállás alatt",
    ],
    restrictions: [
      "Nem mondható le az új adatbázis felépítése és ellenőrzött migráció előtt.",
      "A végleges megszüntetés csak visszaállítási lehetőséggel és többnapos próbaüzem után dönthető el.",
    ],
  },
];

export const productGroups: ProductGroup[] = [
  {
    id: "dimpro-core",
    title: "DIMPRO központi mag",
    shortName: "DIMPRO",
    role: "Központi termék-, fiók- és előfizetési rendszer",
    description: "A DIMPRO a teljes termékcsalád ernyőmárkája és központi belépési pontja. Itt mutatjuk be a termékeket, itt kezeljük a fiókot, az előfizetést, a licenceket és a közös szolgáltatásokat.",
    status: "in_development",
    domains: ["dimpro.hu", "app.dimpro.hu", "projektkapu.dimpro.hu", "license.dimpro.hu"],
    sections: [
      {
        title: "Központi mag és közös szolgáltatások",
        items: [
          { name: "Termékcsalád és előfizetési központ", description: "DIMPRO, DIMPRO Drive/Drop és DIMPROVER bemutatása, csomag- és előfizetésválasztás.", status: "planned" },
          { name: "DIMPRO Account", description: "Közös felhasználói fiók, belépés, profil, termék- és moduljogosultságok.", status: "in_development" },
          { name: "Licencmotor és Licencadmin", description: "Asztali és webes terméklicencek, gépaktiválás, lejárat és moduljogosultság.", status: "active" },
          { name: "Szervezetek és felhasználók", description: "Cégek, csapatok, szerepkörök, meghívások és projektszintű hozzáférések.", status: "planned" },
          { name: "Központi projektjegyzék", description: "Az alkalmazások, Drive, Drop és DIMPROVER közös projektazonosítói.", status: "planned" },
          { name: "Értesítési és e-mail motor", description: "Webes, desktopos, push- és e-mail értesítések közös szerveroldali állapottal.", status: "in_development" },
          { name: "Számlázás és előfizetés", description: "Csomagok, számlázási események, fizetési státusz és jogosultságfrissítés.", status: "planned" },
          { name: "Fejlesztési Központ", description: "Verziók, ráfordított idő, release, szerverállapot, napló és rendszerstruktúra.", status: "active" },
          { name: "Feature flag és csomagmotor", description: "Basic, Pro, Enterprise és AI funkciók közös kapcsolása.", status: "in_development" },
          { name: "Audit és ügyféltámogatás", description: "Belépések, rendszeresemények, támogatási kapcsolatok és biztonsági nyomvonal.", status: "in_development" },
        ],
      },
      {
        title: "DIMPRO alkalmazások és miniappok",
        note: "Az alkalmazások a közös DIMPRO fiókot, licencet, értesítést és később projektmagot használják.",
        items: [
          { name: "DIMPRO Felmérő", description: "Ingatlan-, energetikai, épület-, csarnok- és műszaki felmérési munkatér.", status: "in_development" },
          { name: "Felújítási Gyorskalkulátor", description: "Tájékoztató felújítási költségbecslés, változatok és becsült–tényleges összevetés.", status: "in_development" },
          { name: "DIMPRO GazdaSegéd", description: "Napi munka, állattartás, gépnapló, raktár, fotók és export.", status: "in_development" },
          { name: "DIMPRO Árutér", description: "Termék-, rendelés-, foglalás- és értékesítési munkafolyamatok.", status: "in_development" },
          { name: "DIMPRO Eseményszervező", description: "Meghívásos családi vagy szervezeti eseményoldalak és visszajelzések.", status: "in_development" },
          { name: "Költségadatbázis és ajánlatkészítés", description: "Közös tétel-, ár- és ajánlat-előkészítési réteg.", status: "in_development" },
          { name: "Ajánlatértékelő és versenyeztető", description: "Többfordulós ajánlatbekérés, összehasonlítás és rangsorolás.", status: "planned" },
          { name: "Kivitelezési döntésmotorok", description: "Felvonulási terület, depónia, logisztika és más mérnöki optimalizáló modulok.", status: "planned" },
        ],
      },
    ],
  },
  {
    id: "license",
    title: "DIMPRO Licenc- és előfizetési rendszer",
    shortName: "LICENC",
    role: "Webes és asztali termékek jogosultság-, aktiválás- és ügyfélkezelése",
    description: "A license.dimpro.hu külön védett rendszerként kezeli a licenceket, gépaktiválásokat, ügyfélportált, lejáratokat, release-eket, e-mail profilokat és belső adminisztrációt. Nem azonos a normál DIMPRO felhasználói belépéssel.",
    status: "active",
    domains: ["license.dimpro.hu/admin – licencadmin", "license.dimpro.hu/customer – ügyfélportál"],
    sections: [
      {
        title: "Ügyfél- és licencfunkciók",
        items: [
          { name: "Ügyfélportál", description: "Licenckulccsal elérhető ügyféloldal licenc-, kapcsolattartó- és lejárati adatokhoz.", status: "active" },
          { name: "Licencaktiválás", description: "Webes és desktop termékek aktiválása, szerveroldali állapotellenőrzéssel.", status: "active" },
          { name: "Gépaktiválás", description: "Gépazonosító, gépszámkorlát, tiltás, csere és aktiválási audit.", status: "active" },
          { name: "Moduljogosultság", description: "Termék- és modulengedélyek, próbaidő, lejárat és offline türelmi idő.", status: "active" },
          { name: "Előfizetés és csomag", description: "Későbbi közös DIMPRO csomag-, tárhely-, Drive-, Drop- és DIMPROVER előfizetéskezelés.", status: "planned" },
          { name: "Lejárati értesítések", description: "Automatikus ügyfél- és adminlevelek, kapcsolati Reply-To és értesítési napló.", status: "in_development" },
        ],
      },
      {
        title: "Belső licencadmin",
        items: [
          { name: "Licencadmin dashboard", description: "Licencek, ügyfelek, gépek, állapotok, aktiválások és jogosultságok kezelése.", status: "active" },
          { name: "Belépési és aktiválási napló", description: "Admin-, OTP-, ügyfél- és gépaktiválási események ellenőrzése.", status: "active" },
          { name: "Release és letöltés", description: "Védett ZIP/7Z kiadások, tokenes letöltés, SHA-256, lejárat és előzmények.", status: "active" },
          { name: "E-mail profilok", description: "System, értesítés, Drive, noreply, számlázás, admin és info címek központi kezelése.", status: "active" },
          { name: "Szerverállapot", description: "PM2, Nginx, SSL, tárhely, memória, backup, log és warning ellenőrzése.", status: "active" },
          { name: "Előfizetési admin", description: "Fizetés, számlázási státusz, csomagváltás és jogosultságfrissítés közös felülete.", status: "planned" },
        ],
      },
    ],
  },
  {
    id: "dev-center",
    title: "DIMPRO Dev Fejlesztési Központ",
    shortName: "DEV CENTER",
    role: "A DIMPRO termékcsalád fejlesztési, verzió-, kiadási és üzemeltetési vezérlőpultja",
    description: "A Fejlesztési Központ a belső fejlesztések központi irányítópultja. A licencadmin belépés után érhető el, és később a PROD, DEV és DATABASE szerverek közös állapotát is áttekinti.",
    status: "active",
    domains: ["license.dimpro.hu/admin/dev"],
    sections: [
      {
        title: "Fejlesztési nyilvántartás",
        items: [
          { name: "Fejlesztési projektek", description: "DIMPRO, DIMPROVER, Fájlműhely, HAGE és további projektek külön kártyákon.", status: "active" },
          { name: "Verziók és státuszok", description: "Tervezett, folyamatban, tesztelés, blokkolt, elkészült és kiadott állapotok.", status: "active" },
          { name: "Ráfordított fejlesztési idő", description: "Automatikus és kézi munkamenetek projekt-, modul- és verziószinten.", status: "active" },
          { name: "Fejlesztési Napló / AI Kontextustár", description: "Döntések, ötletek, blokkolók, átadók és más AI-nak átadható kontextus.", status: "active" },
          { name: "DIMPRO rendszerstruktúra", description: "Jelenlegi és tervezett szerver-, belépési-, termék-, modul- és e-mail térkép.", status: "in_development" },
        ],
      },
      {
        title: "Kiadás és üzemeltetés",
        items: [
          { name: "Release Központ", description: "DEV–STAGING–PROD állapot, changelog, checklist, backup és rollback.", status: "active" },
          { name: "Release feltöltő", description: "Védett asztali kiadások és letöltési csomagok regisztrálása.", status: "active" },
          { name: "Szerverállapot és Szerverőr", description: "Erőforrások, domainek, SSL, PM2, backup és riasztási szabályok.", status: "active" },
          { name: "Push/PWA értesítés", description: "Fejlesztés elkészült értesítés mobilra, egyedi DIMPRO jelzéssel.", status: "active" },
          { name: "Többszerveres vezérlőpult", description: "Külön PROD, DEV és DATABASE MCP/állapot, célzott műveletekkel és jogosultságokkal.", status: "planned" },
        ],
      },
    ],
  },
  {
    id: "drive",
    title: "DIMPRO Drive",
    shortName: "DRIVE",
    role: "Tartós projektalapú fájltér és szinkron",
    description: "A DIMPRO Drive nem általános felhőtárhely, hanem műszaki projektekhez kapcsolt tartós fájl- és dokumentumtér, webes és asztali hozzáféréssel.",
    status: "in_development",
    domains: ["drive.dimpro.hu – tervezett", "app.dimpro.hu/drive – központi app útvonal"],
    sections: [
      {
        title: "Drive szolgáltatások",
        items: [
          { name: "Webes projektfájltár", description: "Projektlista, mappák, fájlmetaadatok, előnézet, feltöltés és letöltés.", status: "in_development" },
          { name: "DIMPRO Drive Desktop", description: "Helyi Drive mappa, kézi majd automatikus szinkron és fájlműveleti napló.", status: "in_development" },
          { name: "Külsős partnerek", description: "Jogosultságos megosztások és korlátozott külső hozzáférések.", status: "planned" },
          { name: "Mappaőr", description: "Projektmappák változásfigyelése és e-mail/web/desktop értesítés.", status: "in_development" },
          { name: "Verziózás és audit", description: "Fájlverziók, feltöltő, időpont, forrás és változási előzmény.", status: "planned" },
          { name: "DocumentViewer kapcsolat", description: "PDF-, kép-, DXF- és később IFC-előnézet a közös nézőmotorral.", status: "planned" },
          { name: "Object Storage", description: "S3-kompatibilis tartós fájltárolás, signed upload/download és backup.", status: "planned" },
          { name: "Drop integráció", description: "Tartós Drive fájlból ideiglenes Drop csomag készítése és visszamentése.", status: "planned" },
        ],
      },
    ],
  },
  {
    id: "drop",
    title: "DIMPRO Drop",
    shortName: "DROP",
    role: "Ideiglenes, meghívásos fájl- és képcsomagátadás",
    description: "A Drop időkorlátos megosztási kapu. Új csomagot belső DIMPRO felületről lehet létrehozni, a külső fél linkkel, csomagkóddal vagy PIN-nel fér hozzá.",
    status: "in_development",
    domains: ["drop.dimpro.hu"],
    sections: [
      {
        title: "Drop munkafolyamatok",
        items: [
          { name: "KépDrop", description: "Mobilközpontú fotófeltöltés, képméretezés, megjegyzés és képes PDF-riport.", status: "in_development" },
          { name: "FájlDrop", description: "Asztali dokumentum-, műszaki fájl-, ZIP- és vegyes csomagátadás.", status: "in_development" },
          { name: "Csomagkezelő", description: "Csomag létrehozása, meghívottak, lejárat, megtekintés, komment és lezárás.", status: "planned" },
          { name: "Token- és PIN-kapu", description: "Rövid életű, auditált feltöltési, megtekintési, letöltési és riportjogosultság.", status: "planned" },
          { name: "Automatikus PDF-riport", description: "Képek, fájlnevek, csoportok, megjegyzések, szerző és időpont összesítése törlés előtt.", status: "planned" },
          { name: "Lejárati és törlési workflow", description: "Ideiglenes tárhely, figyelmeztetés, riportküldés, naplózás és automatikus törlés.", status: "planned" },
          { name: "Drive átadás", description: "A Drop csomag végleges fájljainak projektalapú DIMPRO Drive-ba helyezése.", status: "planned" },
        ],
      },
    ],
  },
  {
    id: "project-gate",
    title: "DIMPRO Projektkapu – DIMPRO DOCK",
    shortName: "D6 CORE",
    role: "Egyprojektes projektkommunikációs, dokumentum-, jóváhagyási és naplózási platform",
    description: "A DIMPRO Projektkapu a DIMPRO Projektkapu – D6 Core felhasználói felülete. Egy időben egy projektkörnyezetet jelenít meg, miközben ugyanazt a központi project_id-t, dokumentumtárat, jogosultságot, kommunikációt, döntést, naplót és auditadatot használja, mint a többprojektes DIMPROVER.",
    status: "in_development",
    domains: ["projektkapu.dimpro.hu – elsődleges", "door.dimpro.hu – 301-es márkaátirányítás", "app.dimpro.hu/projektkapu – belső/átmeneti útvonal"],
    sections: [
      {
        title: "D6 Core projektmodulok",
        note: "Minden angol modulnév mellett állandóan látható a rövid magyar megnevezés. A DROP külön fejlesztési körben készül; a Projektkapu csak a kapcsolódási helyét tartja fenn.",
        items: [
          { name: "DIMPRO DOCK – ProjektTér", description: "Központi projektáttekintés, résztvevők, aktivitás, nyitott feladatok és modulindítás.", status: "in_development" },
          { name: "DIMPRO DRIVE – Dokumentumtár", description: "Tartós projektfájltár, mappák, dokumentumverziók, revíziók és hozzáférési események.", status: "planned" },
          { name: "DIMPRO DROP – Fájlkapu", description: "Külső, meghívásos fájlátadás; a publikus drop.dimpro.hu fejlesztése külön csevegésben történik.", status: "in_development" },
          { name: "DIMPRO DIALOG – Egyeztetések", description: "Szakági kérdések, adatkérések, tervészrevételek, témakártyák, hozzászólások és projekt-naptári határidők.", status: "in_development" },
          { name: "DIMPRO DECIDE – Jóváhagyások", description: "Auditálható terv-, termékkiváltási, költség- és határidőhatásos döntési folyamatok soros és párhuzamos jóváhagyási szakaszokkal.", status: "in_development" },
          { name: "DIMPRO DIARY – Projektnapló", description: "Napi projekt- és kivitelezési események, időjárás, létszám, munkafolyamatok, akadályok, ellenőrzések és auditált naplóworkflow; nem helyettesíti az e-építési naplót.", status: "in_development" },
        ],
      },
      {
        title: "Közös Projektkapu motorok",
        items: [
          { name: "Identity & Access Core", description: "Közös DIMPRO-fiók, szervezet, meghívás, projekt-tagság és szerveroldali jogosultság.", status: "planned" },
          { name: "Project Core", description: "Központi project_id, projektéletciklus, résztvevők, szakaszok, read-only lezárás és archiválás.", status: "in_development" },
          { name: "Document Core", description: "Logikai dokumentum, fájlverzió, mappa, hivatkozás és későbbi Drive/Drop kapcsolat.", status: "planned" },
          { name: "Workflow & Communication Core", description: "Feladat, határidő, ügy, hozzászólás, jóváhagyási lánc és állapotgépek.", status: "planned" },
          { name: "Audit, Notification & Export Core", description: "Eseménynapló, értesítések, PDF/CSV/XLSX/ZIP és teljes projektarchívum.", status: "planned" },
        ],
      },
    ],
  },
  {
    id: "dimprover",
    title: "DIMPROVER",
    shortName: "DIMPROVER",
    role: "Építőipari és mérnöki enterprise projektirányítás",
    description: "A DIMPROVER a teljes építőipari/mérnöki enterprise platform. Közös kódbázisra, modulmotorokra, szerepkörökre és csomag alapú feature flagekre épül.",
    status: "in_development",
    domains: ["dimprover.hu", "app.dimprover.hu"],
    sections: [
      {
        title: "Főmodulok",
        items: [
          { name: "Munkatér", description: "Személyes és csapatszintű áttekintés, feladatok, naptár, értesítések és gyorsindítók.", status: "in_development" },
          { name: "Projektkapu / D6 Core", description: "A közös D6 modulmotorok többprojektes DIMPROVER felülete; ugyanaz a project_id, dokumentumtár, kommunikáció, jóváhagyás, napló és audit.", status: "in_development" },
          { name: "Építéshely", description: "Terepi hibafelvétel, hibajegyzék, állapotrögzítés, napi jelentés és helyszíni workflow.", status: "in_development" },
          { name: "Vállalkozói Műhely", description: "Ajánlat, költségvetés, erőforrás, alvállalkozó és vállalkozói munkafolyamatok.", status: "in_development" },
          { name: "Üzemeltetés", description: "Átadás utáni eszköz-, hiba-, karbantartási és dokumentációs folyamatok.", status: "planned" },
          { name: "Admin", description: "Szervezet, felhasználók, jogosultságok, feature flagek, audit és rendszerbeállítások.", status: "in_development" },
        ],
      },
      {
        title: "Projekten belüli almodulok",
        items: [
          { name: "Áttekintés", description: "Projektadatok, státusz, fontos események, KPI-k és gyorslinkek.", status: "in_development" },
          { name: "Ütemterv", description: "Hierarchikus, dátumalapú timeline, szerződéses háttérsáv, mérföldkő és későbbi pénzügyi réteg.", status: "in_development" },
          { name: "Dokumentumok / Mappaőr", description: "Terv- és dokumentumtár, változásfigyelés, verziók és értesítések.", status: "in_development" },
          { name: "DokuBOX", description: "Értekezleti dokumentumcsomag, előnézet, jegyzet, képmetszés és következő csomag.", status: "planned" },
          { name: "Jegyzőkönyvek", description: "Kooperációs, műszaki, tervezői, terepi és egyéb jegyzőkönyvek PDF/DOCX exporttal.", status: "in_development" },
          { name: "Hibajegyzék", description: "Élő hibakövetés, felelős, határidő, státusz, HexPin és értesítések.", status: "in_development" },
          { name: "Terepi állapotrögzítés", description: "Gyors fotós és részletes felmérés lefedettséggel és korrekt készültségi megnevezéssel.", status: "planned" },
          { name: "Exportok / Riportok", description: "Projekt-, ütemterv-, dokumentum-, hiba- és vezetői riportok.", status: "planned" },
        ],
      },
      {
        title: "Közös enterprise motorok",
        items: [
          { name: "DocumentViewer / Preview Engine", description: "Kép, PDF, DXF, később IFC; zoom/pan, overlay, mérés, cache és export.", status: "in_development" },
          { name: "Timeline Engine", description: "Újrahasznosítható ütemezési motor több DIMPRO/DIMPROVER felülethez.", status: "in_development" },
          { name: "PDF és dokumentum export", description: "A4/A3 nyomtatható, vállalati megjelenésű riport- és jegyzőkönyvmotor.", status: "in_development" },
          { name: "Szerepkör és feature flag", description: "Projekt-, szervezet- és csomagszintű hozzáférés ugyanazon kódbázison.", status: "in_development" },
          { name: "DIMPROVER AI", description: "AI-támogatott összefoglalás, kockázat, javaslat, dokumentum és későbbi projektintelligencia.", status: "planned" },
        ],
      },
    ],
  },
  {
    id: "desktop",
    title: "DIMPRO Desktop réteg",
    shortName: "DESKTOP",
    role: "Közös Windows kliens- és háttérszolgáltatási keret",
    description: "A Desktop réteg fogja össze a helyi telepítést, belépést, licencet, frissítést, Drive szinkront és értesítéseket. Nem minden felhasználónak kötelező; a webes felület marad az elsődleges hivatalos felület.",
    status: "in_development",
    domains: ["license.dimpro.hu – licenc és release", "app.dimpro.hu – központi webes kapcsolat"],
    sections: [
      {
        title: "Közös desktop szolgáltatások",
        items: [
          { name: "DIMPRO Indító", description: "Bejelentkezés, licencellenőrzés, termék- és modulindítás.", status: "in_development" },
          { name: "Frissítés és release", description: "Védett csomagletöltés, verzióellenőrzés, telepítés és rollback.", status: "in_development" },
          { name: "Drive szinkron", description: "Helyi mappa, feltöltés/letöltés, szinkronállapot és későbbi automatikus háttérműködés.", status: "in_development" },
          { name: "Értesítések / Tevékenységek", description: "Közös szerveres olvasottság, desktop toast, részletező és előzmények.", status: "in_development" },
          { name: "Helyi cache és offline sor", description: "Átmeneti fájlok, megszakadt műveletek folytatása és kapcsolat-visszaállás.", status: "planned" },
          { name: "Gépazonosító és biztonság", description: "Licenchez kötött gép, kulcsbiztonság és auditált klienskapcsolat.", status: "in_development" },
        ],
      },
    ],
  },
  {
    id: "fajlmuhely",
    title: "DIMPRO Fájlműhely",
    shortName: "FÁJLMŰHELY",
    role: "Helyi mérnöki fájl-, PDF-, kép- és mennyiségkezelő munkaállomás",
    description: "A Fájlműhely önálló Windows asztali szoftver, amely a nagy vagy érzékeny műszaki fájlokat helyben dolgozza fel, miközben a licencet, Drive-ot és értesítéseket a központi DIMPRO rendszerhez kapcsolja.",
    status: "in_development",
    domains: ["Helyi Windows alkalmazás", "license.dimpro.hu – licenc és release", "DIMPRO Drive API"],
    sections: [
      {
        title: "Fájl- és dokumentummodulok",
        items: [
          { name: "Fájlrendező", description: "Tömeges átnevezés, rendezés, másolás, hibadokumentálás és fájlműveleti napló.", status: "active" },
          { name: "Mappaőr", description: "Mappaváltozások, új fájlok, projektkapcsolat és központi értesítés.", status: "in_development" },
          { name: "PDF Műhely", description: "Összefűzés, szétválasztás, vízjel, bélyeg, tömörítés, szövegkinyerés és QR-előkészítés.", status: "planned" },
          { name: "Tervjegyzék-készítő", description: "PDF/Word/Excel metaadat, tervfajta, adatforrás, kézi javítás és export.", status: "planned" },
          { name: "DokuBOX", description: "Több mappából összeállított dokumentumcsomag, előnézet, jegyzet és értekezleti használat.", status: "planned" },
          { name: "KépBOX", description: "KépDrop, optimalizálás, képernyőmetszés, kamera, jelölés és célmappa-kezelés.", status: "planned" },
        ],
      },
      {
        title: "Mérnöki néző- és szerkesztőmodulok",
        items: [
          { name: "PDF Tervnéző", description: "Közös DocumentViewer alap, zoom/pan, jelölések, HexPin és menthető munkafájl.", status: "active" },
          { name: "Tervösszehasonlítás", description: "A/B terv, overlay, blink, pixel-diff, kizárás és változásriport.", status: "active" },
          { name: "Szakági Mennyiségmérő", description: "PDF/DXF rárajzolás, automatikus vektorolvasás, termékfa és élő mennyiségpanel.", status: "in_development" },
          { name: "IFC Viewer és BIM mennyiség", description: "Későbbi 3D modellnézet, objektumadat és quantity/property kiolvasás.", status: "planned" },
          { name: "Képszerkesztő és rajzoló", description: "Nyíl, méretvonal, kitakarás, pecsét, rétegek és PDF-oldal jelölése.", status: "in_development" },
        ],
      },
      {
        title: "Üzleti és integrációs modulok",
        items: [
          { name: "Költségvetés Műhely", description: "Tételek, saját tételtár, ajánlatfejléc, PDF/Excel/CSV és belső/ügyfél export.", status: "active" },
          { name: "DIMPRO Drive kapcsolat", description: "Kézi feltöltés/letöltés, projektfájllista, műveleti napló és későbbi szinkron.", status: "in_development" },
          { name: "Értekezleti Kísérő Desktop", description: "Webes/Teams értekezlethez kapcsolódó helyi fájl-, átirat- és archív workflow.", status: "in_development" },
          { name: "Licenc és frissítés", description: "Központi licencellenőrzés, védett release és Windows csomagfrissítés.", status: "in_development" },
        ],
      },
    ],
  },
];

export const infrastructureRules = [
  "A fejlesztés az új DEV VPS-en történik; a PROD VPS csak ellenőrzött release-t kap.",
  "Egy közös DEV VPS-en több DIMPRO- vagy ügyfélprojekt fejleszthető teljes technikai elkülönítéssel.",
  "Az elkészült ügyfél-SaaS az élesítéskor kap külön PROD környezetet; nem kell előre külön DEV VPS minden projekthez.",
  "Az éles PostgreSQL külön DATABASE VPS-en fut; a DEV-adatbázisok a DEV VPS-en maradhatnak.",
  "A PostgreSQL csak metaadatot és üzleti adatot tárol; a fájlok Object Storage-ba kerülnek.",
  "A Supabase addig marad, amíg az új PostgreSQL, az adatmigráció, a párhuzamos teszt és a rollback nem igazolt.",
  "Minden élesítés előtt backup, dokumentált változás, build, teszt, smoke check és rollback-pont kötelező.",
  "A titkos kulcsok, adatbázis-jelszavak és tárhelykulcsok csak szerveroldalon tárolhatók, a csevegésbe nem kerülhetnek.",
];

export const developmentFlow = [
  "Fejlesztési feladat és verzió rögzítése a Fejlesztési Központban",
  "Backup és külön DEV munkakörnyezet",
  "Kódolás, dokumentáció és adatmodell-migráció",
  "TypeScript, célzott lint, build és legalább 10 működési ellenőrzés",
  "DEV/staging kézi vagy automatikus jóváhagyás",
  "PROD backup, release, PM2 restart és éles smoke teszt",
  "Fejlesztési idő, eredmény, aktív build és rollback rögzítése",
];

export const mailProfileKnowledge: Record<string, { kind: string; reply: string; users: string }> = {
  system: {
    kind: "Automatikus technikai feladó",
    reply: "Alapesetben nem ügyfélkapcsolati cím; szükség esetén külön Reply-To kerül a levélre.",
    users: "Szerverőr, rendszerhiba, licencmotor és technikai állapotriasztások.",
  },
  notifications: {
    kind: "Automatikus alkalmazásfeladó",
    reply: "Értesítési levél; a válaszkezelést az adott munkafolyamat Reply-To címe szabályozza.",
    users: "DIMPRO/DIMPROVER projekt-, határidő-, értekezlet- és feladatesemények.",
  },
  drive: {
    kind: "Automatikus fájlrendszer-feladó",
    reply: "Rendszerértesítés; válasz helyett a Drive/Projektkapu eseményt kell megnyitni.",
    users: "DIMPRO Drive, Drive Desktop, Mappaőr, Projektkapu és később Drop események.",
  },
  noreply: {
    kind: "Nem válaszolható automatikus feladó",
    reply: "Nem fogad feldolgozandó választ; a levélben külön kapcsolati címet kell megadni.",
    users: "Egyszerű rendszerigazolások és olyan levelek, amelyekre nem várunk választ.",
  },
  billing: {
    kind: "Automatikus pénzügyi feladó",
    reply: "A számlázási folyamat szerint kezelt kapcsolati vagy admin Reply-To címet használhat.",
    users: "Előfizetés, díjbekérő, számlázási állapot, csomagváltás és lejárati figyelmeztetés.",
  },
  admin: {
    kind: "Belső adminisztrációs cím",
    reply: "Kezelt adminpostafiók; belső és jogosultsági ügyekben válaszolható.",
    users: "Licencadmin, aktiválás, belső rendszerkezelés és adminisztráció.",
  },
  info: {
    kind: "Általános emberi kapcsolati cím",
    reply: "Elsődleges válaszcím ügyfél- és érdeklődői kommunikációhoz.",
    users: "Általános tájékoztatás, ügyfélkommunikáció és automatikus levelek Reply-To címe.",
  },
};

export type TargetPlanStatus = "planned" | "in_progress" | "waiting" | "completed";

export type TargetPlanItem = {
  title: string;
  detail: string;
  status: TargetPlanStatus;
};

export type StructureComparisonGroup = {
  id: string;
  category: string;
  title: string;
  summary: string;
  currentItems: string[];
  targetItems: TargetPlanItem[];
};

export const targetPlanStatusMeta: Record<TargetPlanStatus, { label: string; className: string; cardClassName: string }> = {
  planned: {
    label: "Tervezett",
    className: "structure-plan-badge structure-plan-badge--planned",
    cardClassName: "structure-plan-card--planned",
  },
  in_progress: {
    label: "Folyamatban",
    className: "structure-plan-badge structure-plan-badge--progress",
    cardClassName: "structure-plan-card--progress",
  },
  waiting: {
    label: "Külső lépésre vár",
    className: "structure-plan-badge structure-plan-badge--waiting",
    cardClassName: "structure-plan-card--waiting",
  },
  completed: {
    label: "Teljesítve",
    className: "structure-plan-badge structure-plan-badge--completed",
    cardClassName: "structure-plan-card--completed",
  },
};

export const structureComparisonGroups: StructureComparisonGroup[] = [
  {
    id: "servers",
    category: "Infrastruktúra",
    title: "Szerverek és környezetek szétválasztása",
    summary: "A fejlesztési terhelés és az éles ügyfélkiszolgálás külön környezetbe kerül.",
    currentItems: [
      "A jelenlegi Ubuntu 24.04 LTS VPS egyszerre szolgál ki éles felületeket és több fejlesztési/build folyamatot.",
      "A build vagy erőforrás-igényes fejlesztés időnként az éles működést is lassíthatja vagy röviden megszakíthatja.",
      "A szerver 4 GB RAM-mal és kb. 80 GB tárhellyel működik; a lemezhasználat jelenleg magas.",
    ],
    targetItems: [
      { title: "PROD VPS megőrzése", detail: "A jelenlegi Ubuntu 24.04 LTS szerver kizárólag ellenőrzött éles kiadásokat szolgál ki.", status: "in_progress" },
      { title: "Külön DEV VPS", detail: "Prémium Large, 4 vCore, 8 GB RAM, 120 GB SSD; dev.dimpro.hu; fejlesztés, staging, build és teszt.", status: "waiting" },
      { title: "Külön DATABASE VPS", detail: "Prémium Medium, 2 vCore, 4 GB RAM, 80 GB SSD; db.dimpro.hu; éles PostgreSQL.", status: "waiting" },
      { title: "Egységes operációs rendszer", detail: "PROD, DEV és DATABASE környezet Ubuntu 24.04 LTS rendszerrel.", status: "completed" },
    ],
  },
  {
    id: "development",
    category: "Fejlesztési működés",
    title: "DEV → STAGING → PROD kiadási lánc",
    summary: "Az éles szerveren történő közvetlen fejlesztést dokumentált kiadási folyamat váltja fel.",
    currentItems: [
      "A fejlesztés és az éles build jelenleg ugyanazon a VPS-en történik.",
      "A backup, build, PM2 restart és smoke teszt már része a munkafolyamatnak, de nincs fizikailag elkülönített staging szerver.",
      "A Fejlesztési Központ verziót, ráfordított időt, release-t és értesítést rögzít.",
    ],
    targetItems: [
      { title: "Kódolás kizárólag DEV-en", detail: "Minden normál kódmódosítás, build, lint és automatikus teszt az új DEV VPS-en fusson.", status: "planned" },
      { title: "Staging jóváhagyás", detail: "Mobil, tablet és desktop ellenőrzés a dev.dimpro.hu felületen élesítés előtt.", status: "planned" },
      { title: "Ellenőrzött PROD release", detail: "Backup, verziózott kiadás, PM2 restart, éles smoke és dokumentált rollback-pont.", status: "in_progress" },
      { title: "Fejlesztési Központ naplózás", detail: "Projekt, verzió, idő, tesztek, buildazonosító és értesítés rögzítése már működik.", status: "completed" },
    ],
  },
  {
    id: "database",
    category: "Adatok",
    title: "Supabase-ről saját PostgreSQL-rendszerre",
    summary: "A DIMPRO központi üzleti adatai saját, elkülönített adatbázis-szerverre kerülnek, ellenőrzött migrációval.",
    currentItems: [
      "A meglévő belépési és egyes adatkapcsolatok Supabase szolgáltatásokat használnak.",
      "Több korai modul még fájl- vagy JSON-alapú MVP adattárral működik.",
      "A Drop PostgreSQL migrációs terve elkészült, de még nincs alkalmazva.",
    ],
    targetItems: [
      { title: "Saját PostgreSQL", detail: "Külön DATABASE VPS, titkosított és IP-cím szerint korlátozott kapcsolattal.", status: "waiting" },
      { title: "Közös repository réteg", detail: "A frontend nem kapcsolódik közvetlenül az adatbázishoz; minden adat a DIMPRO API-n keresztül érhető el.", status: "planned" },
      { title: "Modulonként elkülönített sémák/adatbázisok", detail: "Drop, Drive, account, projektek, értesítések, licencek és ügyfélappok külön jogosultságokkal.", status: "planned" },
      { title: "Supabase fokozatos kivezetése", detail: "Csak export, próbaimport, párhuzamos működés, visszaállítási próba és többnapos megfigyelés után.", status: "planned" },
      { title: "Supabase egyelőre marad", detail: "A jelenlegi működést nem szüntetjük meg az új adatbázis igazolásáig.", status: "completed" },
    ],
  },
  {
    id: "storage",
    category: "Fájltárolás",
    title: "Adatbázis és fájltár helyes szétválasztása",
    summary: "A PostgreSQL üzleti és metaadatot, az Object Storage tényleges fájltartalmat kezel.",
    currentItems: [
      "A Drive és Drop tárhelyszerződések elő vannak készítve, de a valós S3-feltöltés még nincs bekapcsolva.",
      "A jelenlegi VPS több release-, backup- és ideiglenes fájlt is tárol.",
      "A Drop felület biztonsági okból inaktív upload állapotban van.",
    ],
    targetItems: [
      { title: "Privát Object Storage", detail: "PDF, kép, dokumentum, ZIP és Drive/Drop fájl privát S3-kompatibilis bucketekben.", status: "planned" },
      { title: "Signed hozzáférések", detail: "Rövid életű upload/download jogosultság, hosszú életű kulcs nélkül a böngészőben.", status: "planned" },
      { title: "Életciklus és backup", detail: "Drop automatikus törlés, Drive verziózás, külön archív és visszaállítható mentés.", status: "planned" },
      { title: "Drop release gate", detail: "Valós tárhely és adatbázis nélkül a feltöltés nem aktiválható.", status: "completed" },
    ],
  },
  {
    id: "domains",
    category: "Domainek",
    title: "Központi DIMPRO domainstruktúra",
    summary: "A termék- és infrastruktúra-címek a DIMPRO központi szerepéhez igazodnak.",
    currentItems: [
      "dimpro.hu, app.dimpro.hu, drop.dimpro.hu és license.dimpro.hu aktív; a projektkapu.dimpro.hu alkalmazásoldali előkészítése elkészült.",
      "dimprover.hu és app.dimprover.hu a DIMPROVER termékhez tartozik.",
      "A korábbi dev.dimprover.hu rekord a jelenlegi VPS-re mutat.",
    ],
    targetItems: [
      { title: "projektkapu.dimpro.hu", detail: "DIMPRO Projektkapu – DIMPRO DOCK D6 Core elsődleges felhasználói domain, közös DIMPRO-fiókkal.", status: "in_progress" },
      { title: "door.dimpro.hu", detail: "Rövid márkadomain, amely 301-es átirányítással a projektkapu.dimpro.hu címre vezet.", status: "planned" },
      { title: "dev.dimpro.hu", detail: "Közös fejlesztői infrastruktúra minden DIMPRO, DIMPROVER és ügyfélapp fejlesztéshez.", status: "waiting" },
      { title: "db.dimpro.hu", detail: "Központi adatbázis-hostnév; a PostgreSQL ettől még nem lesz nyilvánosan elérhető.", status: "waiting" },
      { title: "drive.dimpro.hu", detail: "Későbbi tartós projektfájltér és Drive webes termékcím.", status: "planned" },
      { title: "drop.dimpro.hu", detail: "Az ideiglenes fájl- és képcsomagátadó külön hostja működik.", status: "completed" },
    ],
  },
  {
    id: "dimpro-core",
    category: "Termékcsalád",
    title: "DIMPRO mint központi mag és előfizetési központ",
    summary: "A dimpro.hu nem egyetlen app, hanem a teljes termékcsalád központi bemutató-, fiók- és előfizetési rendszere.",
    currentItems: [
      "A dimpro.hu már több DIMPRO alkalmazást és a DIMPROVER irányt bemutatja.",
      "A közös account, licencadmin és több modulregiszter már részben működik.",
      "A termékek és előfizetések még nem egyetlen teljes kereskedelmi folyamatban kezelhetők.",
    ],
    targetItems: [
      { title: "Központi termékcsalád-oldal", detail: "DIMPRO, DIMPRO Drive, DIMPRO Drop és DIMPROVER egy rendszerben bemutatva.", status: "in_progress" },
      { title: "Közös DIMPRO Account", detail: "Egy belépés, termék-, csomag- és moduljogosultságokkal.", status: "in_progress" },
      { title: "Előfizetési központ", detail: "Modul, tárhely, Drop/Drive és DIMPROVER csomagok előfizetése a DIMPRO felületén.", status: "planned" },
      { title: "Közös projekt- és szervezetmag", detail: "Azonos projektazonosító a Drive, Drop, DIMPRO appok és DIMPROVER között.", status: "planned" },
      { title: "Központi licencadmin", detail: "A webes és asztali termékek licenceinek, gépeinek és moduljainak kezelése működik.", status: "completed" },
    ],
  },
  {
    id: "emails",
    category: "Kommunikáció",
    title: "DIMPRO e-mail profilok szerepkör szerinti használata",
    summary: "A rendszerlevelek nem egy közös címről mennek, hanem feladat szerint elkülönített profilokat használnak.",
    currentItems: [
      "Hét nyilvántartott DIMPRO e-mail profil található a központi mail motorban.",
      "Hat profil aktív és SMTP-kapcsolattal rendelkezik; az info profil jelenleg kikapcsolt küldőprofil.",
      "Az info@dimpro.hu már alapértelmezett válaszcímként szerepel több munkafolyamatban.",
    ],
    targetItems: [
      { title: "system@dimpro.hu", detail: "Szerverőr, technikai hibák, állapotriasztások és licencrendszer.", status: "completed" },
      { title: "ertesites@dimpro.hu", detail: "Projekt-, feladat-, határidő- és értekezleti alkalmazásértesítések.", status: "completed" },
      { title: "ertesites.drive@dimpro.hu", detail: "Drive, Mappaőr, Projektkapu és későbbi Drop fájlesemények.", status: "completed" },
      { title: "noreply@dimpro.hu", detail: "Nem válaszolható igazolások; minden levélben külön kapcsolati cím szükséges.", status: "completed" },
      { title: "szamlazas@dimpro.hu", detail: "Előfizetés, díjbekérő, számla, csomagváltás és lejárat.", status: "completed" },
      { title: "admin@dimpro.hu", detail: "Licencadmin és belső adminisztrációs ügyek.", status: "completed" },
      { title: "info@dimpro.hu", detail: "Általános emberi ügyfélkapcsolati cím és alapértelmezett Reply-To; küldőprofilként még aktiválandó.", status: "planned" },
    ],
  },
  {
    id: "drive",
    category: "Termék",
    title: "DIMPRO Drive tartós projektfájltér",
    summary: "A Drive a projektek hivatalos, tartós fájltere; nem általános, projektkapcsolat nélküli felhőtárhely.",
    currentItems: [
      "Webes admin előnézet és Drive API MVP működik metaadat-, upload-init és kisfájlos fejlesztői folyamattal.",
      "A Drive Desktop kliensben kézi upload/download előkészítés, napló és értesítési alapok vannak.",
      "A valós Object Storage, teljes szinkron és végleges felhasználói jogosultság még nincs kész.",
    ],
    targetItems: [
      { title: "Webes hivatalos Drive", detail: "Projektfájltér, mappák, verziók, jogosultság, előnézet és megosztás.", status: "in_progress" },
      { title: "Drive Desktop", detail: "Helyi DIMPRO Drive mappa, kézi majd automatikus kétirányú szinkron.", status: "in_progress" },
      { title: "Mappaőr és értesítések", detail: "Minden webes, desktopos és Drop feltöltés közös esemény- és olvasottsági állapottal.", status: "in_progress" },
      { title: "Tartós Object Storage", detail: "Privát fájltár, verziózás, signed linkek és backup.", status: "planned" },
      { title: "Drop átadás", detail: "Drive-fájlból ideiglenes megosztás és Drop-csomagból végleges Drive-mentés.", status: "planned" },
    ],
  },
  {
    id: "drop",
    category: "Termék",
    title: "DIMPRO Drop ideiglenes fájlátadás",
    summary: "A Drop külön kezeli az időkorlátos külső fájlátadást, miközben a tartós projekttár a Drive marad.",
    currentItems: [
      "A drop.dimpro.hu külön TLS-, Nginx- és biztonsági hosttal működik.",
      "A KépDrop, FájlDrop és PIN-es hozzáférési felület látható, de a valós funkciók ki vannak kapcsolva.",
      "A Drop adatmodell és PostgreSQL migrációs terv elkészült.",
    ],
    targetItems: [
      { title: "KépDrop", detail: "Mobilos fotófeltöltés, optimalizálás, csoportok, megjegyzések és képes riport.", status: "in_progress" },
      { title: "FájlDrop", detail: "Asztali dokumentum-, műszaki fájl-, ZIP- és vegyes csomagátadás.", status: "in_progress" },
      { title: "Token/PIN és jogosultság", detail: "Feltöltő, megtekintő, letöltő és riport szerepkör rövid életű hozzáféréssel.", status: "planned" },
      { title: "Automatikus PDF-riport és törlés", detail: "Riport e-mailben a lejárat és a 7 napos ideiglenes tárhely törlése előtt.", status: "planned" },
      { title: "Biztonságos inaktív shell", detail: "A valós backend elkészültéig minden adatkezelő funkció letiltva marad.", status: "completed" },
    ],
  },
  {
    id: "project-gate",
    category: "Termék",
    title: "DIMPRO Projektkapu – DIMPRO DOCK D6 Core",
    summary: "Az önálló Projektkapu egy időben egy projektet kezel; a DIMPROVER ugyanennek a közös projektmagnak a többprojektes és szervezeti felülete.",
    currentItems: [
      "A szerveren elkészült a /projektkapu és a projektazonosítós D6 modulútvonalak első működő UI-váza.",
      "A DOCK dashboard, a hat hexagonos modulindító és a magyar modulnevek megjelennek desktopon, tableten és mobilon.",
      "A DRIVE, DIALOG, DECIDE és DIARY modulhelyek elő vannak készítve; a DROP fejlesztése külön csevegésben marad.",
    ],
    targetItems: [
      { title: "DOCK – ProjektTér MVP", detail: "Projekt dashboard, résztvevők, legutóbbi fájlok, nyitott egyeztetések, jóváhagyások és aktivitás.", status: "in_progress" },
      { title: "Közös Project Core", detail: "Organization, Project, ProjectMembership, projektéletciklus és minden API-nál szerveroldali jogosultság.", status: "planned" },
      { title: "D6 modulmotorok", detail: "DRIVE, DIALOG, DECIDE és DIARY közös dokumentum-, workflow-, kommunikációs és auditmotorokon.", status: "planned" },
      { title: "DROP integráció", detail: "A külön fejlesztett Drop csomagok projekthez és Drive célmappához kapcsolása közös API-n keresztül.", status: "planned" },
      { title: "Projektlezárás és archívum", detail: "Read-only lezárás, teljes PDF/CSV/XLSX/ZIP export és DIMPROVER szervezeti archívum.", status: "planned" },
    ],
  },
  {
    id: "dimprover",
    category: "Termék",
    title: "DIMPROVER enterprise projektirányítás",
    summary: "A DIMPROVER marad a teljes építőipari és mérnöki enterprise platform, közös motorokkal és projektalapú almodulokkal.",
    currentItems: [
      "A webes platform több főmodult, projekt-, ütemterv-, dokumentum-, jegyzőkönyv- és terepi fejlesztést tartalmaz.",
      "A közös modulváltó, világos munkafelület és enterprise layout több felületen már megjelent.",
      "Több funkció még külön MVP adattáron vagy részben elkülönült felületen működik.",
    ],
    targetItems: [
      { title: "Hat főmodul", detail: "Munkatér, Projektkapu, Építéshely, Vállalkozói Műhely, Üzemeltetés és Admin.", status: "in_progress" },
      { title: "Projektközpontú almodulok", detail: "Áttekintés, Ütemterv, Dokumentumok/Mappaőr, DokuBOX, Jegyzőkönyvek, Hibajegyzék, Állapotrögzítés, Riportok.", status: "in_progress" },
      { title: "Közös engine-ek", detail: "DocumentViewer, timeline, PDF/export, értesítés, jogosultság és feature flag egyszer fejlesztve, több felületen használva.", status: "in_progress" },
      { title: "DIMPROVER AI", detail: "Dokumentum-, kockázat-, csúszás- és projektintelligencia réteg külön jogosultsággal és költségnaplóval.", status: "planned" },
    ],
  },
  {
    id: "desktop",
    category: "Kliens",
    title: "DIMPRO Desktop közös asztali réteg",
    summary: "Az asztali programok közös indítást, licencet, frissítést, Drive-kapcsolatot és értesítési motort használnak.",
    currentItems: [
      "Több Windowsos kliens- és launcher-irány már létezik, részben külön csomagolási folyamattal.",
      "A Drive Desktop és a Fájlműhely közös API- és értesítési kapcsolatot épít.",
      "A webes felület marad a hivatalos szerveroldali állapot gazdája.",
    ],
    targetItems: [
      { title: "Közös DIMPRO Indító", detail: "Belépés, licenc, termékválasztás, verzióellenőrzés és biztonságos indítás.", status: "in_progress" },
      { title: "Közös frissítési motor", detail: "Védett release, automatikus vagy jóváhagyott frissítés és rollback.", status: "in_progress" },
      { title: "Drive és értesítések", detail: "Közös szerveres projekt-, fájl-, olvasottsági és tevékenységi állapot.", status: "in_progress" },
      { title: "Offline cache és folytatás", detail: "Megszakadt feltöltések, helyi sor és kapcsolat-visszaállás utáni folytatás.", status: "planned" },
    ],
  },
  {
    id: "fajlmuhely",
    category: "Asztali termék",
    title: "DIMPRO Fájlműhely mérnöki munkaállomás",
    summary: "A Fájlműhely helyben dolgozza fel a műszaki fájlokat, de a licencet, Drive-ot, értesítést és projektkapcsolatot a központi DIMPRO rendszer adja.",
    currentItems: [
      "Működő Fájlrendező, PDF Tervnéző, Tervösszehasonlítás és Költségvetés Műhely modulok vannak.",
      "A DocumentViewer, Drive Desktop, értesítési és értekezleti kapcsolatok több fejlesztési körben bővültek.",
      "A PDF Műhely, Tervjegyzék, DokuBOX, KépBOX és teljes Szakági Mennyiségmérő még részben tervezett.",
    ],
    targetItems: [
      { title: "Működő alapmodulok megőrzése", detail: "Fájlrendező, PDF Tervnéző, Tervösszehasonlítás és Költségvetés Műhely.", status: "completed" },
      { title: "Közös DocumentViewer", detail: "PDF, kép, DXF, később IFC; ugyanaz a motor a webes és desktop modulokhoz.", status: "in_progress" },
      { title: "Fájlműhely modulcsalád", detail: "Mappaőr, PDF Műhely, Tervjegyzék, DokuBOX, KépBOX és Képszerkesztő.", status: "planned" },
      { title: "Szakági Mennyiségmérő", detail: "PDF/DXF mérés, layer/szín szabálymotor, termékfa, mennyiségek és export.", status: "in_progress" },
      { title: "Központi Drive és licenc", detail: "A helyi feldolgozás mellett projektfájl-, értesítés-, licenc- és release kapcsolat.", status: "in_progress" },
    ],
  },
  {
    id: "customer-apps",
    category: "Új SaaS fejlesztések",
    title: "Más ügyfélnek készülő appok elhelyezése",
    summary: "Nem kell minden új projekthez külön DEV és adatbázis-szervert bérelni a fejlesztés kezdetén.",
    currentItems: [
      "A jelenlegi szerveren több saját DIMPRO fejlesztés fut egymás mellett.",
      "Új ügyfélappok infrastruktúrájára még nincs külön rögzített sablon.",
    ],
    targetItems: [
      { title: "Közös DEV VPS", detail: "Az ügyfélapp külön projektmappát, repository-t, portot, env fájlt és DEV adatbázist kap.", status: "planned" },
      { title: "Tesztadatok teljes elkülönítése", detail: "Külön adatbázis-felhasználó, fájltér és technikai hostname minden projekthez.", status: "planned" },
      { title: "Külön PROD csak elkészüléskor", detail: "Az éles ügyfélrendszer terhelés, adatérzékenység és szerződés alapján kap saját VPS-t vagy menedzselt környezetet.", status: "planned" },
      { title: "Nincs automatikus közös éles adatbázis", detail: "Érzékeny vagy nagy ügyfélrendszer külön adatbázist kaphat; a döntés élesítés előtt történik.", status: "planned" },
    ],
  },
  {
    id: "access-gates",
    category: "Belépés és alkalmazáskapuk",
    title: "Hol jelentkezik be a felhasználó, az ügyfél és az admin?",
    summary: "A normál DIMPRO-fiók, a DIMPROVER belépés, a licencügyfél-portál és a belső admin/fejlesztői felület szerepét egyértelműen szét kell választani.",
    currentItems: [
      "A dimpro.hu nyilvános bemutató oldal Belépés gombja az app.dimpro.hu/login címre vezet.",
      "Az app.dimpro.hu/login DIMPRO OTP-belépést használ, majd az /account/modules modulválasztóra irányít.",
      "A dimprover.hu vagy app.dimprover.hu /login ugyanazon route DIMPROVER-változatát jeleníti meg.",
      "A license.dimpro.hu/customer külön licenckulcsos ügyfélportál, nem normál app-fiók.",
      "A license.dimpro.hu/admin külön licencadmin-belépés; innen nyílik a licencdashboard és a Fejlesztési Központ.",
      "A Drive admin előnézet ideiglenesen a licencadmin munkamenethez kötött.",
      "A projektkapu.dimpro.hu a DIMPRO Projektkapu elsődleges felhasználói kapuja; a door.dimpro.hu rövid márkadomainként készül.",
    ],
    targetItems: [
      { title: "DIMPRO nyilvános kapu", detail: "dimpro.hu: termékcsalád, csomagok, előfizetés, tájékoztatás és egyértelmű Belépés gomb.", status: "in_progress" },
      { title: "Közös felhasználói belépés", detail: "app.dimpro.hu/login: DIMPRO Account belépés, majd jogosultság alapján DIMPRO appok, Drive, Drop-kezelő vagy DIMPROVER termék megnyitása.", status: "in_progress" },
      { title: "DIMPRO Projektkapu belépés", detail: "projektkapu.dimpro.hu/login: közös DIMPRO-fiók, majd egy projekthez kötött D6 Core környezet; door.dimpro.hu 301-es átirányítás.", status: "in_progress" },
      { title: "DIMPROVER belépés", detail: "app.dimprover.hu/login megmaradhat közvetlen enterprise kapuként, de ugyanazt a közös fiók- és jogosultsági motort használja.", status: "planned" },
      { title: "DIMPRO Drive belépés", detail: "drive.dimpro.hu vagy app.dimpro.hu/drive: normál felhasználói fiókkal, nem licencadmin kulccsal.", status: "planned" },
      { title: "DIMPRO Drop belépés", detail: "drop.dimpro.hu: külső meghívott link/PIN; belső csomagkezelés normál DIMPRO-fiókkal.", status: "in_progress" },
      { title: "Licencügyfél-portál", detail: "license.dimpro.hu/customer: licenc, gép, lejárat és kapcsolattartás; később a DIMPRO Accounttal összekapcsolható, de külön szerepkör marad.", status: "completed" },
      { title: "Licencadmin", detail: "license.dimpro.hu/admin: kizárólag tulajdonosi/belső licenc-, ügyfél-, gép- és rendszeradminisztráció.", status: "completed" },
      { title: "Fejlesztési Központ", detail: "license.dimpro.hu/admin/dev: kizárólag belső fejlesztési projektek, verziók, release, szerverek, napló és rendszerstruktúra.", status: "completed" },
      { title: "Belépési oldalak tartalmi egységesítése", detail: "Minden kapun jól látszódjon, hogy normál app-, ügyféllicenc-, admin- vagy fejlesztői belépés történik.", status: "planned" },
    ],
  },
  {
    id: "license-admin",
    category: "Belső rendszer",
    title: "Licencfelület és Fejlesztési Központ szétválasztott szerepe",
    summary: "A license.dimpro.hu alatt két belső vezérlőfelület és egy ügyfélportál működik; ezeket nem szabad összekeverni a normál DIMPRO Accounttal.",
    currentItems: [
      "A /customer licenckulcsos ügyfélportál.",
      "Az /admin belépés után felületválasztó és klasszikus licencdashboard érhető el.",
      "Az /admin/dev védett Fejlesztési Központ, projekt-, verzió-, idő-, release-, napló- és értesítési funkciókkal.",
      "Az admin aloldalak ugyanazon böngészőben tárolt, szerveroldalon ellenőrzött licencadmin munkamenetet használják.",
    ],
    targetItems: [
      { title: "Licencadmin főlap", detail: "Licencek, ügyfelek, gépek, moduljogosultság, lejárat, előfizetés és számlázási admin.", status: "in_progress" },
      { title: "Fejlesztési Központ főlap", detail: "Fejlesztési projektek, verziók, munkaidő, release, szerverállapot, napló, PWA és rendszerstruktúra.", status: "completed" },
      { title: "Rendszerstruktúra működési oldal", detail: "Jelenlegi–tervezett összehasonlítás, modulhierarchia, belépési kapuk, e-mail címek és teljesítési státuszok.", status: "in_progress" },
      { title: "Többszerveres admin", detail: "A DEV és DATABASE VPS bekötése után külön állapot-, backup-, deploy- és adatbázis-migrációs kártyák.", status: "planned" },
      { title: "Ügyfélportál és Account kapcsolat", detail: "A licenckulcsos ügyféladatok később összekapcsolhatók a normál DIMPRO fiókkal, jogosultsági határok megtartásával.", status: "planned" },
    ],
  },
  {
    id: "operations",
    category: "Üzemeltetés",
    title: "Backup, monitorozás és biztonság",
    summary: "A több szerver csak egységes mentési, riasztási és hozzáférési szabályokkal biztonságos.",
    currentItems: [
      "A PROD szerveren Szerverállapot oldal, Szerverőr, PM2-, Nginx-, SSL-, tárhely- és backup-ellenőrzés működik.",
      "A fejlesztési körök előtt backup és rollback-pont készül.",
      "A szerveren több korábbi build- és backupállomány miatt rendszeres tárhelykarbantartás szükséges.",
    ],
    targetItems: [
      { title: "Háromszerveres monitorozás", detail: "PROD, DEV és DATABASE külön állapotkártyával, riasztással és erőforrásküszöbökkel.", status: "planned" },
      { title: "Külső adatbázis-backup", detail: "Napi mentés, megőrzési szabály és rendszeres visszaállítási próba másik tárhelyre.", status: "planned" },
      { title: "Külön MCP-hozzáférések", detail: "PROD és DEV külön eszköznévvel; adatbázis-hozzáférés korlátozott, naplózott műveletekkel.", status: "planned" },
      { title: "Titokkezelés", detail: "Jelszó és kulcs csak szerveroldali env/secret fájlban; csevegésben nem jelenhet meg.", status: "completed" },
      { title: "Jelenlegi szervermonitor", detail: "Szerverőr, SSL, PM2, tárhely, backup és warning felület már működik.", status: "completed" },
    ],
  },
];
