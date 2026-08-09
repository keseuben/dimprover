# DIMPRO Értekezleti Kísérő – felületi szétválasztás és Fájlműhely Desktop v5.37

Dátum: 2026-07-18

## Végleges termékhely

A DIMPRO Értekezleti Kísérő jelenlegi MVP-je nem DIMPROVER-modul.

- DIMPRO webes kezelő- és előnézeti oldal: `https://app.dimpro.hu/ertekezleti-kisero`
- Microsoft Teams jobb oldali panel: `https://app.dimpro.hu/teams/meeting-assistant`
- DIMPRO Fájlműhely desktop kliens: v5.37 Értekezleti Kísérő Desktop MVP

A korábbi DIMPROVER útvonal:

`/jegyzokonyvek/ertekezleti-kisero`

átirányít a DIMPRO oldalra. A DIMPROVER Jegyzőkönyvek menüből az Értekezleti Kísérő hivatkozás kikerült.

## Teljes oldalas webes előnézet

A teljes oldalas előnézet megmaradt, de nem Teams-utánzatként működik:

- a bal oldali videóterület szürkített;
- jól látható `Nem aktív terület` jelzést kapott;
- kattintás és vezérlés tiltott;
- a felirat egyértelművé teszi, hogy a DIMPRO nem helyettesíti a Teams videófelületét;
- kizárólag a jobb oldali DIMPRO-panel aktív.

## DIMPRO modulválasztó

Új DIMPRO modul:

- kód: `MEETING_ASSISTANT`
- név: `DIMPRO Értekezleti Kísérő`
- útvonal: `/ertekezleti-kisero`
- státusz: MVP

## Desktop hozzáférés

A webes kezelőfelület `Fájlműhely desktop kapcsolat` részében a bejelentkezett szervező meetinghez kötött, lejáró tokent hozhat létre.

A token:

- csak a megadott meetingazonosítóhoz használható;
- nem általános DIMPRO belépési token;
- HMAC-aláírt;
- lejárati idővel rendelkezik;
- a desktop kliensben alapértelmezetten nem kerül tartós mentésre.

## Fájlműhely Desktop v5.37 MVP

Kiinduló csomag: DIMPRO v5.36 teljes rövid útvonalas verzió.

Új fájl:

`dimpro_meeting_assistant_module.py`

Új indítópultkártya:

`Értekezleti Kísérő`

Funkciók:

1. DIMPRO szervercím beállítása;
2. meetingazonosító megadása;
3. hozzáférési token beillesztése;
4. szervezői vagy résztvevői szerepkör;
5. élő munkatér lekérése;
6. megosztott jegyzet és napirend megjelenítése;
7. feladatok és döntések listázása;
8. mellékletek és státuszok listázása;
9. helyi fájlok kiválasztása és feltöltése;
10. JPG, JPEG, PNG, WEBP, PDF, DOCX, XLSX, PPTX, TXT és ZIP támogatás;
11. 250 MB/fájl kliensoldali ellenőrzés;
12. tokenes Teams-panel böngészős megnyitása;
13. DIMPRO kezelőfelület megnyitása;
14. kapcsolat- és hibanapló.

## Tudatos korlátozások

- A desktop kliens még nem vesz át Teams hangfolyamot.
- Nincs élő beszédfelismerés vagy AI tolmácsolás.
- Nincs automatikus folyamatos szinkron; a felhasználó frissítést indít.
- A token beillesztése kézi tesztfolyamat.
- A teljes DIMPRO-fiók és Entra SSO későbbi kör.
- A desktop nem tárolja alapértelmezetten a hozzáférési tokent.

## Következő fejlesztési kör

1. desktop OTP / DIMPRO account login;
2. meetinglista és projektlista szerverről;
3. token kézi másolásának kiváltása;
4. automatikus időszakos frissítés;
5. DokuBOX és Commander fájlátadás;
6. képernyőmetszés közvetlenül a meetingbe;
7. hangrögzítő desktop bridge;
8. Azure Speech átirat és kézi AI tolmács MVP.

## Release

