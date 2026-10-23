# DIMPRO Drive – fejlesztési ütemterv V1.0

**Dátum:** 2026.10.23. | **Terület:** DIMPRO Drive web, Saját/Projekt Drive, Transfer Center, Drive Desktop, Drop-integráció.
**Módszer:** a forrás, a BUILD01, a futó DEV, a hitelesített E2E és a PROD külön státusz.
**Alapszabály:** PROD DENY, jelenleg a publikus `drive.dev.dimpro.hu` V0.9.52. A V0.9.53–60 forrás- és buildelőrehaladás NEM azonos az aktív böngészős működéssel.
**Ütemezés:** célzott, feltételes időablakok; nem vállalt automatikus végrehajtás, nem garantált határidő. Az infrastruktúra, S3/AV és jóváhagyások szükség szerint módosíthatják.

## 1. Készültségi jelmagyarázat

| Kód | Jelentés |
| --- | --- |
| KÉSZ FORRÁS | Kód/SQL és egyes contract-tesztek elkészültek, de nem feltétlenül futnak a publikus DEV-ben |
| BUILD PASS | Ellenőrzött standalone BUILD01 csomag elkészült |
| DEV E2E PASS | Valós, hitelesített böngésző / SQL / S3 / vírusvizsgálat teszt igazolt |
| DEV PILOT | Valós hozzáférésű, engedélyezett DEV felületre aktiválva |
| BACKLOG | Még fejlesztendő |
| BLOCKED | Feltétel, audit vagy jóváhagyás hiányzik |

## 2. Kritikus főütemterv – személyes feltöltés

| Fázis / célablak | Verzió / prioritás | Részfeladat | Elkészülés definíciója és függőségek |
| --- | --- | --- | --- |
| 2026.10.23–10.26 | **V0.9.60 / P0** | V010/V011 PostgreSQL-migrációk teljes izolált migrációs és kvótatesztje, hiba/rollback próba; roadmap | PGlite PASS; 2 USER / quota / RLS / folder FK / idempotency teszt; valódi párhuzamos DB-verseny továbbra külön |
| 2026.10.27–11.02 | **V0.9.61 / P0** | A már megírt V0.9.54–56 közvetlen személyes feltöltés valódi **16/17/99/100/101 MiB** DEV próbája, 100–500 szintetikus fotós batch, ClamAV, S3 SHA, kvóta, mappa, leállítás | Izolált runtime jogosult indítása, nginx/proxy, hitelesített böngésző, EICAR kizárás, nem érint éles ügyféladatot; explicit DEV activation permission szükséges |
| 2026.11.03–11.09 | **V0.9.62 / P0** | 100 MiB/fájl személyes DEV-pilot stabilizálás, Transfer Center összesített queue/hiba/jóváhagyott állapot, súgó | 500 fotó egy kijelöléssel, valós progress, jogosultság, E2E PASS, release rollback; 100 MiB pilothatár nem vár az 5 GiB scannerre |
| 2026.11.03–11.16 | **V0.9.63 / P0** | 5 GiB scanner architektúra és erőforrásfelmérés: izolált streaming scan worker, karantén, timeout és teljes fájl hash | Teljes objektum AV proof, workerterhelés, ClamAV korlát/konfiguráció teszt; **darabos vizsgálat nem elegendő** |
| 2026.11.10–11.23 | **V0.9.64 / P0** | Személyes USER multipart tranzakciós kvótafoglalás, versenyteszt, karanténból atomikus CLEAN/ref véglegesítés; ABORTING/COMPLETING reconciler dry-run | V010/V011 külön migrációs jóváhagyás, DB/S3 izolált E2E; tilos kvótát felszabadítani bizonytalan S3 státusznál |
| 2026.11.17–12.06 | **V0.9.65–66 / P1** | Böngészőben megőrzött 5 GiB multipart checkpoint / szakaszok újraküldése / szünet-folytatás / közös Transfer Center, újranyitott böngésző | 1–5 GiB fájl, megszakadt hálózat, 5–100 GB körüli teljes batch stressz / kliens memóriakorlát kontroll; adatok csak USER ownership alatt |
| 2026.12.07–12.20 | **V0.9.67 / P0 release gate** | 100 MiB + 5 GiB külön acceptance, próbafelhasználók, szimulált S3/CORS/AV hibák, rollback, jogosultsági audit | DEV E2E és security-gate minden ponton PASS; ettől függ csak az 5 GiB-os DEV pilot |
| 2026.12.21–2027.01.10 | **V0.9.68 / P1** | Felhasználói nagyfájl UX és súgó: 500 fájlos batch/drag&drop mappa, aktív/függő/karantén állapotok, hiba utáni folytatás, fotó- és tervfájl-típusok | Browser acceptance laptop/tablet/mobil, már bizonyított működés dokumentálva |

