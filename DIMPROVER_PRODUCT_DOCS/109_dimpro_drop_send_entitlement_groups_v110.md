# DIMPRO Drop 1.1.0 candidate – licencalapú Send és publikus képcsoportok

**Dátum:** 2026. augusztus 6.  
**Állapot:** candidate fejlesztés, private-pilot kiadásra előkészítve  
**Érintett termék:** DIMPRO Drop / DIMPRO Send / Gyors KépSend

## Cél

A DIMPRO Send korábbi, névtelen hatjegyű tesztkódját személyhez és meglévő DIMPRO-licenchez kapcsolt küldési jogosultsággá kellett fejleszteni. Ezzel párhuzamosan a Drop kezdőlap minden fő modulja közérthető használati, hozzáférési és DIMPRO Drive-magyarázatot kapott, valamint a Gyors KépSend és a publikus Send-feltöltő megkapta a helyszínmappa/képcsoport funkciót.

## Drop kezdőlap

A négy fő termékkártya:

1. DIMPRO CsomagDrop;
2. DIMPRO Beküldőkapu;
3. DIMPRO Send, ezen belül Gyors KépSend;
4. DIMPRO Drop Tér.

Minden kártyán állandóan látható:

- `Mikor ezt válassza?`;
- `Hozzáférés`;
- a hozzáférést ki adhatja ki;
- technikai elérhetőség: `admin@dimpro.hu`;
- DIMPRO Drive-kapcsolat és annak aktuális állapota.

A kezdőlap státusza:

- `Béta tesztüzem · korlátozott hozzáférés`;
- `Tervezett nyilvános indulás · 2027. I. negyedév`.

## Send-jogosultságkód

Új formátum:

`ABCD-123-456`

Szabályok:

- négy nagybetű és hat számjegy;
- automatikus nagybetűsítés;
- automatikus kötőjelek;
- egysoros beviteli mező;
- az utolsó karakter után automatikus ellenőrzés;
- a régi hatjegyű tesztkódok átmeneti kompatibilitása megmaradt;
- a nyers kód nem kerül adatbázisba vagy naplóba;
- a központi PostgreSQL workflow-tár csak hash, salt és `***-456` formájú hint értéket tárol.

## Licenchez és felhasználóhoz kötés

Új Send-jogosultság létrehozásakor kötelező:

- meglévő, aktív vagy próba DIMPRO-licenc;
- felhasználó teljes neve;
- regisztrációs és azonosítási e-mail-cím.

Opcionális:

- szervezet;
- telefonszám.

A Send-kód ellenőrzése után a felület csak olvashatóan megjeleníti:

- a felhasználó nevét;
- regisztrációs e-mail-címét;
- szervezetét;
- a licenc maszkolt hivatkozását.

A feladói adatok a küldőoldalon nem írhatók át. A szerver a csomaglétrehozásnál is a jogosultsági profil adatait tekinti hitelesnek, nem a kliens által beküldött mezőket.

## Átmeneti kompatibilitási profiltár

A külön csevegőben készülő központi Supabase felhasználói és licencadatbázis elkészültéig a Send-profilokat szerveroldali kompatibilitási tár kezeli:

`.data/dimpro-drop-send-entitlements-v101/profiles.json`

Biztonsági szabályok:

- könyvtárjogosultság: `0700`;
- fájljogosultság: `0600`;
- atomi fájlcsere;
- nyers Send-kód nem kerül bele;
- csak szerveroldali modul olvassa;
- a licencet a meglévő DIMPRO licenctárból ellenőrzi;
- a későbbi központi Supabase-adatbázis bekötésekor ez a réteg repository-adapterként kiváltható.

Opcionális környezeti változó:

`DROP_SEND_ENTITLEMENT_DATA_DIR`

Titkos értéket nem tartalmaz, csak az alternatív adattárútvonalat adhatja meg.

## Címzettkezelés

Három adminisztrátori mód:

### Zárolt alapcímzett