- Release verzió: `v5.37-meeting-assistant-desktop`
- Fájlnév: `DIMPRO_Fajlmuhely_v5_37_Ertekezleti_Kisero_Desktop_MVP.zip`
- Méret: 59 486 503 byte
- SHA-256: `85232934cf3ae4d89f07ce7907911fd9fbe0913adb63adf26bea5b01e71db95a`
- Védett release-nyilvántartásba regisztrálva.
- Letöltési és API fájlkiszolgálási ellenőrzés: HTTP 200.

## v5.37.1 SHORTPATH CLEAN javítás

A v5.37 eredeti csomag Windows kicsomagolásnál túl hosszú útvonalhibát okozhatott, mert a release-be bekerült a belső backup-, teszt- és konfigurációs archívumstruktúra.

Javított csomag:

- Verzió: `v5.37.1-shortpath-clean`
- Fájlnév: `DIMPRO_Fajlmuhely_v5_37_1_SHORTPATH_CLEAN.zip`
- Fájlok száma: 325
- ZIP mérete: 43 449 639 byte
- Leghosszabb belső útvonal: 73 karakter
- Backup mappa: nincs
- Régi teszt/log mappa: nincs
- SHA-256: `17accbdb1722d7a0b478f897e2d46f5beb589fdd62469422c21390fb9d6cb7b6`
- Javasolt kicsomagolási hely: `C:\DIMPRO\D537`

A v5.37 eredeti release elavultként megjelölésre került.

## v5.37.2 Meeting Connection Fix

A v5.37.1 kézi token + meetingazonosító párosítása HTTP 401 hibához vezethetett, ha a token másik meetinghez tartozott, hiányosan került beillesztésre vagy időközben lejárt.

Javítások:

- webes `Kapcsolati csomag másolása` gomb;
- a csomag együtt tartalmazza a szervert, meetingazonosítót és tokent;
- desktop `Kapcsolati csomag beillesztése` gomb;
- token payload helyi előellenőrzése;
- meetingazonosító automatikus javítása a token alapján;
- lejárati idő ellenőrzése;
- hiányos token felismerése;
- érthető HTTP 401 útmutatás;
- élő API és virtuális kijelzős GUI-smoke sikeres.

### v5.37.2 release

- Release verzió: `v5.37.2-meeting-connection-fix`
- Fájlnév: `DIMPRO_Fajlmuhely_v5_37_2_MEETING_CONNECTION_FIX.zip`
- Méret: 43 451 566 byte
- SHA-256: `ed270af5f1234d1b43344297f146f1f499661474bcf89ea124edff0818a07dc4`

## Webes jobb oldali panel betöltési javítás – 2026-07-18

A DIMPRO kezelőoldal jobb oldali előnézeti panelje korábban a böngésző Supabase sessionjére támaszkodott. Bizonyos esetben a teljes védett oldal megnyílt, de a kliensoldali workspace API nem látta a sessiont, ezért a panel általános betöltési hibát mutatott.

Javítás:

- a bejelentkezéssel védett DIMPRO oldal szerveroldalon meetinghez kötött előnézeti tokent hoz létre;
- ezt közvetlenül átadja a jobb oldali `MeetingAssistantPanel` komponensnek;
- a panel workspace-, AI-, feltöltési és fájlműveletei ugyanazzal a tokennel működnek;
- sikertelen betöltéskor a tényleges hibaüzenet és `Újrapróbálás` gomb jelenik meg;
- tokenes workspace API smoke: HTTP 200, helyes meetingazonosító;
- TypeScript, célzott ESLint és production build sikeres;
- PM2 újraindítás sikeres.

## Desktop token szervezői jogosultság javítás – 2026-07-18

A webes DIMPRO oldal már betöltötte a jobb oldali panelt, de a `Desktop token létrehozása` API továbbra is kizárólag a kliensoldali Supabase sessiont ellenőrizte. Emiatt a védett oldalról indított kérés is `Csak bejelentkezett szervező hozhat létre értekezleti hozzáférést` hibát adhatott.

Javítás:

- a védett DIMPRO oldal szerveroldali `dimpro-web-preview` tokenje kiadói jogosultságként használható;
- kizárólag ugyanahhoz a meetingazonosítóhoz adhat ki desktop tokent;
- más scope-pal rendelkező meetingtoken nem használható tokenkiadásra;
- token nélküli és hibás scope-os kérés továbbra is HTTP 401;
- érvényes webes szervezői issuer tokennel a desktop token API HTTP 200;
- a kiadott desktop tokennel a workspace API HTTP 200.

