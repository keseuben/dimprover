# 09 Üzemeltetés

## VPS környezet

A DIMPROVER alkalmazás PM2 alatt fut.

## Ellenőrzések

- Node verzió
- npm verzió
- PM2 státusz
- memória
- nginx konfiguráció
- TypeScript ellenőrzés

## Restart

PM2 restart csak sikeres build vagy kifejezett futtatási igény esetén javasolt.

## Védett release csomagok kezelése

A DIMPRO Fájlműhely és egyéb asztali csomagok ZIP fájljait nem szabad nyilvános `public/downloads` mappában tárolni, ha forráskódot vagy belső fejlesztési állapotot tartalmaznak.

Javasolt privát tárhely:

```text
/root/dimprover_release_packages/files/
```

Registry:

```text
/root/dimprover_release_packages/release-registry.json
```

Kézi regisztrálás példa:

```bash
node scripts/register-release-package.mjs \
  --file /tmp/DIMPRO_Fajlrendezo_GUI_v3_62_DriveDesktop_MVP.zip \
  --project DIMPRO_Fajlmuhely \
  --version v3_62 \
  --expires-days 7
```

A script tokenes letöltési linket ad vissza:

```text
https://dimprover.hu/download/rel_...
```

Biztonsági szabály: aki ismeri a tokenes linket, a lejáratig le tudja tölteni a csomagot. Ezért a linket csak célzottan szabad megosztani, és forráskódos csomaghoz alapértelmezésben 7 napos lejárat javasolt.

## DIMPRO Fájlműhely release előzményoldal

Belső release áttekintő oldal:

```text
/release helyett: /releases/dimpro-fajlmuhely
```

Az oldal célja:

- korábbi ZIP csomagok követése,
- verzióleírások megjelenítése,
- SHA256 ellenőrző összeg megőrzése,
- lejárati állapot és letöltésszám megjelenítése,
- későbbi admin feltöltő workflow előkészítése.

Biztonsági szabály: az előzményoldal aktív tokenes letöltési oldalakra mutathat, ezért nem szabad teljesen nyilvános indexként kezelni, ha forráskódos csomagok vannak benne.

## Admin release feltöltő oldal

Védett admin feltöltő:

```text
/admin/releases
```

API végpont:

```text
POST /api/releases/upload
```

Kötelező fejléc:

```text
x-dimpro-license-admin-key: DIMPRO-LICENSE-ADMIN-...
```

Támogatott fájlok:

```text
.zip, .7z
```

Limit:

```text
75 MB
```

A feltöltés nem public mappába ment, hanem a privát release tárhelyre, majd tokenes letöltési linket generál. A publikus, bárki által használható feltöltést továbbra is tiltani kell.

## Release dátumok időzónája

A release registry ISO/UTC időbélyegeket tárol. A felületi megjelenítésnél a DIMPRO release oldalak magyar időzónát használnak:

```text
Europe/Budapest
```

## Release fájltörlési szabály

A release admin törlése nem törli a verzióelőzményt. Csak a szerveren tárolt fizikai ZIP / 7Z fájl kerül törlésre:

```text
/root/dimprover_release_packages/files/
```

A registry rekord megmarad, és a felületen `Fájl törölve` státusszal látszik. Ez azért szükséges, mert a verziózásnak továbbra is követhetőnek kell maradnia, miközben a régi fejlesztési csomagok nem terhelik a VPS tárhelyét.

## DIMPRO Drive API MVP üzemeltetési megjegyzés

A DIMPRO Drive API első vázának célja a desktop kliens és a szerver közötti kézi upload/download munkafolyamat előkészítése. Az útvonalak az `/api/drive/*` csoport alatt érhetők el.

Fejlesztői ellenőrzéshez két hitelesítési mód használható:

1. `x-dimpro-license-admin-key` header a meglévő licencadmin kulccsal.
2. `x-dimpro-drive-dev-token` header a Drive fejlesztői tokennel.