**Jelenlegi tényállapot:** V0.9.54 16 MiB → V0.9.55 500 fájlos kijelölés → V0.9.56 100 MiB/fájl staging stream → V0.9.57 5 GiB policy/DB tervezet → V0.9.58 USER multipart API → V0.9.59 quota/reconcile SOURCE. V0.9.60 izolált PGlite teszt. Ezek a funkciók még nincsenek együtt böngészőben aktiválva.

## 3. A már meglévő Drive munkafolyamatok végellenőrzése

| Ütemezési ablak | Prioritás | Feladat | Megjegyzés |
| --- | --- | --- | --- |
| 2026.11.02–11.15 | P0 | Saját és Projekt Drive teljes szerepkör/ACL/mappavédelem, külsős meghívók, név/profil, tartalomhozzáférés regresszió | Sok funkció már létezik; **nem újrafejlesztés**, hanem hitelesített owner/manager/contributor/reviewer/viewer E2E |
| 2026.11.09–11.22 | P1 | Egyszerű, Mérnöki és Tervellenőrzés nézet; státuszsor-színezés, felület reszponzivitása, mappafa, inline mappa, Commander | Meglévő UX szabályok szerint QA és hiánypótlás |
| 2026.11.16–11.29 | P1 | CsomagBOX, Kedvencek, listák, jóváhagyási folyamat, dokumentumverzió/revízió, auditnapló, PDF/ZIP előnézet | Fájlstátusz és immutable forrásőrzés |
| 2026.11.23–12.06 | P1 | ZIP export, dokumentációjegyzék/manifest, SHA-256, verzió/revízió, stabil RövidNév export-alias, történeti tervcsomag | Végleges exportnév séma: `<Tervszám>_<RövidNév>_V<verzió>_R<revízió>_<státusz>.<ext>`; az eredeti objektum nem változik |
| 2026.12.07–12.20 | P1 | Saját Drive még inaktív extra workflow-k: Új verzió, Új revízió, teljes mappa ZIP, formális kiadás (jogosultságfüggő) | Csak ott vezessük be, ahol személyes és projektműködés üzletileg indokolt |
| 2027.01.04–01.24 | P1 | Drop → projekt Drive beérkező → karantén → tartós archiválás / projekt automatikus bootstrap / Drop csomagstátusz | Végponttól végpontig idempotens és dokumentált; Drop staging takarítás külön safe delete |

## 4. Drive Desktop és integrációs ütem

