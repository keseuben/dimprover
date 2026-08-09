# DIMPRO DROP 0.9.3 – Másodpercalapú robotvédelem és Human Timing Gate

**Kiadás dátuma:** 2026. augusztus 5.  
**Állapot:** éles private-pilot kiadás  
**Érintett felület:** `https://drop.dimpro.hu`  
**Éles build:** `DPUM3KVVvXAQCr3z3fqGN`  
**Aktív release:** `.next-v093-release-final`  
**Közvetlen rollback:** `.next-v092-release-final`  
**Fejlesztési Központ idő:** 68 perc  


## Cél

A DROP 0.9.3 megakadályozza, hogy robot vagy közvetlen API-script a meghívó, PIN vagy capability-token megszerzése után emberileg lehetetlen sebességgel tömeges feltöltési munkameneteket nyisson. A védelem nem a fájl tényleges feltöltési sebességét méri, mert kis kép gyors hálózaton egy másodpercnél rövidebb idő alatt is szabályosan feltölthető. A rendszer a feltöltési intent kiadása és a szerveroldali session-indítás közötti időt ellenőrzi.

## Robotvédelmi folyamat

1. A jogosult feltöltő kliens upload-intent batch-et kér.
2. A szerver minden fájlhoz kriptográfiailag véletlen, egyszer használható intent tokent ad.
3. A szerver csak a token SHA-256 lenyomatát tárolja.
4. A kliens kivárja a szerver által előírt minimumidőt.
5. A feltöltési session init az intent tokent és az üres honeypot mezőt is elküldi.
6. A szerver saját órával újra ellenőrzi az eltelt időt, a csomagot, a jogosultsági módot és a munkamenet-lenyomatot.
7. Sikeres ellenőrzéskor az intent atomi fájl-áthelyezéssel elfogy, így párhuzamos kéréssel sem használható fel kétszer.

## Időhatárok

| Eltelt szerveridő | Művelet |
|---:|---|
| 0–399 ms | Azonnali blokkolás, az intent elfogy, kritikus biztonsági audit készül |
| 400–1499 ms | HTTP 425 jellegű várakoztatás, az intent még nem fogy el |
| 1500 ms felett | A session-indítás folytatható |
| 5 perc után | Az intent lejár |

A kliens nem a készülék óráját hasonlítja a szerverhez. A szerver által megadott várakozási időt méri le, majd a szerver újra ellenőrzi a saját időbélyegeivel.

## Kliensoldali batch-szabály

- legfeljebb 20 MB-os fájlok: maximum 20 intent/batch;
- 20–100 MB közötti fájlok: maximum 5 intent/batch;
- 100 MB feletti fájl: külön intent;
- egy batchre csak egyszer kell kivárni az 1,5 másodperces kaput;
- a normál mobil képsornál nincs fájlonkénti plusz várakozás.

## További védelmi rétegek

- láthatatlan honeypot mező mindkét feltöltőben;
- intent csomaghoz és jogosultsági munkamenethez kötése;
- replay tiltás;
- rossz csomag- vagy munkamenet-környezet tiltása;
- legfeljebb 10 intent-batch/perc/csomag/jogosultság;
- legfeljebb 200 aktív intent/csomag/jogosultság;
- legfeljebb 5 aktív feltöltési session/csomag;
- lejárt intentek automatikus törlése;
- elfogyasztott intentek 24 órás biztonsági nyoma;
- csomagszintű `security.bot_*` audit események;
- privát Object Storage, kvóta, ClamAV és karantén változatlanul aktív.

## Nginx rate limit

A tényleges S3-fájlbájtokra nem kerül Nginx lassítás. Csak a rövid vezérlő API-k korlátozottak:

- csomagkód + PIN belépés: 30 kérés/perc/IP, rövid burst;
- PIN-helyreállítás: 1 kérés/perc/IP, 2 kéréses burst;
- upload-intent: 12 kérés/perc/IP, 3 kéréses burst;
- upload session init: 60 kérés/perc/IP, 20 kéréses burst;
- kapcsolatszám-korlát az érintett API-kon.

Konfiguráció:

- `/etc/nginx/conf.d/dimpro-drop-rate-limit.conf`;
- `/etc/nginx/sites-available/drop.dimpro.hu`.

## Automatikus tesztek

### Viselkedési motor

18/18 PASS:

- konfigurációs küszöbök;
- intent batch és tokenformátum;
- 400 ms alatti blokkolás;
- replay blokkolás;
- 400–1500 ms közötti várakoztatás;
- normál fogyasztás 1500 ms után;
- honeypot blokkolás;
- rossz csomag;
- rossz munkamenet;
- lejárat;
- jogosult IP-változás;
- aktív intent limit;
- batch rate limit;
- érvénytelen token;
- automatikus takarítás.

### Forrásszerződés

44/44 PASS:

- mindkét intent route hitelesített;
- mindkét init route intentet fogyaszt;
- egyik feltöltő sem hagyja ki a honeypotot;
- session-limit mindkét útvonalon aktív;
- runtime health robotvédelmi állapotot közöl;
- Nginx zónák és location blokkok léteznek;
- DROP 0.9.2 és 0.9.3 Fejlesztési Központ bejegyzések ellenőrzöttek.

## Fejlesztési Központ

- DROP 0.9.2 visszamenőlegesen `released` állapotban rögzítve;
- DROP 0.9.3 `released` állapotban rögzítve;
- DROP 0.9.3 valós fejlesztési időmérő lezárva: 68 perc;
- projekt: `DIMPRO Drive / DIMPRO Drop`;
- modul: `DIMPRO Drop`.

## Mentés

- forrás- és infrastruktúra-mentés: `/root/dimprover/backups/drop_v093_robot_guard_20260805_070950`;
- aktiválási mentés: `/root/dimprover/backups/drop_v093_release_20260805_081236`;
- rollback script: `/root/dimprover/scripts/rollback-drop-v093-release.sh`;
- release manifest: `/root/dimprover/.dimprover/releases/drop-v093-release.json`.

## Production és éles E2E

- production build: PASS;
- build ID: `DPUM3KVVvXAQCr3z3fqGN`;
- Next.js oldalgenerálás: 88/88 PASS;
- standalone chunk: 67 PASS;
- candidate API robotvédelmi E2E: PASS;
- candidate böngésző: desktop/tablet/mobil PASS;
- candidate kliensvárakozás: 1582 ms;
- candidate szerveridő: 1992 ms;
- éles HTTPS mobilfeltöltés: PASS;
- éles kliensvárakozás: 1588 ms;
- éles szerveridő: 2108 ms;
- éles 400 ms alatti támadási próba: 429 / `DROP_BOT_TIMING_BLOCKED`;
- éles honeypot: 403 / `DROP_BOT_HONEYPOT_BLOCKED`;
- Nginx sebességteszt: 202, 202, 202, majd 429;
- Hetzner Object Storage és CORS: PASS;
- ClamAV: tiszta;
- képoptimalizálás: 3 525 106 → 623 628 bájt, 82%;
- konzolhiba / oldalhiba / sikertelen kérés: 0 / 0 / 0;
- vízszintes túlcsordulás: 0;
- tesztadat-, intent- és tárhelymaradvány: 0.

A normál felhasználó nem kap CAPTCHA-t vagy új kézi lépést. A kliens az intent batch után automatikusan kivárja a szükséges szerveridős kaput.
