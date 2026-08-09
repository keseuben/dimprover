# DIMPRO rendszerstruktúra és szerverátalakítási terv

**Verzió:** INFRA 0.1.0  
**Dátum:** 2026. július 31.  
**Állapot:** éles  
**Éles build:** `BfMfMLSEy65fMEMo-LovG`  
**Belső működési oldal:** `https://license.dimpro.hu/admin/dev/rendszerstruktura`

## Cél

A DIMPRO teljes termékcsaládját, a jelenlegi és tervezett szerverstruktúrát, a belépési pontokat, a modulhierarchiát, az e-mail profilokat és az átalakítási feladatokat egy folyamatosan karbantartható belső működési oldalon kell kezelni.

A felület kétoszlopos összehasonlítást használ:

- bal oldal: jelenlegi állapot;
- jobb oldal: tervezett célállapot;
- sötétszürke: még tervezett elem;
- türkiz: fejlesztés alatt;
- borostyán: külső beavatkozásra vár;
- zöld: teljesített célállapot.

Mobilon és tableten a párosított kártyák egymás alatt jelennek meg, azonos témacsoportban.

## Szerverstruktúra

### Jelenlegi PROD VPS

- szerep: éles DIMPRO/DIMPROVER szolgáltatások;
- operációs rendszer: Ubuntu 24.04 LTS;
- jelenlegi címek: `app.dimpro.hu`, `drop.dimpro.hu`, `license.dimpro.hu`, valamint több DIMPROVER host;
- célállapot: csak ellenőrzött éles release-ek fogadása;
- normál fejlesztési build a DEV VPS elkészülése után nem itt fut.

### Tervezett DEV VPS

- DotRoll Prémium Large;
- 4 vCore;
- 8 GB RAM;
- 120 GB SSD;
- Ubuntu 24.04 LTS;
- tervezett cím: `dev.dimpro.hu`;
- feladat: kódolás, build, lint, TypeScript, staging, tesztadatok és háttérworkerek;
- ugyanazon DEV VPS-en több saját vagy ügyfél-SaaS projekt fejleszthető technikailag elkülönítve.

### Tervezett DATABASE VPS

- DotRoll Prémium Medium;
- 2 vCore;
- 4 GB RAM;
- 80 GB SSD;
- Ubuntu 24.04 LTS;
- tervezett cím: `db.dimpro.hu`;
- feladat: központi éles PostgreSQL;
- a PostgreSQL port csak a PROD, DEV és szabályozott admincsatorna számára engedélyezhető;
- napi mentés, külső backup és visszaállítási teszt kötelező.

### Object Storage

A tényleges PDF-, kép-, dokumentum- és ZIP-fájlok privát S3-kompatibilis tárhelyre kerülnek. A PostgreSQL csak üzleti adatot, fájlmetaadatot, jogosultságot és objektumkulcsot tárol.

## Supabase átállási szabály

A Supabase egyelőre nem mondható le. A megszüntetés csak az alábbi lépések után lehetséges:

1. saját PostgreSQL telepítése;
2. sémák és repository réteg kialakítása;
3. adatkiexport és próbaimport;
4. DEV ellenőrzés;
5. párhuzamos működés;
6. visszaállítási próba;
7. többnapos éles megfigyelés;
8. dokumentált végleges átállás.

## Belépési pontok

### Normál DIMPRO felhasználó

- nyilvános bemutató: `https://dimpro.hu`;
- központi belépés: `https://app.dimpro.hu/login`;
- sikeres belépés után: `/account/modules`;
- célállapot: egy közös DIMPRO Account, amely jogosultság szerint megnyitja a DIMPRO appokat, Drive-ot, belső Drop-kezelőt vagy DIMPROVER terméket.

### DIMPROVER felhasználó

- közvetlen enterprise belépés: `https://app.dimprover.hu/login`;
- a route jelenleg a DIMPROVER belépési felületet mutatja;
- célállapot: ugyanaz a közös fiók- és jogosultsági motor, DIMPROVER témával és enterprise továbbirányítással.

### DIMPRO Drive

- jelenlegi állapot: licencadminhoz kötött webes admin előnézet;
- célállapot: `drive.dimpro.hu` vagy `app.dimpro.hu/drive`, normál felhasználói belépéssel;
- az admin fejlesztői ellenőrzés külön belső útvonalon marad.

### DIMPRO Drop

- külső meghívott: `https://drop.dimpro.hu`, linkkel, csomagkóddal vagy PIN-nel;
- belső csomagkezelő: később normál DIMPRO fiókból;
- a nyilvános Drop hoston admin- és belső appútvonal nem érhető el.

### Licencügyfél-portál