| Célablak | Prioritás | Feladat | Kapcsolat |
| --- | --- | --- | --- |
| 2026.11.02–11.22 | P1 | Drive Desktop V0.1.9 Windows EXE/telepítő, első letöltés indítófelület, mappaválasztó ablak, alapértelmezett célmappa későbbi módosítása | Windows kliens – **külön** a teljes DIMPRO Fájlműhelytől |
| 2026.11.23–12.13 | P1 | Fájlmegnyitás natív Windows programmal, lokális munkafájl-index, visszamentés = kontrollált új verzió, hibakezelés/log | PDF/Excel/JPG meglévő pilot tapasztalatok; a szerkesztés ne írja felül automatikusan a szerveres immutable eredetit |
| 2027.01.11–02.07 | P2 | Szelektív kézi szinkron, verziókonfliktus-figyelmeztetés, kétoldali összevetés, állapotjelző, offline várólista | 5 GiB/resume és stabil Drive Desktop pilot után |
| 2027.02–03 | P2 | SmartSync / automatikus háttérszinkron koncepció és fokozatos prototípus, verzióütközés és offline biztonság | Nem a webes Drive MVP része; csak külön scope / audit / erőforrás |
| 2027.01–02 | P2 | DIMPRO Drive Drop és Értekezleti/DokuBOX projektcsomag-integráció | Közös DocumentViewer/Preview Engine és jól definiált jogosultságok |
| 2027.02–03 | P2 | HEIC / képfeltöltés optimalizálás, tömeges ZIP, EXIF/GPS adatvédelem, eredetifájl-kezelés | Fotó-workflow opcionális; DWG, DXF, IFC, PDF eredeti bájtsorozat nem módosul |

## 5. Kiadási kapuk és STOP-szabályok

1. **G0 – Forrás/ág:** authoritative Git branch és commit egyezik; külön UI/DB/S3 scope, dokumentált változás.
2. **G1 – QA:** TypeScript, ESLint, v0.9.50+ regresszió, owner/ACL, quota, scanner tests PASS.
3. **G2 – BUILD01:** hivatalos runner, build SHA-256, ellenőrzött DEV artifact.
4. **G3 – Runtime:** izolált, nem publikus DEV candidate, központi AUTH, teljes DEV/PROD adatforrás-szétválasztás, PM2/nginx rollback gyakorlat.
5. **G4 – DB:** izolált PGlite + *valódi többkapcsolatos PostgreSQL versenyteszt*; migráció csak kijelölt, jóváhagyott DEV DB-re, dokumentált rollback.
6. **G5 – AV/S3:** fájlonként kötelező teljes vírusvizsgálat és SHA-256; soha nem elég az S3 ETag vagy a részenkénti scan; karanténból csak explicit auditált CLEAN transition.
7. **G6 – Browser:** hitelesített 50/100/500 fotós, 16–100 MiB és 1–5 GiB próba, hálózatvesztés, böngésző újranyitás, abort/expiry, quota race, idegen USER tiltás.
8. **G7 – Engedély:** külön DEV aktiválási jóváhagyás; rollback online marad.
9. **G8 – PROD:** **DENY**, csak külön, későbbi formális release-döntéssel kerülhet éles rendszerre.

## 6. Szerepek és követés

- **BenjAdmin:** üzleti/scope döntés, felhasználói pilot és kiadási jóváhagyás.
- **BenjáminAI / ÁrminAI / JázminAI:** fejlesztés, teszt, dokumentáció, hibajegyzék és gate bizonyítékok; a meglévő MCP-n, nem automatikus PROD deploy.
- **Build01/Build02:** ellenőrzött build; DEV candidate és rollback külön.
- **Mérőszámok:** regressziós PASS, S3/AV CLEAN bizonyíték, quota anomaly 0, elveszett/duplikált feltöltés 0, CPU/RAM/disk terhelés, E2E pass rate, sikeres resume, magyar nyelvű teljes súgó lefedettség.

**Prioritási döntés:** előbb legyen egy valóban használható, 500 fájlos és 100 MiB/fájl-os személyes Drive DEV pilot, ne várjon a több GB-os scanner elkészültére. Az 5 GiB-ot a megfelelő infrastruktúra és karantén/kvóta atomikus transzfer tesztjei után szabad aktiválni.

**Tervezési pontosság:** a fenti dátumok céltartományok, nem vállalt határidők. Ha egy kapu NO-GO, a következő publikus rollout tolódik; a forrásfejlesztés párhuzamosan továbbhaladhat. Az ütemterv a jelenlegi DIMPRO Drive fejlesztési tervre vonatkozik, nem a teljes DIMPRO platform valamennyi moduljára.