## Értekezlet lezárás, archívum és export – 2026-07-20

### Központi adatmodell v2

Az értekezleti munkatér `version: 2` struktúrára bővült. Új mezők:

- `status`: `active`, `draft_closed`, `pending_approval`, `published`, `archived`;
- `scheduledStart`, `scheduledEnd`, `endedAt`;
- `participants`;
- `closure.mode`, `closedAt`, `closedBy`, `note`, `snapshotVersion`, `lastPublishedAt`.

A régi v1 JSON munkaterek beolvasáskor automatikusan kiegészülnek az új alapértékekkel.

### Lezárási folyamat

A Teams/webes szervezői panel új `Értekezlet lezárása és archiválása` blokkot kapott:

- lezárás piszkozatként;
- lezárás jóváhagyásra váróként;
- lezárás és közzététel;
- újranyitás szerkesztéshez;
- archiválás.

Lezárás előtt a panel jelzi:

- jóváhagyásra váró mellékletek számát;
- hiányzó felelősöket;
- hiányzó határidőket;
- nyitott napirendi pontokat.

Minden lezárás és archiválás külön, változtathatatlan snapshot JSON fájlt készít növelt verziószámmal. Közzétett vagy archivált értekezlet újranyitás nélkül nem módosítható.

### Tartós adattár

Az értekezleti adatok már nem a törölhető `.next/standalone/.dimprover` mappába kerülnek. Az állandó hely:

`/root/dimprover/.dimprover/data/meeting-assistant`

Almappák:

- `workspaces`;
- `uploads`;
- `snapshots`.

A projektgyökér automatikusan felismerhető standalone futás esetén is. Build és PM2 restart után az adatok megmaradnak.

### Központi archívum

Új oldal: `/ertekezletek`

Kereshető címre, projektre, szervezőre, résztvevőre, feladatra, fájlnévre, jegyzetre és átiratszövegre. Szűrhető státusz és projekt szerint. Megjeleníti a mellékletek, feladatok, döntések, átiratsorok és snapshotok számát.

### Export

Új export API:

`/api/meeting-assistant/export`

Formátumok:

- `pdf`: A4 nyomtatható jegyzőkönyv;
- `html`: szerkeszthető HTML;
- `json`: teljes adatcsomag.

A privát tartalom csak szervezői webes vagy Fájlműhely desktop tokennel kérhető. Résztvevői token csak megosztott tartalmat exportálhat.

### Fájlműhely v5.37.3

Új verzió: `v5.37.3 Meeting Archive & Export`.

Újdonságok:

- meetingstátusz és snapshot az összefoglalóban;
- résztvevők és lezárási adatok az Áttekintésben;
- Értekezleti archívum gomb;
- PDF, HTML és JSON exportgomb;
- meglévő élő kapcsolat, tokenkezelés és fájlfeltöltés változatlan.

Release:

- fájl: `DIMPRO_Fajlmuhely_v5_37_3_MEETING_ARCHIVE_EXPORT.zip`;
- méret: 43 452 700 byte;
- SHA-256: `8ef5774f11fea64a5605ef0a8ebdaef7948f13206600805fb8a5dc95ad64e83e`;
- rövid útvonalú csomag, maximum 73 karakteres belső útvonal.

### Ellenőrzések

- TypeScript: sikeres;
- célzott ESLint: sikeres;
- production Next.js build: sikeres;
- PM2 online;
- 16 lépéses élő lezárás/újranyitás/archiválás teszt: sikeres;
- 5 külön snapshot létrejött és build után is megmaradt;
- közzétett meeting módosításának tiltása: sikeres;
- Python compile: sikeres;
- Fájlműhely Xvfb GUI-smoke: sikeres;
- desktop ZIP-integritás: sikeres.

A PDF export végpont automatizált futtatását a tool biztonsági rétege blokkolta, ezért az első éles felhasználói kattintáskor külön vizuális PDF-ellenőrzés szükséges.
