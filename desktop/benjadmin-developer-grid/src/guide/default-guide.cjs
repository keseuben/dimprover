"use strict";

const DEFAULT_USAGE_GUIDE = `BENJADMIN DEVELOPER GRID — MŰKÖDÉSI ÉS HASZNÁLATI SZABÁLYZAT

CÉL
A Developer Grid a DIMPRO / DIMPROVER fejlesztési munkatere. A négy worker-cella a fejlesztő AI-khoz tartozik, a középső BENJADMIN Fejlesztői Vezérlőpult a központi munkatér, az 05 DevminAI pedig külön segédagent. A végső döntés mindig a BenjAdminé.

1. BELÉPÉS UTÁN
- Írd be a Developer Grid helyi jelszavát.
- A négy fejlesztői cella betöltődik.
- Ez az útmutató automatikusan megjelenik középen. X-szel bezárható; Ctrl+Alt+9-cel bármikor visszahozható vagy elrejthető.
- Nézd meg a cellafejléceket: státusz, főmodul/modul, aktuális munkarész és fejlesztési fázis.
- Ha a BENJADMIN élő kapcsolat nincs párosítva, a Beállításokban párosítsd az eszközt.

2. HOGYAN INDÍTSAM A FEJLESZTÉST?
A BenjáminAI teljes értékű integrált AI kódmérnök. A napi munka központi indítása, prioritása és worker-kiosztása a BENJADMIN Central Core / Grid Orchestrator feladata.

Napi indítás minta:
„Indítsd a mai fejlesztési munkát. Ellenőrizd a DEV állapotot, az aktív és várakozó taskokat, a worktree-ket, scope-lockokat és a build-lockot. PROD DENY. Adj rövid prioritási sorrendet, majd jelezd, melyik workernek mit kell folytatnia.”

Új fejlesztés minta:
„Új feladat: [írd le közérthetően, mit szeretnél]. Kérlek bontsd fejlesztési taskokra, jelöld ki a megfelelő workert, a scope-ot, az acceptance feltételeket és a következő lépést. DEV only, PROD DENY.”

Hibajavítás minta:
„Hiba: [mit látsz, hol, mikor]. Kérlek azonosítsd az okot, jelöld ki a megfelelő workert, és készíts javítási + tesztelési tervet. PROD DENY.”

Állapotkérés minta:
„Adj rövid valós idejű státuszt: ki dolgozik, min, melyik fázisban van, mi vár rám, van-e blokk vagy build-lock.”

Leállítás / szüneteltetés minta:
„Szüneteltesd a(z) [worker/feladat] fejlesztését. Ne induljon új munka, amíg külön nem engedélyezem.”

3. MIKOR ÍRJAK KÖZVETLENÜL A WORKERNEK?
Normál esetben a BENJADMIN Central Core / Grid Orchestrator osztja ki és követi a feladatot; BenjAdmin emberként bármikor felülbírálhatja a kiosztást. A worker ChatGPT-csevegését azonban ténylegesen el kell indítani. Ha a fejlécben „INDÍTÁSRA VÁR” jelenik meg, kattints az „Indítás” gombra: a Developer Grid előkészíti a kiosztási promptot, de az elküldés továbbra is a te kézi kattintásod.

Ha kézzel kell írnod:
„Folytasd a BENJADMIN által kiosztott feladatot. Először ellenőrizd a pontos taskot, scope-ot, worktree-t és DEV állapotot. PROD DENY. Felvételkor jelezd: MUNKAFELVÉTEL: YYYY.MM.DD. HH:MM. Visszaadáskor: MUNKA VISSZAADVA: YYYY.MM.DD. HH:MM + commit + tesztek + blokkolók.”

4. WORKEREK SZEREPE
- BenjáminAI: integrált kódmérnök; full-stack, rendszerintegráció, hibajavítás, teszt, build/release-gate feladatok.
- OutminAI: kijelölt külső/partner vagy külön leválasztott fejlesztési scope kódmérnöke; csak a kiosztott területen dolgozzon.
- ÁrminAI: belső frontend, komponensek, reszponzív UI és kliensoldali alkalmazáslogika.
- JázminAI: belső backend, API, adatmodell, integráció, migrációs és backend tesztfeladatok.
- 05 DevminAI: külön fejlesztési tervező/segédagent explicit taskhoz, kontextus-előkészítéshez és kiegészítő DEV munkához. Nem emberi döntéshozó; a végső döntés BenjAdminé.

5. STÁTUSZOK JELENTÉSE
- INAKTÍV: nincs igazolt aktív munka.
- INDÍTÁSRA VÁR: a task ki van osztva, de a worker ChatGPT-csevegését még el kell indítanod.
- CHAT ELŐKÉSZÍTVE: a kiosztási prompt bekerült vagy vágólapra került; ellenőrizd és küldd el.
- AKTÍV / DOLGOZIK: igazolt aktív task vagy worker presence.
- TESZTEL / BUILD / LEZÁRÁS: az aktuális fejlesztési fázis.
- BLOKKOLVA: beavatkozás, döntés vagy külső feltétel szükséges.

Fontos: „kiosztva” nem ugyanaz, mint „dolgozik”. A valódi munkafelvételt task/session/presence jel igazolja.

6. NAPI AJÁNLOTT MUNKAMENET
1) Jelszó → Developer Grid megnyitás.
2) Olvasd el a középső útmutatót, ha szükséges.
3) Kattints a „NAPI INDÍTÁS” gombra vagy írj a BenjáminAI-nak napi indítási kérést.
4) Ellenőrizd a négy fejléc státuszát és modulját.
5) Az „INDÍTÁSRA VÁR” worker(ek)nél készítsd elő és kézzel küldd el a promptot.
6) Fejlesztés közben a cellafejlécből kövesd a munkarészt és az 1/6–6/6 fázist.
7) Ha blokk van, először BenjáminAI-nak írj; ő mondja meg, kell-e döntésed.
8) Kész munka után ellenőrizd a commit/teszt/build eredményt és kérj BenjáminAI összefoglalót.
9) PROD művelet csak külön, egyértelmű BenjAdmin engedéllyel történhet.

7. BIZTONSÁGI ÉS FEJLESZTÉSI ALAPSZABÁLYOK
- Alapértelmezés: DEV only, PROD DENY.
- PROD változtatás csak kifejezett, konkrét emberi engedéllyel.
- A workerek csak a kiosztott scope-ban dolgozhatnak.
- Párhuzamos forráskód-fejlesztés lehetséges izolált worktree-kben.
- Shared build, release, migráció, restart és cutover csak központi exclusive lock alatt fusson.
- Stale státuszt ne tekints aktuális munkafelvételnek.
- Fizikai Windows E2E-t csak akkor tekints PASS-nak, ha valóban végig lett próbálva.
- Ha bizonytalan vagy, ne találgass: kérj BenjáminAI-tól állapotellenőrzést.

8. HASZNOS GYORSBILLENTYŰK
Ctrl+Alt+1 — ÁrminAI cella
Ctrl+Alt+2 — OutminAI cella
Ctrl+Alt+3 — BenjáminAI cella
Ctrl+Alt+4 — JázminAI cella
Ctrl+Alt+5 — 05 DevminAI segédagent
Ctrl+Alt+6 — 4 / 2 cellás nézet
Ctrl+Alt+9 — Szabályzat és használati útmutató nyitása / bezárása
Ctrl+Alt+N — Munkahelyi / néma mód ki- és bekapcsolása
Ctrl+Alt+Z — Developer Grid zárolása
Ctrl+Alt+Space — teljes Developer Grid tálcára / vissza
Ctrl + / Ctrl - / Ctrl 0 — közös ChatGPT zoom

9. GLOBÁLIS BEÁLLÍTÁSOK ÉS MUNKAHELYI / NÉMA MÓD
- A fő Developer Grid fejléc ⚙ gombja és a 05 DevminAI ablak ⚙ gombja ugyanazt a globális beállításpanelt nyitja.
- A globális beállítások a teljes 01–05 munkaterületre vonatkoznak.
- A „Munkahelyi / néma mód” minden hallható Developer Grid-jelzést letilt: nincs hangjelzés és nincs magyar felolvasás.
- A Windows értesítés, vizuális toast és tálcavillogás ettől külön továbbra is bekapcsolva maradhat.
- Ha a néma mód aktív, a fejlécben „NÉMA MÓD” jelzés látható.
- Az egyedi hang- és felolvasási kapcsolók beállítása megmarad, így a néma mód kikapcsolásakor nem kell őket újra beállítani.

10. A 6 LÉPCSŐS FEJLESZTÉSI FÁZIS RÉSZLETESEN
1/6 · ELEMZÉS
- A feladat pontosítása: mit kell megoldani és mit nem.
- Projekt, főmodul, modul, scope, worktree és branch ellenőrzése.
- Függőségek, kockázatok, adat-/biztonsági hatások és blokkolók feltárása.
- Acceptance feltételek és tesztelési terv rögzítése.
- Ebben a fázisban még nem szabad vakon kódolni; előbb a végrehajtási keretet kell tisztázni.

2/6 · FEJLESZTÉS
- A jóváhagyott DEV scope-on belüli tényleges kód-, konfiguráció- vagy dokumentációmódosítás.
- A worker csak a kijelölt worktree-ben és scope-ban dolgozhat.
- Párhuzamos forrásszerkesztés megengedett, ha a scope-ok nem ütköznek.
- PROD továbbra is DENY, hacsak BenjAdmin külön, egyértelműen nem engedélyezi.

3/6 · TESZTELÉS
- Syntax/lint/typecheck és a feladathoz tartozó unit, contract vagy acceptance tesztek futtatása.
- Regresszió ellenőrzése: a javítás ne törje el a már működő részeket.
- Szükség esetén API, adatbázis, browser vagy fizikai Windows E2E ellenőrzés.
- A worker csak valós teszteredményt jelenthet PASS-nak.

4/6 · ELLENŐRZÉS
- A diff, scope, kódminőség, hibakezelés és biztonsági kockázatok felülvizsgálata.
- Itt kerülhet sor V.Guard-AI, M.Forge-AI vagy más független review-kapura.
- Eredmény lehet PASS, PASS WITH NOTES / megjegyzéssel, CHANGES REQUIRED / javítás szükséges vagy BLOCKED.
- Ha a reviewer maga javította a kódot, azon a változáson új független ellenőrzés szükséges.

5/6 · BUILD / KIADÁS
- FULL BUILD kizárólag a Central Core BUILD Runner Pool kapuján indulhat: BUILD01 elsődleges, BUILD02 fallback, egyébként QUEUED.
- A worker ChatGPT-cella nem indíthat build:raw, közvetlen Next buildet vagy DEV-host FULL BUILD fallbacket.
- Release, migráció, restart vagy cutover külön központi exclusive-operation gate; ezek nem a build runner feladatai.
- Kötelező a BUILD_ID, artifact/hash és szükség szerinti smoke evidence visszaellenőrzése.
- Párhuzamos build vagy lock-megkerülés tilos.
- PROD továbbra is DENY; a Developer Grid v0.1.25 ebből a folyamatból PROD-műveletet nem indít.

6/6 · LEZÁRÁS
- Commit(ok), teszteredmények, build/hash adatok, handoff és dokumentáció rögzítése.
- A worker jelzi: MUNKA VISSZAADVA: YYYY.MM.DD. HH:MM.
- Fel kell sorolni a kész eredményt, a még nyitott blokkolókat és a következő emberi/technikai lépést.
- Fizikai E2E csak akkor zárható PASS-ra, ha valóban megtörtént.
- A lezárás után a task/presence/lock állapotnak is konzisztensnek kell lennie.

11. SAJÁT MEGJEGYZÉSEK
Ezt a dokumentumot a „Szerkesztés” gombbal bármikor kiegészítheted. A „Mentés” a helyi Developer Grid konfigurációban tárolja a módosított szöveget. Az „Alap visszaállítása” az eredeti BENJADMIN útmutatót tölti vissza; csak mentés után válik véglegessé.
`;

module.exports = { DEFAULT_USAGE_GUIDE };