## V0.9.61 tényállapot-frissítés (2026.10.23.)

Az előirányzott v0.9.61 időablak **részben előrehaladt**: valós 1/17/100 MiB
ClamAV scanner próba és ártalmatlan EICAR blokkolás PASS, 2505 referencia
tárhelyösszesítési hibájának javítása és 16 szerződéses/regressziós teszt PASS.
A DEV személyes upload runtime, S3/DB/böngészős E2E és a 500 fotós felhasználói
pilot **nem készült el**; ezek a V0.9.61–62 kiadási kapui.

## V0.9.62 tényállapot-frissítés (2026.10.23.)

A 100 MiB-os személyes pilot előfeltételei tovább erősödtek: hibás/
csonka kvótalista fail-closed, stabil per-task request UUID,
bizonytalan 5xx upload-állapot, idempotens S3 rehash, FormData nélküli
stream és 18 QA regresszió PASS. A teljes S3/DB/browser E2E és a
publikus DEV aktiválási döntés továbbra is NYITOTT (NO-GO).
Következő feladat: V0.9.63 izolált runtime és end-to-end DEV pilot gate.

## V0.9.63 tényállapot-frissítés (2026.10.23.)

Külön izolációs policy (28 teszt PASS), titokmentes read-only preflight CLI,
17 MiB helyi S3 SDK/HTTP streaming és visszaellenőrzés PASS. A DEV/PROD
S3/DB célok **független** szeparációs igazolása azonban HIÁNYZIK, ezért
a valós S3 PUT/DB írás és a 100 MiB személyes upload pilot továbbra is NO-GO.
A V0.9.64 első feladata az önállóan jóváhagyott izolált DEV bucket,
DB és szintetikus USER, utána a hitelesített E2E kapuk.

## V0.9.64 tényállapot-frissítés (2026.10.23.)

A 100 MiB teljes, szintetikus staging → ClamAV → helyi S3 SDK → visszaolvasás/SHA pipeline PASS. EICAR negatív teszt, túlfolyás és csonkolás elutasítása szintén PASS. A valódi S3/DEV DB elkülönítés független igazolása, a hitelesített böngésző- és adatbázis-E2E, valamint a jóváhagyott BUILD01 továbbra is nyitott. A V0.9.65 következő fókusza ezen kiadási kapuk lezárása; a forrás előrehaladása nem jelent publikus aktiválást.

## V0.9.65 tényállapot-frissítés (2026.10.23.)

A személyes bizonytalan feltöltés read-only, USER-tulajdonoshoz kötött szerveroldali visszaellenőrzése elkészült: teljes S3 SHA-256/size bizonyítás; Transfer Center Ellenőrzés gomb; XHR megszakítási versenyhelyzet pontosítása. 21 regressziós szerződéses teszt és izolált PostgreSQL migrációteszt PASS. Nincs nyilvános aktiválás és nincs BUILD01 PASS a fennálló futtatási biztonsági tiltás miatt. Következő V0.9.66: minimális titokmentes, felhasználóhoz kötött request-id helyreállítás, a BUILD01 szabályos engedélyezése és a külön DEV/PROD S3/DB bizonyíték.

## V0.9.66 tényállapot-frissítés (2026.10.23.)

A V0.9.65 kézi GET visszaellenőrzéséhez elkészült a V0.9.66
fiókhoz kötött, 500 rekordos, hét napos, csak minimális metaadatot tároló,
böngésző-újraindításon át megmaradó receipt jegyzék. A tárolás a XHR
előtt kötelező, a bizonytalan válasz megőrzi, a biztos siker elhagyja
a helyi bejegyzést. Fiókváltásnál a korábbi transfer sorok és további
küldések tiltva vannak. Ez **nem teljes fájl-resume**, nem valódi
S3/DB/Browser E2E, nem BUILD01 PASS. A V0.9.67 külön release gate:
engedélyezett BUILD01, DEV/PROD S3/DB szeparáció, 50/100/500 valós
böngészős batch és rollback.