A Drive fejlesztői token automatikusan létrejön, ha nincs környezeti változóban megadva:

```text
/root/dimprover/.dimprover/drive/dev-token.txt
```

A szerveroldali előnézeti adatok helye:

```text
/root/dimprover/.data/dimpro-drive/
```

Fontos: ez még MVP/dev állapot. Éles működéshez rövid életű belépési token, felhasználói/projekt jogosultság, adatbázis, audit log, fájlméret-korlát, vírusellenőrzés és tárhely-stratégia szükséges.

## DIMPRO Drive dev token admin oldal

A Drive API MVP fejlesztői tokenje a következő admin oldalon kérhető le:

```text
https://license.dimpro.hu/admin/drive
```

A lekéréshez a meglévő DIMPRO licencadmin kulcs szükséges. A token továbbra is csak fejlesztői tesztelésre használható. Éles desktop kliensben hosszú életű szerver API kulcs nem tárolható.

Védett API:

```text
GET /api/drive/dev-token
Header: x-dimpro-license-admin-key
```

## DIMPRO Drive upload complete receipt MVP

Az upload complete végpont fejlesztői előnézeti receipt fájlt készít a projekt `.data/dimpro-drive/projects/<projectId>/files/` mappájába. A receipt alapján a szerver fájllista már vissza tudja adni a feltöltött előnézeti fájlt `upload-preview` státusszal.

Fontos: ez még nem végleges fájltár és nem éles ügyfélfájl-tárolás. Élesítés előtt szükséges: Object Storage / végleges fájltár, jogosultság, audit, vírusellenőrzés, fájltípus- és méretkorlát, rövid életű kliens token.

## DIMPRO Drive upload session debug / cleanup MVP

Admin védett upload session ellenőrző végpontok:

```text
GET /api/drive/uploads/sessions
GET /api/drive/uploads/cleanup-plan?olderThanHours=24
DELETE /api/drive/uploads/[uploadId]
```

Hitelesítés:

```text
Header: x-dimpro-license-admin-key
```

A cleanup végpont csak tervet ad vissza, automatikus törlést nem futtat. A kézi törlés kizárólag az ideiglenes upload session mappát törli a `.data/dimpro-drive/uploads/` alatt. Projekt receipt és fájllista rekord automatikusan nem törlődik.

## DIMPRO Drive admin debug UI v3.96–v3.98

Az admin Drive felületen már kezelhető:

```text
https://license.dimpro.hu/admin/drive
```

Funkciók:

- Drive dev token lekérése.
- Upload session lista lekérése.
- Cleanup terv lekérése életkor alapján.
- Manuális upload session törlés megerősítő ablakkal.

Biztonsági szabály:

- Licencadmin kulcs szükséges.
- Automatikus törlés nincs.
- A törlés kizárólag az ideiglenes upload session mappát érinti.
- Receipt / projekt fájllista rekord automatikusan nem törlődik.

## DIMPRO Drive Object Storage előkészítő szerződés v4.01

Admin védett végpont:

```text
GET /api/drive/storage-plan
Header: x-dimpro-license-admin-key
```

A végpont célja az Object Storage bekötés előkészítése. A jelenlegi állapot `plan-only`, tehát valós tárhelyírást nem végez.

Elsődleges tárhelyjelölt:

```text
Hetzner Object Storage
```

Backup / archív irányok:

```text
Backblaze B2
Hetzner Storage Box
```

Élesítés előtt kötelező:

- rövid életű signed upload/download engedély,
- projektjogosultság ellenőrzés,
- audit log,
- fájltípus- és méretkorlát,
- vírusellenőrzés / biztonsági vizsgálat,
- backup visszaállítási próba,
- desktop oldali szerver secret tárolás tiltása.

## DIMPRO Drive storage előkészítő kör v4.02–v4.04

Új végpontok:

```text
GET  /api/drive/storage-env
GET  /api/drive/storage-config
POST /api/drive/storage/signed-upload/init
```

Hitelesítés:

```text
/storage-env és /storage-config: x-dimpro-license-admin-key
/storage/signed-upload/init: x-dimpro-drive-dev-token vagy x-dimpro-license-admin-key
```

A storage-env végpont csak azt mutatja meg, hogy a szükséges környezeti változók be vannak-e állítva. Titkos értéket nem ad vissza.

A storage-config végpont plan-only provider konfigurációt ad vissza, jelenleg éles módosítás vagy mentés nélkül.

A signed-upload/init végpont csak szerződéstervezetet ad vissza. Valós signed URL, Object Storage írás vagy ügyfélfájl-feltöltés továbbra sincs bekapcsolva.

## DIMPRO Drive webes MVP

A webes Drive felület első MVP oldala:

```text
https://app.dimpro.hu/drive
```

A felület bejelentkezés mögött működik, és demo adatokkal is betölt. Élő Drive API metadata lekéréshez a Drive dev token szükséges. A dev token a böngészős oldalon csak memóriában tárolódik, oldalfrissítés után újra meg kell adni.

## Ideiglenes DIMPRO Drive belépési átirányítás

Amíg az app.dimpro.hu saját DIMPRO belépési felülete nincs véglegesítve, a `/drive` oldal bejelentkezés nélkül ideiglenesen a licencadmin felületre irányít:

```text
https://license.dimpro.hu/admin
```

A módosítás a `proxy.ts` fájlban van. Később egyszerűen visszaállítható úgy, hogy a `/drive` útvonal ismét a normál `/login` felületre irányítson, vagy a végleges DIMPRO belépési / modulválasztó oldalra.

## DIMPRO fejlesztői licenc kezdőlap

Elérési út:

```text
https://license.dimpro.hu/admin/dev
```

A kezdőlap tartalmazza a fejlesztéshez használt fontos linkeket:

- licencadmin,
- release feltöltő,
- Fájlműhely verziók,
- Drive admin / token,
- webes DIMPRO Drive,
- szerverállapot,
- fontos API útvonalak.

Első projektként a DIMPRO Fájlműhely szerepel rajta. Később több DIMPRO szoftverprojekt kártyája is ide kerülhet.

## Licencadmin belépés utáni felületválasztó

A licencadmin belépés után a felhasználó először egy választóoldalt lát. Innen indítható:

```text
DIMPRO szoftverfejlesztő kezdőlap
DIMPRO licencadmin dashboard
```

A dashboardon belül a „Belépési felületek” gombbal vissza lehet térni a választóoldalra.

## Licencadminnal védett fejlesztői oldalak

A fejlesztői és release oldalak csak licencadmin belépés után legyenek használva:

```text
https://license.dimpro.hu/admin/dev
https://license.dimpro.hu/admin/releases
https://license.dimpro.hu/admin/drive
https://license.dimpro.hu/admin/szerver
https://license.dimpro.hu/releases/dimpro-fajlmuhely
```

Belépés nélkül ezek a védett útvonalak a licencadmin belépési felületre irányítanak:

```text
https://license.dimpro.hu/admin
```

A korábbi DIMPROVER domain alatti Fájlműhely verzióoldal átirányít a license domain alatti védett verzióoldalra.

## 2026-07-09 – app/dev aldomain és PM2 környezet szétválasztás

A DIMPROVER VPS-en létrejött a külön fejlesztői példány.

Domain és folyamat kiosztás:

- `https://app.dimprover.hu` → éles / bemutatható DIMPROVER web app, PM2: `dimprover`, port: `3000`, mappa: `/root/dimprover`.
- `https://dev.dimprover.hu` → fejlesztői DIMPROVER példány, PM2: `dimprover-dev`, port: `3001`, mappa: `/root/dimprover_dev`.

