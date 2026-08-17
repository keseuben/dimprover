# 269 — BENJADMIN Térkép témaöröklés és worker-identitás · DEV aktiválás

**Dátum:** 2026-08-17  
**Állapot:** DEV aktív · PROD változatlan

## Cél

A Fejlesztési Térkép V1 utóellenőrzésén három vizuális és egy identitás-probléma került elő:

1. a Térkép nem mindig ugyanabban a világos/sötét/Sunlight módban nyílt meg, mint a Fejlesztői Konzol;
2. az üres `Ide húzható` célmezők túl kontrasztos hátteret és gyenge szövegkontrasztot kaptak;
3. a jobbra húzott JázminAI kártya fejlécének tükrözése hiányzott;
4. több operatív fejlesztési esemény Ben-AI szerző alatt jelent meg akkor is, amikor ténylegesen ÁrminAI/JázminAI/egy másik worker dolgozott.

## 1. Fejlesztési Térkép témaöröklése

A BENJADMIN admin shell tématípusa:

- `light`
- `dark`
- `sunlight`

A Fejlesztési Térkép megnyitásakor a forrásablak témája kerül átadásra:

`/admin/dev-map?theme=<light|dark|sunlight>`

A Térkép külön storage kulcsot használ:

`benjadmin-development-map-theme`

Ha a Térkép popup már nyitva van, a forrásablak same-origin `postMessage` eseménnyel szinkronizálja:

`BENJADMIN_DEVELOPMENT_MAP_THEME`

A Fejlesztői Konzol saját témakulcsa továbbra is:

`benjadmin-developer-console-theme`

A Térkép megnyitása ebből olvassa az aktuális módot, ezért a popup ugyanabban a megjelenési módban indul.

### Valós Chromium acceptance

- light → light: PASS
- dark → dark: PASS
- Sunlight → Sunlight: PASS

## 2. `Ide húzható` célmezők

A korábbi fix Tailwind háttér/szövegszínek helyett a dropzone a BENJADMIN theme változóit használja.

Új osztály:

`benjadmin-development-map-dropzone`

A háttér visszafogottabb, a szöveg az aktuális témához igazodik, hover esetén csak finom accent-emelést kap.

Mért kontraszt:

- világos: **5,76:1**
- sötét: **11,81:1**
- Sunlight: **5,92:1**

Mindhárom meghaladja a 4,5:1 célértéket.

## 3. Kódmérnök-kártyák iránya

### ÁrminAI

Balra húzott kártya marad:

- bal felső sarok: avatár + név;
- jobb felső sarok: dátum és idő.

### JázminAI

A jobbra húzott kártya tükrözött fejlécet kap:

- bal felső sarok: dátum és idő;
- jobb felső sarok: név + avatár.

Ugyanez a jobbra húzott vizuális szabály vonatkozik a V.Guard kártyára is.

Valós Chromium geometriai acceptance:

- ÁrminAI identity x < time x: PASS
- JázminAI time x < identity x: PASS

## 4. Ben-AI és worker-identitás szétválasztása

A KÖZÖS FEJLESZTŐI CSEVEGÉS szerzői szabálya:

### Ben-AI

Ben-AI marad a szerző, ha az esemény koordinációs:

- automatikus routing;
- worker-javaslat;
- várólista;
- kapacitásvizsgálat;
- koordinátori döntés;
- `TASK_BENAI_*` események.

### Tényleges worker

A tényleges kódmérnök jelenik meg szerzőként:

- session indítás;
- Plus-pull;
- RUNNING / bridge állapot;
- kódolás;
- fájlmódosítás / diff;
- tesztelés;
- build;
- eredmény riport;
- TESTING;
- COMPLETE / FAIL;
- worker activity események.

A task/session metadata tartósan rögzíti többek között:

- `activeWorkerCode`
- `activeWorkerName`
- `plusBridgeWorkerCode`
- `coordinatorChainWorkerCode`

Az audit mapping workerhez kötött operatív eseménynél a `workerCode` értéket részesíti előnyben.

PROD hozzáférés továbbra is `DENY`.

### Acceptance

- operatív `TASK_TESTING` + `workerCode=ARMINAI` → ÁrminAI: PASS
- `TASK_BENAI_WAITING_FOR_WORKER` → Ben-AI: PASS

## 5. Forrás és végleges DEV runtime

A javítás önálló commitja:

- `a80e8e3428ce03ce7603905210357f512819a831`

Operator integrációs commit:

- `854765096cfb419113a58b4ebc7b4c52db0b2065`

A későbbi Terepi Gyorsrögzítő P0–P6 fejlesztés erre épült, és nem érintette a BENJADMIN theme/chat/worker-attribúciós fájlokat.

Végleges közös runtime:

- runtime source / trusted code baseline: `caa452a9a7733d9cc98d4645ee1b3123aceffcee`
- build: `dhjxw0kjig7yyHkoufQQp`
- active release: `.next-terep-p0-p6-caa452a`
- rollback: `.next-field-capture-p0-p4-gesture-9f1c071`
- operator test/docs HEAD az aktiváláskor: `b1bf10b49d403e99644ba923a2b693915431d89a`
- PM2 UI: online
- PM2 monitor: online
- coordination lock: FREE
- PROD: nem módosult

## 6. Acceptance eredmények

### Új célzott ellenőrzés

`benjadmin-map-theme-worker-attribution-v1`

- statikus contract: **16/16 PASS**
- célzott Chromium: **14/14 PASS**

### Meglévő regressziók

- Fejlesztési Térkép contract: **25/25 PASS**
- Fejlesztési Térkép runtime: **16/16 PASS**
- Fejlesztési Térkép browser: **15/15 PASS**
- Worker Context contract: **20/20 PASS**
- Worker Context browser live: **14/14 PASS**
- V1.5 runtime: **20/20 PASS**
- V1.5 testing browser: **10/10 PASS**
- Overnight Scheduler runtime: **30/30 PASS**
- Overnight Scheduler browser: **14/14 PASS**
- Plus V1.2 runtime: **29/29 PASS**
- Drop/GyorsSend: **44/44 PASS**
- Terepi P0–P6 statikus acceptance: **51/51 PASS**
- Terepi P0–P6 browser: **21/21 PASS**

## 7. Biztonsági szabály

A változtatás nem módosít PROD-ot. A worker-attribúció csak a fejlesztési control-plane naplózás és UI szerző-megjelenítés pontosságát javítja; jogosultságot nem emel, és a `productionAccess: DENY` szabály megmarad.
