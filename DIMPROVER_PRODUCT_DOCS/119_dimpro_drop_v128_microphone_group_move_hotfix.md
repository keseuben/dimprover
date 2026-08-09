# DROP 1.2.8 – mikrofonengedély és képcsoport-áthelyezés hotfix

**Kiadás:** 2026-08-09  
**Állapot:** éles private-pilot release, GA=false  
**Release:** `.next-v128-release-final`  
**BUILD_ID:** `9UEmGZhWCN3pgyR6BFvs7`  
**Rollback:** `.next-v127-release-final`  
**Fejlesztési Központ:** `version_e6666fab-ee0`

## Javítások

- A Drop host `Permissions-Policy` szabálya `microphone=(self)`, ezért a saját Drop oldal kérhet mikrofonengedélyt.
- A diktálás indítása előtt explicit `getUserMedia({ audio: true })` engedélykérés fut, majd a kapott stream trackjei azonnal leállnak; a DIMPRO továbbra sem tárol hangfájlt a Gyors KépSend device-diktálásnál.
- A frissen létrehozott Gyors KépSend workflow response azonnal visszaadja az `allowQuickVoiceNote` és `quickVoiceSecondsPerNote` mezőket, ezért a képkártya Diktálás gombja feltöltés előtt is megjelenik.
- Minden képkártyán külön Csoport választó van. Várakozó és már feltöltött/virusellenőrzés alatt álló kép is áthelyezhető másik logikai csoportba a véglegesítésig.
- Feltöltött fájlnál az áthelyezés szerveroldalon frissíti a `group_id` értéket, és a rendezett megjelenítési fájlnév is módosítható.
- A `Csoport nélkül` rendszerkategória nem átnevezhető, de az ott lévő képekből egy lépésben új valódi csoport hozható létre.
- A korábbi `Megnevezés` mező egyértelműbb `Kép rövid neve / fájlnév-kiegészítés` feliratot kapott.

## Validáció

- TypeScript: PASS.
- teljes ESLint: 0 error / 108 meglévő warning.
- DROP 1.2.8 contract: 28/28 PASS.
- candidate böngészős Send/licenc/mikrofon E2E: 35/35 PASS.
- teljes valós S3 → ClamAV → csoportáthelyezés → komment → finalize → e-mail → album → PDF/TXT/ZIP E2E: 61/61 PASS.
- immutable release health: DROP 1.2.8, `coreReady=true`.
- production böngészős E2E: 35/35 PASS.
- production Identity Core: 12/12 READY.
- production `/`, `/send`, `/open`, Drive: HTTP 200; Projektkapu érvényes 307 átirányítás.
- production `Permissions-Policy`: `microphone=(self)`.
- tesztmaradvány: 0.

## Aktiválás

Az aktiválás a központi release pointert és a PM2 `NEXT_DIST_DIR` értéket egyszerre váltotta `.next-v128-release-final` értékre. Automatikus rollback cél: `.next-v127-release-final`.