Nginx:

- Konfiguráció: `/etc/nginx/sites-available/dimprover-app-dev`.
- Enabled symlink: `/etc/nginx/sites-enabled/dimprover-app-dev`.
- SSL tanúsítvány: `/etc/letsencrypt/live/app.dimprover.hu/`, a tanúsítvány mindkét nevet tartalmazza: `app.dimprover.hu`, `dev.dimprover.hu`.

Működési szabály:

- Az app és dev példány külön PM2 folyamatként fusson.
- Fejlesztést elsődlegesen a dev példányon kell végezni.
- Élesítés előtt kötelező: backup, `npx tsc --noEmit`, `npm run lint`, `npm run build`, smoke check, majd csak ezután PM2 restart.
- A `dev.dimprover.hu` jelenleg app-login védelemmel indul; később külön Nginx basic auth vagy admin IP/jelszó védelem is kerüljön rá.


## 2026-07-12 – VPS tárhelytisztítás és backup retention javítás

A szerverállapot ellenőrzés során a VPS root lemezhasználata kritikus szintre nőtt. A fő ok nem a DIMPROVER forráskód mérete volt, hanem a lokális, óránkénti `.dimprover/backups` mentési rendszer felhízása.

Érintett mappák:

```text
/root/dimprover/.dimprover/backups
/root/dimprover_dev/.dimprover/backups
```

Talált probléma:

- a cron óránként futtatta a fő app mentését;
- a script kizárta a `.next`, `node_modules`, `.git`, `.dimprover/backups` mappákat, de nem zárta ki a projektgyökérben lévő `backups/` mappát, a `.next-*` jellegű korábbi buildmentéseket és a ZIP release csomagokat;
- emiatt több óránkénti mentés 3–3,4 GB méretűre nőtt;
- a dev példányba másolt mentési scriptek még `/root/dimprover` útvonalra mutattak, nem `/root/dimprover_dev` útvonalra.

Javított működés:

- a fő app mentése `/root/dimprover` alól dolgozik;
- a dev app mentése `/root/dimprover_dev` alól dolgozik;
- a mentésekből kizárt elemek: `node_modules`, `.next`, `.next-*`, `dist`, `build`, `.git`, `backups`, `.dimprover/backups`, `*.zip`, `*.tar.gz`;
- az óránkénti mentésből lokálisan csak 6 db marad;
- napi mentésből 7 db marad;
- heti mentésből 4 db marad;
- a 0 bájtos vagy 700 MB feletti hibás óránkénti mentések automatikusan törlődnek a retention futásakor.

Fontos üzemeltetési szabály: a VPS lokális backup csak rövid távú gyors visszaállítási pont. Hosszabb távú mentéshez külső tárhely szükséges, például Hetzner Storage Box vagy Backblaze B2.

## 2026-07-12 – Szerverállapot mappaméret sávdiagram és swap bontás

A `license.dimpro.hu/admin/szerver` szerverállapot oldal bővült dinamikus mappaméret sávdiagramokkal.

Új bontások:

```text
DIMPRO tárhelyterületek:
- /root/apps
- /root/dimprover_release_packages
- /root/dimprover_fajlmuhely_work

DIMPROVER tárhelyterületek:
- /root/dimprover
- /root/dimprover_dev
```

A listák nem fix mappaneveket használnak, hanem minden API-frissítéskor `du -k -d 1` alapján olvassák be az aktuális almappákat. Ha új mappa keletkezik az adott gyökérmappák alatt, az automatikusan megjelenik a következő frissítéskor.

A swap figyelmeztetés kiegészült folyamatonkénti bontással. A felület most külön mutatja, mely folyamatoknál maradt swapban memória. Ha közben bőven van elérhető RAM, a magas swaparány nem feltétlenül aktuális memóriahiány, hanem korábban swapba került, ott maradt memóriaoldalak jele lehet.

