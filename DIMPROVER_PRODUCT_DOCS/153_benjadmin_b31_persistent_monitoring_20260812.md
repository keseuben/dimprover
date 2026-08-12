# BENJADMIN B3.1 – tartós monitorozás és csapatképernyő integráció

Dátum: 2026-08-12
Környezet: DEV
Állapot: fejlesztői checkpoint

## Cél

A BENJADMIN csapatképernyő jobb oldali működési diagramjai ne ideiglenes böngésző-munkamenetből, hanem tartós, valós B3.1 monitorozási (monitoring) mintákból dolgozzanak. A meglévő B3.1 Control Plane szerződés és `dev_center_monitor_samples` tábla az adatforrás.

## Biztonsági szabályok

- PRODUCTION továbbra is csak olvasható (read-only) cél.
- A collector kizárólag a DEV Supabase source-of-truth adatbázisba írhat.
- Induláskor a collector összeveti a futó környezet Supabase hostját a `/root/.dimpro-secrets/supabase-dev/project-url` DEV céljával; eltérésnél fail closed.
- A PRODUCTION ellenőrzés kizárólag nyilvános HTTPS read-only probe.
- A DB ellenőrzés kizárólag TCP elérhetőségi probe.
- Nincs PROD SSH írás, deploy, restart vagy migráció.
- Titok nem kerül monitor mintába vagy logba.

## Előkészítő mentés

Forrásfájl backup:

`/srv/dimpro-dev/.backups/benjadmin-b31-monitor-collector-pre-20260812T010930Z`

DEV source DB logikai mentés:

`/root/.dimpro-backups/benjadmin-source-dev/20260812T011216Z-b31-control`

A mentés átmásolva a DB VPS külső source backup területére, SHA256 egyezés PASS.

Titkosított Restic snapshot:

`6987286b`

## B3.1 séma

A szükséges `dev_center_control_schema_meta`, `dev_center_start_contexts`, `dev_center_command_queue`, `dev_center_approvals`, `dev_center_decision_memory`, `dev_center_live_worklog` és `dev_center_monitor_samples` táblák a DEV source adatbázisban már léteztek, a séma verzió `0.3.1`.

A PostgREST schema cache frissítése megtörtént. Új adatbázis-migrációt ebben a checkpointban nem alkalmaztunk. A meglévő B3.1 migráció rollback tranzakciós dry-run ellenőrzése PASS.

## Collector

Új fájl:

`scripts/benjadmin-monitor-collector.mjs`

DEV ideiglenes PM2 folyamat:

`dimpro-benjadmin-monitor-dev`

Mintavétel alapértéke: 60 másodperc.

Megőrzési ablak alapértéke: 14 nap.

Gyűjtött DEV mezők:

- CPU használat;
- memóriahasználat;
- lemezhasználat;
- 1 perces load;
- swap teljes / használt / szabad / százalék;
- biztonságos rendszer-metaadatok.

Gyűjtött read-only elérhetőségi mezők:

- PRODUCTION HTTPS állapot és válaszidő;
- DATABASE TCP állapot és válaszidő.

A collector hosszabb távon a dedikált BENJADMIN Vezérlő VPS-re (Control VPS) költözik. A DEV PM2 folyamat átmeneti B3.1 beágyazott fallback.

## Csapatképernyő

A jobb oldali grafikonok most a B3.1 tartós mintákat használják:

- Rendszerterhelési trend: DEV CPU / memória / lemez;
- Elérési válaszidő: PRODUCTION és DATABASE tartós minták;
- Fejlesztési aktivitás: meglévő Development Center task/session adatok.

Javítva lett a Control Plane API read-model kicsomagolása is: a kliens most a `controlPlane` mezőt használja, ezért a valós monitoring és approval adatok ténylegesen eljutnak a csapatképernyőig.

Erőforrás küszöbszínek:

- normál: alap állapot;
- 75% felett: figyelmeztetés;
- 90% felett: kritikus.

## Acceptance

Csapatképernyő: 42/42 PASS.

Ellenőrzött többek között:

- valós B3.1 monitorozási rendszertrend;
- valós elérési válaszidő görbe;
- DEV/PROD/DB swap mezők;
- 1366x768 laptop nézet;
- 1440x900 desktop;
- tablet és mobil overflow;
- világos/sötét mód öröklés;
- D és Ctrl+Alt+0 gyorsbillentyűk;
- AI finanszírozás/token panel.

## Következő fejlesztési irány

A következő BENJADMIN UI körben a régi adminoldalak egységes, táblázat-első kezelőfelületre állnak át:

1. közös BENJADMIN adatgrid / táblázatos UI szerződés;
2. DIMPRO belépési audit;
3. Licencközpont;
4. Release Központ;
5. Fejlesztési Központ;
6. több-szerveres infrastruktúra / Szerver állapotfigyelő.