- cím: `https://license.dimpro.hu/customer`;
- szerep: licenckulcs, gép, lejárat és kapcsolattartási adatok;
- nem azonos a normál DIMPRO Accounttal.

### Licencadmin

- cím: `https://license.dimpro.hu/admin`;
- szerep: licencek, ügyfelek, gépek, aktiválás, moduljogosultság, e-mail profilok, release és szerveradmin;
- kizárólag belső/tulajdonosi felület.

### DIMPRO Dev Fejlesztési Központ

- cím: `https://license.dimpro.hu/admin/dev`;
- szerep: fejlesztési projektek, verziók, ráfordított idő, release, szerverállapot, napló, PWA/push és rendszerstruktúra;
- külön belső fejlesztői felület, nem ügyfélalkalmazás.

## Termékcsalád

### DIMPRO központi mag

- nyilvános termékcsalád és előfizetési központ;
- DIMPRO Account;
- szervezet- és felhasználókezelés;
- közös projektmag;
- licenc- és csomagmotor;
- értesítési és e-mail motor;
- számlázás és előfizetés;
- feature flag és audit;
- DIMPRO miniappok.

### DIMPRO Drive

- tartós projektfájltér;
- webes fájlkezelés;
- Drive Desktop;
- Mappaőr;
- verziózás és audit;
- DocumentViewer kapcsolat;
- Object Storage;
- Drop integráció.

### DIMPRO Drop

- ideiglenes csomagátadás;
- KépDrop;
- FájlDrop;
- token/PIN kapu;
- komment és meghívás;
- automatikus PDF-riport;
- lejárat és törlés;
- Drive átadás.

### DIMPROVER

- Munkatér;
- Projektkapu;
- Építéshely;
- Vállalkozói Műhely;
- Üzemeltetés;
- Admin;
- projekten belül: Áttekintés, Ütemterv, Dokumentumok/Mappaőr, DokuBOX, Jegyzőkönyvek, Hibajegyzék, Terepi állapotrögzítés, Exportok/Riportok;
- közös engine-ek és DIMPROVER AI.

### DIMPRO Desktop

- közös Windows indító;
- licencellenőrzés;
- frissítés és release;
- Drive szinkron;
- értesítések és tevékenységek;
- helyi cache és offline sor;
- gépazonosító és audit.

### DIMPRO Fájlműhely

- Fájlrendező;
- Mappaőr;
- PDF Műhely;
- Tervjegyzék-készítő;
- DokuBOX;
- KépBOX;
- PDF Tervnéző;
- Tervösszehasonlítás;
- Szakági Mennyiségmérő;
- IFC Viewer/BIM mennyiség;
- Képszerkesztő;
- Költségvetés Műhely;
- Drive, licenc és értesítési integráció.

## DIMPRO e-mail rendszer

- `system@dimpro.hu`: Szerverőr, technikai állapot, rendszerhiba és licencértesítés;
- `ertesites@dimpro.hu`: általános alkalmazás-, projekt-, feladat-, határidő- és értekezleti értesítés;
- `ertesites.drive@dimpro.hu`: Drive, Drive Desktop, Mappaőr, Projektkapu és később Drop fájlesemények;
- `noreply@dimpro.hu`: nem válaszolható rendszerigazolások;
- `szamlazas@dimpro.hu`: előfizetés, számlázás, csomagváltás és lejárat;
- `admin@dimpro.hu`: licencadmin és belső adminisztráció;
- `info@dimpro.hu`: emberi ügyfélkapcsolati cím és alapértelmezett Reply-To.

A működési oldal az e-mail profilok biztonságos élő állapotát a védett mail-settings API-ból tölti. Jelszó vagy SMTP-titok nem jelenik meg.

## Frissítési szabály

A működési oldalt és ezt a dokumentumot frissíteni kell minden jelentős változáskor:

- új szerver vagy domain;
- új belépési pont;
- termék- vagy modulátrendezés;
- e-mail profil változása;
- adatbázis-migráció;
- Object Storage aktiválás;
- új ügyfél-SaaS élesítése;
- teljesített célállapot.

## Élesítési állapot – 2026. július 31.

- az `INFRA 0.1.0` kiadás állapota: `released`;
- az oldal asztali és mobil böngészőtesztje sikeres;
- asztalon a jelenlegi és tervezett állapot párhuzamos oszlopban jelenik meg;
- mobilon a párosított állapotkártyák egymás alá rendeződnek;
- vízszintes túlcsordulás: 0 px;
- élő e-mail profilok száma: 7;
- TypeScript és célzott ESLint ellenőrzés sikeres;
- production build: `BfMfMLSEy65fMEMo-LovG`;
- PM2 folyamat: `dimprover`, online;
- az ellenőrzés alatt új PM2 hibanapló-bejegyzés nem keletkezett.