## 2026-07-12 – Fejlesztői warning lista a szerverállapot oldalon

A `license.dimpro.hu/admin/szerver` oldal bővült egy külön lekérhető fejlesztői warning listával.

Működés:

```text
Normál szerverállapot frissítés: nem futtat teljes ESLint ellenőrzést.
Warning lista lekérése gomb: meghívja az API-t includeWarnings=1 paraméterrel.
```

API viselkedés:

```text
GET /api/license/server-status?includeWarnings=1
```

A válasz `codeQuality.warnings` objektumban tartalmazza:

- warning darabszám,
- error darabszám,
- összes jelzés,
- fájl,
- sor/oszlop,
- ESLint rule,
- eredeti üzenet,
- rövid magyar magyarázat: „Mi okozta”.

Fontos üzemeltetési szabály: a teljes lint ellenőrzés nem automatikus 30 másodperces frissítésben fut, mert nagyobb projektnél felesleges CPU-terhelést okozna. Csak kézi gombnyomásra indul.

## 2026-07-12 – Szerverállapot üzemeltetési panelek és oldalfüles rendezés

A `license.dimpro.hu/admin/szerver` oldal bővült a következő üzemeltetési blokkokkal:

1. Teendők / javasolt műveletek.
2. Backup állapot panel.
3. Domain / port / PM2 térkép Nginx `proxy_pass` alapján.
4. SSL tanúsítvány lejárati figyelő.
5. Log hibaösszesítő PM2, Nginx és backup logokra.
6. Release csomag tárhelyfigyelő.
7. Biztonsági checklist.
8. Takarítási javaslat panel, automatikus törlés nélkül.

A felület hosszú görgetés helyett oldalfüles szerkezetet kapott:

```text
Áttekintés
Tárhely
Folyamatok
Üzemeltetés
Warningok
Részletes listák
```

A kártyák összecsukható `details/summary` panelek, hogy a felhasználó gyorsabban megtalálja az aktuálisan keresett adatot.

A tárhely kördiagram már a szabad tárhelyet is megjeleníti, nem csak a foglaló kategóriákat.

A szerverállapot frontend JSON feldolgozása védettebb lett: ha az API helyett HTML/login oldal érkezik, a felület érthető magyar hibát mutat, nem nyers `Unexpected token <` üzenetet.

## 2026-07-12 – Szerverállapot szekciónkénti lekérdezés és betöltési állapotjelző

A szerverállapot oldal teljes diagnosztikai lekérdezése szétválasztásra került. Az alap „Állapot frissítése” csak gyors adatokat kér le.

A nehezebb lekérdezések külön fülön, külön gombbal futnak:

```text
mode=overview    – gyors alap állapot
mode=storage     – tárhely, mappaméretek, kördiagramok
mode=processes   – memóriafolyamatok és swap folyamatlista
mode=operations  – backup, domain/port, SSL, log, release, security, takarítási terv
mode=warnings    – teljes ESLint warning lista
mode=raw         – részletes nyers mappalisták
```

A 30 másodperces auto refresh csak az Áttekintés fülön fut, hogy ne írja felül a részletes fülek adatait és ne terhelje feleslegesen a VPS-t.

A felület DIMPRO hexagon logós betöltési overlay-t és sávos állapotjelzőt kapott. HTML/login válasz esetén nem nyers JSON parse hiba jelenik meg, hanem magyar nyelvű magyarázat.

## 2026-07-12 – Szerverállapot kördiagram színlogika pontosítása

A szerverállapot Tárhely fülén a fő tárhely kördiagram most már nem csak a szabad helyet mutatja, hanem két fő adatot jelenít meg:

```text
Foglalt tárhely
Szabad tárhely
```

Színlogika:

- a szabad érték minden kördiagramon zöld;
- a foglalt tárhely narancsos/figyelmeztető színt kap;
- a használt swap piros;
- a használt RAM kék;
- a cache/puffer lila.

