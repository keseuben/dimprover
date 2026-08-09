# DIMPRO DROP 0.9.1 – Képcsoport-alapú Drive archiválás és egyszerűsített webes fájlkezelő

**Kiadás dátuma:** 2026. augusztus 5.  
**Állapot:** éles private-pilot kiadás  
**Éles build:** `eraossim390Jvj_vFLA4i`  
**Aktív release:** `.next-v091-release-final`  
**Közvetlen rollback:** `.next-v090-release-final`  
**Nyilvános Drop felület:** `https://drop.dimpro.hu`  
**Projektkapu Drive:** `https://projektkapu.dimpro.hu` projekten belüli Drive modul

## Cél

A DROP 0.9.1 a mobil KépDropban használt képcsoportokat valódi DIMPRO Drive mappastruktúrává alakítja. A webes Drive kezelőfelület közben egyszerűbb, mappaközpontúbb nézetet kap, hogy a felhasználó ne technikai státuszokkal, hanem a projektfájlokkal találkozzon először.

## Drive archívum mappastruktúrája

Alapértelmezett szerkezet:

```text
DIMPRO Drop archívum/
└── <csomagkód> - <csomagnév>/
    ├── <képcsoport neve>/
    │   └── csoporthoz rendelt képek és fájlok
    ├── Csoport nélkül/
    │   └── csoporthoz nem rendelt fájlok
    └── <csomagkód>_vegleges_riport.pdf
```

Szabályok:

- minden ténylegesen használt Drop képcsoport külön Drive almappát kap;
- csak olyan csoportmappa jön létre, amelyhez archiválható fájl tartozik;
- csoport nélküli fájlok a `Csoport nélkül` almappába kerülnek;
- a végleges PDF-riport a csomagmappa gyökerében marad;
- a projektkapcsolatban beállított egyedi Drive célmappa továbbra is használható;
- alapértelmezett cél esetén a `DIMPRO Drop archívum` gyökér automatikusan létrejön.

## Meglévő archívumok rendezése

A korábbi DROP 0.8.0–0.9.0 archívumok fájljai közvetlenül a csomagmappában lehetnek. A 0.9.1 ismételt archiváláskor:

1. felismeri a meglévő archiválási munkamenetet és Drive dokumentumot;
2. nem hoz létre új dokumentumot vagy új tárhelyobjektumot;
3. a dokumentum `folder_id` értékét a megfelelő képcsoportmappára frissíti;
4. a kapcsolódó archiválási session célmappáját is frissíti;
5. `DROP_ARCHIVE_DOCUMENT_MOVED` audit- és Drive változáseseményt ír;
6. a Desktop szinkronkurzor számára látható változást hoz létre.

A művelet idempotens: az ismételt futás nem hoz létre mappa- vagy dokumentumduplikációt.

## Egyszerűsített webes Drive kezelőfelület

A projekten belüli Drive modul elsődleges nézete most a fájlokra és a mappákra koncentrál.

### Fő mutatók

- projektmappák száma;
- dokumentumok száma;
- Dropból archivált dokumentumok száma;
- összes nyilvántartott fájlméret.

A verziószám, szinkronkurzor, tárhelyállapot és karanténellenőrzés a **Rendszerállapot és haladó műveletek** összecsukható részbe került.

### Mappanavigáció

- a bal oldali mappalistában a fájlszám az almappák tartalmát is tartalmazza;
- egy szülőmappa kiválasztása a teljes alatta lévő mappaág dokumentumait mutatja;
- az aktuális mappa közvetlen almappái külön, kattintható mappakártyákon jelennek meg;
- a `DIMPRO Drop archívum` mappa kiválasztásakor minden alatta archivált csomag és képcsoport dokumentuma látható.

### Forrásszűrés

- **Mind** – minden dokumentum;
- **Drop** – csak a Dropból archivált dokumentumok;
- **Saját fájlok** – webes, desktopos és más nem Drop források.

A Drop dokumentumok külön `Drop` forrásjelölést kapnak.

## Biztonság és adatmodell

- új adatbázis-migráció nem szükséges;
- a meglévő `drop_groups`, `drive_core_folders`, `drive_core_documents`, `drive_core_upload_sessions` és változásnapló táblák használatosak;
- kizárólag ClamAV által tisztának minősített fájl rendezhető Drive-ba;
- a végleges PDF továbbra is kötelező az archiválás lezárásához;
- a Drop és Drive Object Storage bucket és hozzáférési kulcs elkülönített;
- a dokumentumáthelyezés szerveroldali service-role művelet, projekt-, dokumentum- és célmappa-azonosítóval;
- a fájlbájtok áthelyezéskor nem másolódnak újra, csak a Drive dokumentum mappakapcsolata változik;
- a Drive dokumentum forrása `DROP`, verzióállapota `AVAILABLE` marad.

## Forrásszintű ellenőrzések

- DROP 0.9.1 szerződés: **25/25 PASS**;
- célzott ESLint: **PASS**;
- teljes TypeScript: **PASS**;
- adatbázis-migráció: **nem szükséges**.

## Valós integrációs teszt

A teszt valódi Supabase-, Drop Object Storage-, Drive Object Storage-, ClamAV- és PDF-folyamatot használt.

Tesztcsomag:

- `Déli homlokzat` – 1 kép;
- `Északi homlokzat` – 1 kép;
- csoport nélkül – 1 kép;
- automatikus végleges PDF – 1 dokumentum.

Eredmény:

- 3/3 fájl ClamAV tiszta;
- 3 képcsoportmappa létrejött;
- 4 Drive dokumentum archiválva;
- PDF a csomagmappa gyökerében;
- minden Drive dokumentum forrása `DROP`;
- minden Drive verzió állapota `AVAILABLE`;
- meglévő dokumentum visszarendezése működik;
- `DROP_ARCHIVE_DOCUMENT_MOVED` esemény létrejött;
- ismételt archiválás idempotens;
- dokumentumduplikáció: 0;
- mappaduplikáció: 0;
- tesztadat- és tárhelymaradvány: 0.

## Release és rollback

- forrásmentés: `/root/dimprover/backups/drop_v091_drive_group_folders_20260804_213151`;
- aktiválási mentés: `/root/dimprover/backups/drop_v091_release_20260804_221434`;
- release manifest: `/root/dimprover/.dimprover/releases/drop-v091-release.json`;
- rollback script: `/root/dimprover/scripts/rollback-drop-v091-release.sh`;
- közvetlen rollback cél: `.next-v090-release-final`.

## Production build és éles ellenőrzés

- buildazonosító: `eraossim390Jvj_vFLA4i`;
- Next.js 16.2.6 production build: PASS;
- 89 oldal generálása: PASS;
- 67 standalone statikus chunk: PASS;
- teljes projekt ESLint: 0 hiba, 113 korábbi figyelmeztetés;
- candidate compiled worker E2E: PASS;
- éles compiled worker E2E: PASS;
- desktop/tablet/mobil Projektkapu Drive: PASS;
- teljes mappaág, almappakártyák és Drop-szűrés: PASS;
- konzolhiba, oldalhiba, valódi sikertelen kérés: 0 / 0 / 0;
- vízszintes túlcsordulás: 0;
- tesztadat- és tárhelymaradvány: 0.
