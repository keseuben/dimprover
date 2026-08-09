# DROP 1.2.11 – PWA alkalmazásadatok és frissítési állapot

**Fejlesztés:** 2026-08-09  
**Állapot:** éles private-pilot release, GA=false  
**Fejlesztési Központ:** `version_28bf226a-70b`  
**Kiinduló éles release:** `.next-v1210-release-final`  
**Kiinduló BUILD_ID:** `YtYjsCjg5WLQFundZIY8j`  
**Éles release:** `.next-v1211-release-final`  
**BUILD_ID:** `XFvAsUHhS9ZELCepVr65m`  
**Közvetlen rollback cél:** `.next-v1210-release-final`

## Cél

A telepített DIMPRO Drop mobil PWA-ban a felhasználó az alkalmazásmenüben közvetlenül lássa, melyik verzió fut, mikor frissült, milyen alkalmazástípust használ, és naprakész-e. A kézi frissítéskeresés ugyanazt a service-worker update motort használja, mint az automatikus ellenőrzés.

## Mobil alkalmazásadat blokk

A mobil `Menü` felület új információs kártyája:

- `DIMPRO Drop · v1.2.11`;
- `Frissítve: 2026.08.09. · Telepített webalkalmazás (PWA)`;
- állapot: `Naprakész`, `Frissítés elérhető`, `Ellenőrzés…` vagy `Offline`;
- `Frissítés keresése` gomb;
- elérhető új service worker esetén a korábbi `Frissítés` telepítési folyamat változatlanul megmarad.

Az információ közös kliensoldali release-forrásból érkezik: `components/drop/dropPwaReleaseInfo.ts`.

## PWA update motor

- service worker verzió: `DROP 1.2.11`;
- cache: `dimpro-drop-static-v1211`;
- `updateViaCache: "none"` megmarad;
- automatikus update-check appindításkor, foreground/pageshow/online eseménynél megmarad;
- kézi ellenőrzés force módban közvetlen `registration.update()` hívást indít;
- ellenőrzés közben külön `Ellenőrzés…` állapot látható;
- offline állapotban a kézi ellenőrző gomb tiltott.

## Validáció

- PWA alkalmazásadat contract: **19/19 PASS**;
- TypeScript: **PASS**;
- célzott ESLint: **PASS**;
- teljes lint: **0 error / 108 meglévő warning**;
- aktív Drop-forrás verziókonzisztencia: **PASS**, 1.2.10 runtime hivatkozás nincs.

- végleges candidate build: **PASS**, BUILD_ID `XFvAsUHhS9ZELCepVr65m`;
- standalone asset ellenőrzés: **141/141 PASS**;
- candidate browser E2E: **41/41 PASS**;
- candidate teljes S3/ClamAV/finalize/SMTP/album/PDF/TXT/ZIP E2E: **75/75 PASS**;
- az első teljes candidate futásnál egyszeri Next belső rewrite `ECONNRESET` jelentkezett a letöltőalbum megnyitásakor; a candidate végig egészséges maradt, a közvetlen útvonalpróba PASS, majd változtatás nélküli teljes újrafuttatás **75/75 PASS** lett;
- production browser E2E: **41/41 PASS**;
- production teljes infrastruktúra E2E: **75/75 PASS**;
- Identity Core: **12/12 READY**;
- valós Object Storage tesztobjektum-takarítás: **11/11 PASS**;
- tesztcsomag- és tesztfelhasználó-maradvány: **0**;
- élő service worker: `DROP 1.2.11`;
- élő PWA cache: `dimpro-drop-static-v1211`;
- az aktív Drop API release-jelölések egységesen `DROP 1.2.11` értékre álltak;
- production pointer: `.next-v1211-release-final`;
- rollback: `.next-v1210-release-final`.

## Élesítési eredmény

A DROP 1.2.11 2026-08-09-én éles private-pilot kiadásként aktiválva. A PM2 `dimprover` folyamat online, a live HTTPS health szerint core, Send, e-mail, Identity, ClamAV, PWA és PWA update readiness READY. A kiadás továbbra sem GA.