- a felhasználó nem módosíthatja;
- Gyors KépSendhez ajánlott alapbeállítás;
- a szerver figyelmen kívül hagyja az ettől eltérő klienscímzettet.

### Jóváhagyott címzettlista

- csak az admin által rögzített címzettek választhatók;
- a szerver e-mail-cím alapján újraellenőrzi a listát;
- jogosulatlan címzett 403-as választ kap.

### Szabad címzett

- a felhasználó új címzettet is megadhat;
- Normál DIMPRO Sendnél külön jogosultsági beállításként használható.

## Moduljogosultságok

A Send-profil külön kezeli:

- Normál DIMPRO Send;
- Gyors KépSend;
- képcsoportok;
- fájlmegjegyzések;
- későbbi projekt Beérkező Drop kapcsolat.

A projektkapcsolat ebben a candidate-ben szándékosan `false` és inaktív.

## Projektkapcsolat előkészítése

A Send-felületen látható, de nem használható:

- `Nincs projektkapcsolat` alapbeállítás;
- projektlista helye;
- `PRJ-26-K7M-4Q9` formátumú projektkódmező;
- `Hamarosan` állapot.

A projektadat nem kerül mentésre és Drive-átadás nem indul. Aktiválás csak a központi adatbázis elkészülése után lehetséges, ha működik:

- projektlista lekérése;
- projektkód ellenőrzése;
- küldő projektjogosultsága;
- projekt nevének visszajelzése;
- Beérkező Drop mappa;
- vírusellenőrzött átadás;
- képcsoportok megtartása;
- naplózás és projektadmin-értesítés;
- hibás átadás biztonságos kezelése.

## Helyszínmappák és képcsoportok

A publikus Send-feltöltő új funkciói:

- meglévő képcsoport kiválasztása;
- új csoport létrehozása;
- mindig látható aktív mappa;
- a galériából vagy kamerából érkező új képek az aktív csoportba kerülnek;
- visszaváltás korábbi csoportra;
- képenkénti megjegyzés;
- csoportazonosító továbbítása a feltöltési inicializálásba;
- csoport megőrzése az IndexedDB offline sorban;
- csoport megjelenítése a mobil és asztali queue-kártyán.

Új capability-védett API:

- `GET /api/drop/access/groups`;
- `POST /api/drop/access/groups`.

Az API kizárólag érvényes upload capability-token mellett listáz vagy hoz létre csoportot.

## Érintett fő fájlok

- `app/drop/page.tsx`;
- `components/drop/DropPublicWorkflowManager.tsx`;
- `components/drop/DropPublicTransferClient.tsx`;
- `components/drop/DropPublicHexUploader.tsx`;
- `components/drop/dropOfflineQueueStore.ts`;
- `app/lib/drop/public/dropSendCodeFormat.ts`;
- `app/lib/drop/public/dropSendEntitlementProfileStore.ts`;
- `app/lib/drop/public/dropPublicTypes.ts`;
- `app/lib/drop/public/dropPublicRepository.ts`;
- `app/lib/drop/public/dropPublicFileRepository.ts`;
- `app/lib/drop/public/dropPublicPostgresRepository.ts`;
- `app/lib/drop/public/dropPublicWorkflowService.ts`;
- `app/lib/drop/dropGroupService.ts`;
- `app/api/drop/public/send/session/route.ts`;
- `app/api/drop/access/groups/route.ts`;
- `scripts/drop-v110-send-entitlement.test.ts`.

## Ellenőrzési állapot a forrásfejlesztés végén

- TypeScript: PASS;
- módosított fájlok ESLint: PASS;
- teljes lint: 0 hiba, 113 korábbi figyelmeztetés;
- új Send-jogosultsági teszt: 24/24 PASS;
- korábbi publikus workflow regresszió: 39/39 PASS.

A production build, candidate böngészőteszt és élesítés eredménye külön kerül rögzítésre. A verzió továbbra is private-pilot/béta, nem végleges nyilvános kiadás.