## INFRA 0.1.1 – Egységes témaszínek és fix navigáció

**Élesítés:** 2026. július 31.  
**Éles build:** `jnlouzeqjb9KKuwCUWyVI`  
**Éles felület:** `https://license.dimpro.hu/admin/dev/rendszerstruktura`

Elkészült módosítások:

- a rendszerstruktúra oldal saját, szemantikus világos és sötét színrendszert kapott;
- megszűnt a sötét háttér–sötét szöveg hiba a tervezett, folyamatban lévő, külső lépésre váró és teljesített kártyákon;
- a termékfejlécek, domainpanelek és állapotcímkék mindkét témában egységes kontrasztot használnak;
- asztalon és tableten a szakaszmenü a közös adminfejléc alatt, 74 px felső pozícióban rögzül;
- a menü görgetés közben jelzi az aktuális szakaszt;
- mobilon ötgombos alsó navigáció és hétpontos teljes menülap működik;
- az átalakítási csoportok közül alaphelyzetben csak az első nyitott;
- a termékmodul-csoportok összecsukva indulnak, ezért az oldal lényegesen gyorsabban áttekinthető;
- a mobil és asztali nézetben nincs vízszintes túlcsordulás.

Ellenőrzések:

- TypeScript: PASS;
- célzott ESLint: PASS;
- elkülönített webpack production build: PASS;
- candidate és éles böngészőteszt: desktop light/dark, tablet dark, mobile light/dark PASS;
- vizsgált színkontrasztok: 14,1:1–17,61:1;
- statikus assetek: 16/16 elérhető;
- Nginx: hibamentes;
- PM2 `dimprover`: online;
- rollback build: `.next_before_infra_v011_20260731_200827`;
- forrásbackup: `backups/infra_v011_theme_fixed_nav_20260731_192013`.

## Ideiglenes Drop Supabase fejlesztési híd – 2026. augusztus 1.

A DATABASE VPS várható hétvégi átfutása miatt a DROP 0.2.0 csomagmotor ideiglenesen Supabase/PostgreSQL adatbázison fejleszthető. Ez nem változtatja meg a végleges saját PostgreSQL célarchitektúrát.

Korlátok:

- csak `drop_*` táblák;
- kizárólag service-role szerveroldali repository;
- anonim RLS policy nincs;
- fájlfeltöltés és Object Storage továbbra is tiltott;
- a saját PostgreSQL elkészülésekor export–próbaimport–rollback folyamat kötelező;
- a Supabase csak sikeres migráció és megfigyelés után vezethető ki.

## DROP 0.2.0 Supabase híd aktuális állapota – 2026. augusztus 1.

A Drop teljes, fájl nélküli csomag- és hozzáférési motorja elkészült az adatbázis tényleges bekötése előtt. A Supabase SQL továbbra sincs alkalmazva; a hét kötelező Drop tábla read-only readiness ellenőrzése 404 állapotot ad, ezért a csomagmotor zárva marad.

Az ideiglenes híd hat, sorrendben alkalmazandó migrációból áll. A bootstrap explicit PostgreSQL-tranzakcióban fut, atomi csomaglétrehozást, állapotváltást, tokenhasználatot, token-újrakiadást és token-visszavonást biztosít. A végső migráció sémaverzió-jelölőt ír, ezért régi vagy részleges séma nem nyithatja ki a release gate-et.

Aktuális bootstrap SHA256:

`591250bb1bdda6087b50ff7b94ea2b7a3c40e09301285c2460eba9318d1bae55`

A végleges saját PostgreSQL DATABASE VPS célarchitektúra változatlan. A Supabase-ről történő későbbi átállás csak azonos hat migrációval, export–próbaimport–összehasonlítás–rollback folyamattal történhet.


## DIMPRO Projektkapu – D6 Core – 2026. augusztus 1.

- elsődleges cím: `https://projektkapu.dimpro.hu`;
- rövid alias: `https://door.dimpro.hu`, 301-es átirányítással;
- központi modul: DIMPRO DOCK – ProjektTér;
- további modulok: DRIVE, DROP, DIALOG, DECIDE, DIARY;
- működési elv: az önálló Projektkapu egyprojektes, a DIMPROVER ugyanennek a Project Core-nak a többprojektes felülete;
- közös Project Core MVP: projekt, tagság, szerepkör, jogosultság, lifecycle és audit;
- célállapot: saját PostgreSQL repository, közös Document/Workflow/Communication/Audit/Notification motorokkal;
- a publikus Drop külön fejlesztési körben marad;
- a Projektkapu arculata egységes világos/sötét türkiz–petrol–zsályás-türkiz rendszer, neon lime nélkül.
