export type CommandTemplate = {
  id: string;
  category: string;
  title: string;
  description: string;
  text: string;
  dangerous?: boolean;
  tags: string[];
};

export const COMMAND_LIBRARY: CommandTemplate[] = [
  {
    id: "start-read-first",
    category: "Indítás",
    title: "START · állapotfelmérés",
    description: "Először csak olvassa be a környezetet, a dokumentációt és az aktuális munkát.",
    text: "START. Először végezz állapotfelmérést: ellenőrizd a DEV szervert, a Git HEAD-et és worktree-t, az érintett dokumentációt, az aktív task/session/scope állapotot és a legutóbbi buildet. Ne módosíts semmit addig, amíg a cél és az ütközésmentes fejlesztési scope nem egyértelmű. PROD kizárólag read-only.",
    tags: ["start", "read-only", "audit"],
  },
  {
    id: "dev-start",
    category: "Indítás",
    title: "DEV START · fejlesztés indítása",
    description: "Szabványos BENJADMIN DEV fejlesztési ciklus.",
    text: "DEV START. Folytasd kizárólag DEV környezetben. Kötelező sorrend: státusz -> érintett fájlok és kapcsolódó dokumentáció -> backup/checkpoint -> kódmódosítás -> DIMPROVER_PRODUCT_DOCS frissítés -> npx tsc --noEmit -> npm run lint -> célzott acceptance -> npm run build -> koordinált DEV restart -> smoke -> desktop/tablet/mobil ellenőrzés -> Git checkpoint és rövid átadás. PROD-ot ne módosítsd külön explicit jóváhagyás nélkül.",
    tags: ["dev", "backup", "build"],
  },
  {
    id: "continue-checkpoint",
    category: "Folytatás",
    title: "Folytatás a legutóbbi checkpointtól",
    description: "A már rögzített fejlesztési állapot folytatása, visszakérdezés nélkül.",
    text: "Folytasd a fejlesztést a legutóbbi lezárt DEV checkpointtól. Előbb ellenőrizd a jelenlegi Git/PM2/build állapotot és az esetleges párhuzamos módosításokat, majd a dokumentált következő lépést végezd. Az általános folytasd nem jelent PROD-jóváhagyást.",
    tags: ["continue", "checkpoint"],
  },
  {
    id: "status",
    category: "Állapotkérés",
    title: "Fejlesztési állapot",
    description: "Mi kész, mi fut, mi blokkolt, mi következik.",
    text: "Adj rövid, de konkrét fejlesztési állapotot: 1) mi készült el, 2) mi fut most, 3) milyen acceptance/build eredmények vannak, 4) van-e blocker vagy döntési pont, 5) mi a következő három lépés, 6) melyik fejlesztési fázisnál tartunk. Közben a biztonságosan folytatható DEV munkát folytasd.",
    tags: ["status", "progress"],
  },
  {
    id: "safe-stop",
    category: "Szünet / leállítás",
    title: "Biztonságos checkpoint és megállás",
    description: "Gép kikapcsolása vagy hosszabb szünet előtt.",
    text: "Állj meg a következő biztonságos DEV checkpointnál. Ne kezdj új hosszú buildet, migrációt vagy provisioning műveletet. Mentsd a jelenlegi állapotot, futtasd a szükséges gyors ellenőrzéseket, dokumentáld a pontos folytatási pontot, és írd le, hogy a gép leállítható-e.",
    tags: ["stop", "checkpoint"],
  },
  {
    id: "readonly-audit",
    category: "Audit / read-only",
    title: "Csak audit · semmit ne módosíts",
    description: "Biztonságos vizsgálat írás nélkül.",
    text: "Végezz kizárólag read-only auditot. Ne módosíts fájlt, adatbázist, szolgáltatást, környezeti változót, PM2 folyamatot vagy Git állapotot. Írd le a talált állapotot, kockázatokat és a javasolt következő lépéseket. PROD maradjon teljesen érintetlen.",
    tags: ["audit", "read-only"],
  },
  {
    id: "close-dev-cycle",
    category: "Build / teszt / restart",
    title: "DEV lezáró ellenőrzési kör",
    description: "TypeScript, lint, célzott teszt, build, restart és smoke.",
    text: "Zárd le a jelenlegi DEV fejlesztési kört a kötelező kapukkal: npx tsc --noEmit; npm run lint; érintett célzott acceptance; npm run build; siker esetén koordinált PM2 DEV restart --update-env; PM2 save; smoke; érintett route-ok és responsive felület ellenőrzése. Hiba esetén ne élesíts és ne rejtsd el a hibát.",
    tags: ["tsc", "lint", "build", "smoke"],
  },
  {
    id: "docs",
    category: "Dokumentáció",
    title: "Dokumentáció frissítése",
    description: "A kóddal együtt a termékdokumentációt is rögzíti.",
    text: "Ellenőrizd, hogy a mostani módosítás dokumentációköteles-e. Új funkció, modul, adatmező, jogosultság, export, UI működési szabály, responsive szabály, verzió vagy jelentős hibajavítás esetén frissítsd a kapcsolódó DIMPROVER_PRODUCT_DOCS fájlt. A dokumentáció tartalmazza a célt, érintett fájlokat, biztonsági szabályokat, teszteredményeket, buildet és folytatási pontot.",
    tags: ["docs", "handoff"],
  },
  {
    id: "new-chat-handoff",
    category: "Új csevegés átadás",
    title: "Komplett új csevegés átadó",
    description: "A következő ChatGPT fejlesztési csevegés számára.",
    text: "Készíts új csevegésbe közvetlenül bemásolható teljes fejlesztési átadót. Tartalmazza: normatív dokumentumok, környezetek és biztonsági szabályok, aktuális worktree/branch/HEAD/build/PM2 állapot, elkészült funkciók és acceptance eredmények, ismert korlátok, érintetlen PROD állapot, következő konkrét fejlesztési lépés és kötelező fejlesztési ciklus. Titkot ne másolj az átadóba.",
    tags: ["handoff", "new-chat"],
  },
  {
    id: "drive",
    category: "Modul sablonok",
    title: "DIMPRO Drive fejlesztés",
    description: "A közös Drive Core és Workspace motorra épülő fejlesztés.",
    text: "Folytasd a DIMPRO Drive fejlesztését DEV-en a meglévő Drive Core / Workspace motor újrahasznosításával. Ne építs párhuzamos fájlmotort. Ellenőrizd a projektjogosultságot, privát S3/SHA-256 láncot, közös Workspace komponenst, Projektkapu adaptert és a Drive Desktop kompatibilitást. A változtatás után dokumentáció, tsc, lint, célzott Drive acceptance, build, DEV smoke és responsive ellenőrzés kötelező.",
    tags: ["drive", "workspace"],
  },
  {
    id: "drop",
    category: "Modul sablonok",
    title: "DIMPRO Drop fejlesztés",
    description: "DROP modul biztonságos DEV fejlesztési sablon.",
    text: "Folytasd a DIMPRO Drop fejlesztését kizárólag DEV-en. Őrizd meg a központi Identity Core, upload intent/quarantine, retention, Drive archive és e-mail biztonsági szerződéseket. Mobil/iOS kompatibilitás és HEIC feltöltés ellenőrzendő. Minden módosítás után célzott Drop acceptance, tsc, lint, build és DEV smoke szükséges.",
    tags: ["drop", "upload"],
  },
  {
    id: "project-gate",
    category: "Modul sablonok",
    title: "DIMPRO Projektkapu fejlesztés",
    description: "Központi projektadatmodell és közös modulmotorok megtartásával.",
    text: "Folytasd a DIMPRO Projektkapu fejlesztését DEV-en. A webes Projektkapu maradjon elsődleges hivatalos felület, használja a közös Project Core/Drive/Calendar/Dialog/Decide/Diary motorokat, és ne hozzon létre párhuzamos adattárat. Az UI igazodjon a DIMPRO Drive tiszta felületéhez, a lebegő bal board ne szűkítse a munkateret.",
    tags: ["projektkapu", "project-core"],
  },
  {
    id: "benjadmin-console",
    category: "Modul sablonok",
    title: "BENJADMIN Fejlesztői Konzol",
    description: "A napi ember-AI együttműködési felület fejlesztési szabálya.",
    text: "Folytasd a BENJADMIN Fejlesztői Konzol V1 fejlesztését a jóváhagyott specifikáció szerint. BENJADMIN az emberi vezető, Ben-AI a koordinátor, Ármin-AI bal, Jázmin-AI jobb, Outmin-AI külön partner sáv. Kötelező a hexagon avatar, villogásmentes másodperc-pontos frissítés, ChatGPT Parancstár, Fejlesztési Tár, Világos/Sötét/Sunlight mód, PWA és Ctrl+Alt+Space privacy cover. A B3/B3.1/B3.2 motorokat használd, új párhuzamos engine ne készüljön.",
    tags: ["benjadmin", "console"],
  },
  {
    id: "release-audit",
    category: "Release",
    title: "Release candidate audit",
    description: "Élesítés nélküli release-ellenőrzés.",
    text: "Készíts release candidate auditot DEV/STAGING oldalon: Git állapot, dokumentáció, tsc, lint, célzott acceptance, production build, smoke, rollbackpont és ismert kockázatok. PROD deploy/restart/migration ne történjen. A végén add meg, hogy release-ready vagy blocked.",
    tags: ["release", "audit"],
  },
  {
    id: "prod-explicit",
    category: "PROD művelet",
    title: "PROD explicit műveleti sablon",
    description: "Csak konkrét, külön megnevezett éles művelethez. Másolás előtt megerősítés szükséges.",
    text: "PROD MŰVELET - KÜLÖN EXPLICIT JÓVÁHAGYÁS. A következő egyetlen konkrét éles műveletet engedélyezem: [PONTOS MŰVELET]. Előtte kötelező read-only állapotfelmérés, backup/rollbackpont, DEV/STAGING acceptance és release-gate ellenőrzés. A jóváhagyás kizárólag a megnevezett műveletre érvényes; más PROD írás, migráció, restart vagy deploy nem engedélyezett.",
    dangerous: true,
    tags: ["prod", "approval", "danger"],
  },
];