A cél, hogy a szabad és foglalt értékek vizuálisan erősebben elkülönüljenek.

## Biztonságos Next.js standalone kiadás – candidate build és atomikus csere

Frissítés: 2026-07-27

Az éles `.next/standalone` könyvtárba közvetlenül futtatott `next build` átmeneti HTML–CSS/JS buildazonosító eltérést okozhat, mert a futó szerver ugyanabból a statikus könyvtárból szolgál ki. Ennek tünete lehet a stílus nélküli HTML oldal.

Kötelező kiadási szabály felhasználói felületet érintő production buildnél:

1. a build külön candidate projektkönyvtárban készüljön;
2. a candidate saját `.next` és standalone csomagot használjon;
3. külön porton ellenőrizni kell a fő route-okat és minden hivatkozott `_next/static` assetet;
4. sikeres ellenőrzés után a `.next` könyvtár cseréje ugyanazon fájlrendszeren atomikus átnevezéssel történjen;
5. a korábbi `.next` könyvtár maradjon meg rollbackként;
6. csak ezután történjen PM2 restart;
7. restart után ismét ellenőrizni kell a főoldalt, az érintett route-ot, a CSS/JS asseteket és a böngészős renderelést.

A DIMPRO Ingatlanfelmérő v0.1 kiadásánál alkalmazott aktív buildazonosító: `7T7p5j2riAFBfqM0IgFY1`.

## 2026-08-01 – Szerverállapot mobil/tablet alsó navigáció javítása

- A Szerverállapot felületen a nagy, felső sticky fülsáv csak 1024 px szélességtől jelenik meg.
- Mobilon és tableten a Fejlesztési Központhoz igazodó, lebegő, lekerekített alsó navigáció működik.
- A hét szerverállapot-fül ikonokkal, rövid címkékkel és vízszintes görgetéssel érhető el keskeny kijelzőn.
- A tartalom alsó belső térköze a menü és a készülék safe-area magasságához igazodik, ezért az utolsó panelek nem kerülnek a menü alá.

### Kiadási ellenőrzés

- A közös admin fejléc 360 px alatti nézetét is pontosítottuk: kisebb hézagok és rövidebb címterület akadályozza meg a vízszintes túlcsordulást.
- Éles responsive regressziós ellenőrzés: 360, 390, 430, 600, 768, 820, 912, 1023, 1024 és 1280 px – **10/10 PASS**.
- Mobil/tablet nézetben az utolsó tartalmi panel és az alsó menü között 32 px szabad hely marad.
- Éles build: `y-A834azZYCsiqG8GqoHo`.
- Rollback: `.next_before_server_status_nav_final_20260801_120302`.

## 2026-08-07 – Supabase PostgreSQL migrációs kapcsolat a VPS-ről

A DIMPRO/DIMPROVER szerver közvetlen PostgreSQL migrációhoz a Supabase projekt saját közvetlen adatbázis-végpontját használhatja, ha a VPS IPv6 kapcsolata működik. A kapcsolat szerveroldali titok; kliensoldali kódba, logba vagy dokumentációba tényleges connection string és jelszó nem kerülhet.

Környezeti változók:

```text
SUPABASE_DB_URL
SUPABASE_DB_PASSWORD
```

A `/root/dimprover/.env.local` és az ezt tartalmazó célzott biztonsági mentések jogosultsága `600` legyen.

Migrációs szabály:

- előtte backup és SQL SHA-256 ellenőrzés;
- meglévő shared constraint-ek lekérése és kompatibilitásvizsgálata;
- `ON_ERROR_STOP=1`;
- lehetőleg `BEGIN/COMMIT` tranzakciós migráció;
- utána marker-, tábla-, RLS-, RPC- és alkalmazásoldali health ellenőrzés;
- titkos érték soha ne jelenjen meg parancskimenetben vagy Fejlesztési Központ naplóban.

