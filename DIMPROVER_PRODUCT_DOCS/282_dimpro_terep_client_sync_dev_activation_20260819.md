# DIMPRO Terepi Gyorsrögzítő – kliensszinkron DEV aktiválás

**Dátum:** 2026-08-19
**Környezet:** kizárólag DEV
**Állapot:** AKTÍV DEV RELEASE

## 1. Cél

A Terepi Gyorsrögzítő helyi IndexedDB-alapú rögzítésének összekötése a már elkészült szerveres Field Capture / Drop / Saját DIMPRO Drive réteggel, biztonságos és újraindítható kliensszinkronnal.

A release lánca:

`IndexedDB helyi kép → Field Capture session/item → privát staging package → P7.1 upload-init → közös Drop resumable multipart → complete → reconcile → SERVER_STORED → opcionális USER_DRIVE`

A Projektkapu Drive ebben a release-ben továbbra is külön, kikapcsolt P9 irány.

## 2. Aktivált runtime

- operator runtime source: `515f3d3b360b7dedd5272dafcae062b4f6b616c7`;
- operator release: `.next-terep-client-sync-release-515f3d3`;
- build ID: `4sxAAl-wWLIzrwbUOxEv6`;
- PM2 processz: `dimpro-benjadmin-operator-ui-v2-dev`;
- PM2 `NEXT_DIST_DIR`: `.next-terep-client-sync-release-515f3d3`;
- központi active-next-release pointer: `.next-terep-client-sync-release-515f3d3`;
- port: `127.0.0.1:3100`;
- standalone asset gate: 248 chunk PASS.

A runtime build source identity és a release meta exact egyezése cutover előtt és után ellenőrizve lett.

## 3. Kliensszinkron funkciók

- kézi, felhasználó által indított `Szinkronizálás a DIMPRO szerverre` művelet;
- offline-safe viselkedés;
- helyi session/item azonosítók idempotens szerveres recoveryhez;
- upload-progress tárolás külön progress mezőben;
- raw Send token és upload capability nem kerül IndexedDB-be;
- upload capability csak memóriában él;
- központi DIMPRO Drop upload-rules freshness gate;
- privát Field Capture staging package;
- staging retention: 7 nap;
- public delivery workflow: tiltva;
- raw capability persistence: tiltva;
- resumable multipart Drop upload a közös meglévő motorral;
- complete → reconcile után `SERVER_STORED`;
- P7.2 idempotencia: változatlan retry nem lépteti vissza a már előrehaladott tárolási állapotot;
- szerkesztett vagy lecserélt asset szándékosan új upload állapotra resetel;
- Saját DIMPRO Drive backend aktív, USER ownership és USER_ROOT scope szerint;
- Projektkapu Drive továbbra is kikapcsolt.

## 4. Proxy / host javítás

A kliensszinkron release során az `/api/field-capture/upload-rules/accept` endpoint bekerült a Drop host két szükséges allowlistjébe.

Eredmény:

- korábbi Drop-host 404 megszűnt;
- auth nélküli kérés helyesen `401 FIELD_CAPTURE_SEND_SESSION_REQUIRED`;
- külön proxy security contract: `6/6 PASS`.

## 5. Release gate eredmények

### Statikus / source gate

- Field Capture upload-rules proxy: `6/6 PASS`;
- Field Capture client sync: `14/14 PASS`;
- Field Capture staging: `14/14 PASS`;
- P8 Saját DIMPRO Drive: `14/14 PASS`;
- P7 server contract: `14/14 PASS`;
- Terep P0–P6 acceptance: `66/66 PASS`;
- GyorsSend regresszió: `44/44 PASS`;
- célzott ESLint: PASS;
- `npx tsc --noEmit`: PASS;
- `git diff --check`: PASS.

### Candidate browser E2E

Az operator candidate a 3158-as izolált porton teljes klienslánccal PASS:

- mobile viewport;
- helyi kép létrehozás;
- session létrehozás: 201;
- privát staging package: 201;
- server item: 201;
- upload-init: 201;
- Drop multipart part endpoint: 200;
- objektumtár upload;
- complete/reconcile;
- server status: `SERVER_STORED`;
- asset storage status: `STORED`;
- staging private: true;
- raw capabilities persisted: false;
- page errors: 0;
- console errors: 0;
- cleanup: capture 0 / package 0.

### Live 3100 browser E2E

A sikeres cutover után ugyanaz a teljes browser E2E az aktív 3100-as DEV runtime-on is PASS:

- `SERVER_STORED`;
- asset `STORED`;
- privát staging;
- raw capability persistence: false;
- page errors: 0;
- console errors: 0;
- DB teszt-session maradvány: 0.

## 6. E2E diagnosztika és tesztharness hardening

A korábbi browser timeout nem termékkódhibának bizonyult, hanem a headless Chromium tesztkörnyezet secure-origin/CORS beállításának.

A tesztharness ezért:

- network trace-et rögzít tokenek nélkül;
- failed requesteket és releváns response státuszokat naplóz;
- timeoutnál UI/console/pageerror diagnosztikát ad;
- a secure-origin értéket dinamikusan a `TEREP_BROWSER_BASE` alapján képezi.

A post-release trusted test baseline: `c914eb1`.

## 7. Cutover és rollback

Pre-cutover rollback backup:

`/srv/dimpro-dev/backups/terep-client-sync-cutover-20260819T012442+0200`

Git backup ref:

`backup/benjadmin-pre-terep-client-sync-cutover-20260819T012442+0200`

Az első cutover-kísérlet a belső PM2 identity-ellenőrző shell-parancs idézőjelezési hibája miatt automatikusan rollbackelt. A rollback ellenőrzése PASS volt: pointer és `NEXT_DIST_DIR` visszaállt a korábbi Weekly Flow release-re.

A második, `/proc/<pid>/environ` alapú identity guarddal végzett cutover PASS lett. Pointer és PM2 `NEXT_DIST_DIR` egyszerre váltott, `unstable_restarts=0`.

## 8. PM2 / runtime stabilitás

- aktív release out-log: `4sxAAl-wWLIzrwbUOxEv6 / 515f3d3`;
- PM2 status: online;
- unstable restart: 0;
- PM2 state: `pm2 save` után tartósítva;
- error-log utolsó módosítása: 2026-08-17 23:53 CEST;
- az új release cutover után friss PM2 error nem keletkezett;
- az error-logban látható korábbi bejegyzések régebbi release-ekhez tartoznak.

## 9. Adatbázis / migráció

A privát Field Capture staging séma a release előtt már DEV-en ready állapotban volt. Ebben az aktiválási körben új adatbázis-migráció nem került alkalmazásra.

A staging alapelvek változatlanok:

- nincs címzett;
- nincs public delivery workflow;
- nincs automatikus e-mail/report;
- raw token/capability nem kerül tartós tárolásba.

## 10. Következő külön feature – Terepi GPS fotótérkép

A következő fejlesztési irány külön feature, nem része ennek a kliensszinkron release-nek.

Név: **Terepi GPS fotótérkép**.

Tervezett alapok:

- az Ingatlan felmérő modul már meglévő északi nyíl komponensének újrahasználata;
- fotópont sorszám és fájlnév;
- kamera tájolási irány;
- GPS pontosság;
- fotók készítési sorrendjének szaggatott összekötése;
- önálló PDF fotótérkép export;
- később PDF/DXF tervillesztés minimum 3 kalibrációs / sarok / kitűzési ponttal;
- a kalibrációs pontokat helyszínen GPS gombbal lehessen rögzíteni;
- egy pontnál több GPS-minta átlagolása;
- 3 pont fölött illesztési hiba / residual kijelzés.

A telefonos GPS-ből készülő ábra nem geodéziai kitűzési dokumentum, hanem helyszíni fotóazonosítást és tájékozódást segítő műszaki fotótérkép.

## 11. Záró állapot

A Terepi kliensszinkron release teljes candidate + live E2E kapun átment és aktív DEV runtime lett.

**PROD változatlan, nem történt PROD alkalmazásmódosítás.**
