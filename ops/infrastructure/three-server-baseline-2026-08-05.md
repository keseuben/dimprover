# DIMPRO háromszerveres infrastruktúra – alapállapot

Dátum: 2026-08-05
Utolsó rögzítés: 2026-08-05 00:55 CEST

## Szerverek

- PROD: jelenleg `vps.dimprover.hu` – `213.160.68.24`
  - tervezett egységes cím: `prod.dimpro.hu`
  - tervezett belső hosztnév: `dimpro-prod`
- DEV: `dev.dimpro.hu` – `213.160.68.32` – belső hosztnév: `dimpro-dev`
- DB: `db.dimpro.hu` – `213.160.68.33` – belső hosztnév: `dimpro-db`

## Külső tárhelyek

- Hetzner Object Storage
  - felhasználói és projektfájlok
  - DIMPRO Drive és DIMPRO Drop
  - képek, PDF-ek, dokumentumok és ZIP-fájlok
  - kulcsorientált/prefixes életciklus
  - S3 API, nem szerverlemez és nem adatbázis

- Hetzner BX11 Storage Box
  - titkosított külső biztonsági mentés
  - PostgreSQL dumpok
  - Nginx-, PM2-, tűzfal- és telepítési konfigurációk
  - release- és rollback-csomagok
  - Restic vagy Borg kliensoldali titkosítással

Tárolási alapelv:
- aktív alkalmazás és PostgreSQL helyi SSD-n;
- felhasználói fájlok Object Storage-ban;
- biztonsági mentések BX11-en;
- helyi régi backup/build állomány csak sikeres külső mentés, integritásellenőrzés és szükség szerint restore-próba után törölhető.

## Elkészült

- DEV és DB: Ubuntu 24.04 LTS
- DEV és DB: egységes hosztnév/FQDN
- DEV és DB: Europe/Budapest időzóna
- DEV és DB: root jelszavas SSH tiltva, kulcsos root hozzáférés megtartva
- DEV és DB: `dimproadmin` sudo felhasználó
- DEV és DB: UFW aktív, alapértelmezett bejövő tiltás
- DEV: 22, 80, 443 engedélyezve
- DB: 22, 80, 443 engedélyezve; 5432 csak PROD és DEV IPv4-címről
- DEV és DB: Fail2ban telepítve és aktív, `sshd` jail működik
- DEV és DB: unattended-upgrades telepítve, engedélyezve és aktív
- PROD → DEV és PROD → DB SSH-kulcsos kapcsolat működik
- A belépési MOTD egyértelműen jelzi a DEV és DB környezetet

## Következő folytatási pont

1. Külön MCP telepítése a DEV szerverre:
   - név: `DIMPRO_DEV_MCP`
   - végpont: `mcp-dev.dimpro.hu`
   - fejlesztési, fájlkezelési, build-, teszt- és kiadási eszközök

2. Külön MCP telepítése a DB szerverre:
   - név: `DIMPRO_DB_MCP`
   - végpont: `mcp-db.dimpro.hu`
   - korlátozott szerver-, PostgreSQL-, migráció- és mentéskezelés

3. Szerverközi átadási rendszer kialakítása:
   - DEV → PROD release átadás
   - DEV → DB migrációátadás
   - SHA-256 ellenőrzés
   - naplózás és rollback

4. PostgreSQL 16 telepítése és biztonságos konfigurálása a DB szerveren.

5. DEV fejlesztői környezet telepítése: Node.js 22, npm/pnpm, PM2, Git, Nginx, Certbot, build- és teszteszközök.

6. Hetzner Object Storage és BX11 felügyeleti állapotának beépítése a DIMPRO Fejlesztési és Infrastruktúra Központba:
   - kapcsolatállapot
   - tárhelyhasználat
   - utolsó sikeres mentés
   - mentés integritása
   - restore-próba dátuma
   - életciklus- és megőrzési szabályok

## Külső partnernek készülő fejlesztések ajánlott folyamata

A külső partnernek készülő alkalmazást alapértelmezetten nem közvetlenül a partner éles szerverén kell fejleszteni.

Ajánlott folyamat:
1. fejlesztés a DIMPRO DEV szerveren, külön projektmappában/repositoryban;
2. külön partner staging vagy előnézeti környezet;
3. tesztelés és partneri elfogadás;
4. verziózott release-csomag vagy CI/CD kiadás;
5. telepítés a partner éles környezetébe;
6. kiadás utáni smoke check és rollback lehetőség.

Lehetséges élesítési modellek:
- Partner tulajdonú szerver/tárhely: a DIMPRO DEV-ről verziózott kiadás a partner szerverére, dedikált deploy-felhasználóval és SSH-kulccsal.
- DIMPRO által üzemeltetett partnerkörnyezet: külön partneralkalmazás vagy elkülönített tenant a DIMPRO infrastruktúrán, szerződéses üzemeltetéssel.
- Hibrid modell: alkalmazás a partner szerverén, fájl- vagy backup-integráció a DIMPRO külső tárhelyeivel, kizárólag szerződés és adatvédelmi jóváhagyás alapján.

Kötelező elkülönítés:
- külön repository vagy legalább külön projektmappa;
- külön környezeti változók és titkok;
- külön adatbázis és felhasználó;
- külön domain/subdomain;
- külön mentési és megőrzési szabály;
- külön jogosultságok;
- partneradatok nem keverhetők a DIMPRO saját fejlesztési adataival.

## Kötelező későbbi feladat – PROD egységes átnevezése

A meglévő éles szervert karbantartási ablakban, mentés és szolgáltatásellenőrzés mellett egységesíteni kell:

- tervezett rövid hosztnév: `dimpro-prod`
- tervezett FQDN: `prod.dimpro.hu`
- jelenlegi adminisztratív/korábbi cím: `vps.dimprover.hu`

Az átnevezés előtt ellenőrizendő: DNS, Nginx, PM2, PostgreSQL/Supabase kapcsolatok, mentési scriptek, MCP, tanúsítványok, `/etc/hosts`, monitoring és minden hardcoded `ubuntu` vagy `vps.dimprover.hu` hosztnév-hivatkozás.

## Környezetnevek használata

- `PROD` / éles szerver → tervezetten `prod.dimpro.hu`
- `DEV` / fejlesztői szerver → `dev.dimpro.hu`
- `DB` / adatbázis-szerver → `db.dimpro.hu`
- `OBJECT` / felhasználói fájltár → Hetzner Object Storage
- `BACKUP` / külső mentéstár → Hetzner BX11 Storage Box

Éles szervert érintő műveletnél külön jelezni kell: `ÉRINTETT KÖRNYEZET: PROD / ÉLES`.
Adatbázis destruktív műveletnél külön jelezni kell: `ÉRINTETT KÖRNYEZET: DB / DESTRUKTÍV MŰVELET`.