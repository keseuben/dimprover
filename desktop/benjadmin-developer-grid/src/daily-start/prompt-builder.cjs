"use strict";

function pad(value) { return String(value).padStart(2, "0"); }

function localDateParts(now = new Date()) {
  return {
    yy: pad(now.getFullYear() % 100),
    yyyy: String(now.getFullYear()),
    mm: pad(now.getMonth() + 1),
    dd: pad(now.getDate())
  };
}

function dailyChatTitle(slot, name, now = new Date(), description = "") {
  const { yy, mm, dd } = localDateParts(now);
  const base = `${yy}${mm}${dd}_${slot} ${name}`;
  return description ? `${base} – ${description}` : base;
}

function buildBenAiDailyStartPrompt(now = new Date()) {
  const { yyyy, mm, dd } = localDateParts(now);
  const titles = [
    dailyChatTitle(1, "BenAI", now, "napi koordináció"),
    dailyChatTitle(2, "OutminAI", now, "fejlesztés"),
    dailyChatTitle(3, "ÁrminAI", now, "fejlesztés"),
    dailyChatTitle(4, "JázminAI", now, "fejlesztés"),
    dailyChatTitle(5, "BenjAdmin", now, "általános fejlesztések megbeszélése")
  ];
  return [
    "BenAI, kezdd a mai DIMPRO / DIMPROVER / BENJADMIN fejlesztési nap koordinációját.",
    "A napi csevegések végleges sorrendje és címsémája:",
    ...titles.map((title) => `- ${title}`),
    "BenjAdmin a végső emberi döntéshozó; worker feladatot csak jóváhagyott prioritás alapján indíts.",
    "",
    "REGGELI ÁLLAPOTFELVÉTEL:",
    "1. Ellenőrizd a BENJADMIN DEV aktuális task, worker-session és presence állapotát.",
    "2. Ellenőrizd a DEV git HEAD-eket, brancheket, worktree-ket, tisztaságot és az integration állapotot.",
    "3. Ellenőrizd a központi build/release/migration/restart lockot és a futó műveleteket.",
    "4. Ellenőrizd a PM2 DEV runtime-ot és a legutóbbi kiadott DEV candidate-et.",
    "5. Olvasd el, ha léteznek: /srv/dimpro-dev/handoffs/BENAI_LATEST.md, /srv/dimpro-dev/handoffs/OUTMINAI_LATEST.md, /srv/dimpro-dev/handoffs/ARMINAI_LATEST.md, /srv/dimpro-dev/handoffs/JAZMINAI_LATEST.md.",
    "6. Ellenőrizd az előző munkanapról nyitva maradt, blokkolt, visszaadott vagy acceptance-re váró feladatokat.",
    "7. Készíts rövid napi prioritási és kiosztási javaslatot ebben a fix sorrendben: 01 BenAI, 02 OutminAI, 03 ÁrminAI, 04 JázminAI. ÁrminAI csak akkor kapjon munkát, ha BenjAdmin külön feloldotta a szüneteltetését.",
    "8. A 05 BenjAdmin csevegés általános fejlesztési megbeszélésre, döntésekre és kódolást segítő leírásokra szolgál.",
    "",
    "Ne állítsd, hogy egy worker dolgozik, amíg nincs tényleges MUNKAFELVÉTEL/presence bizonyíték. A kiosztva/várakozik és a ténylegesen felvett munka külön állapot.",
    "Shared build/release/migration/restart/cutover kizárólag központi exclusive lock alatt történhet.",
    "PROD DENY: production hozzáférés, módosítás, deploy, restart, migráció vagy adatváltoztatás tilos.",
    "",
    `Első státuszsor: MUNKAFELVÉTEL: ${yyyy}.${mm}.${dd}. HH:MM`,
    "A napi koordináció visszaadásakor: MUNKA VISSZAADVA: YYYY.MM.DD. HH:MM + eltelt idő + prioritások + worker állapotok + blokkolók + következő lépés.",
    "A koordináció lezárásakor frissítsd a /srv/dimpro-dev/handoffs/BENAI_LATEST.md handoffot is.",
    "",
    "Most végezd el az állapotfelvételt, majd kérj BenjAdmin jóváhagyást a napi kiosztás előtt."
  ].join("\n");
}

module.exports = { localDateParts, dailyChatTitle, buildBenAiDailyStartPrompt };
