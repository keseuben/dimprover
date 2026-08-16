# DIMPRO DEV Storage Retention V1.1 – retired worktree javítás és tárhely-helyreállítás

Dátum: 2026-08-16
Környezet: kizárólag DEV (`/srv/dimpro-dev`)
PROD: nem érintett

## 1. Hiba oka

A DEV szerver néhány hét alatt 98–99%-os lemezhasználatig jutott. A részletes fizikai leltár kimutatta, hogy a probléma nem elsősorban backup, log vagy adatbázis volt.

Kritikus mérés:

- root fájlrendszer: 118 GB;
- `/srv/dimpro-dev/worktrees`: kb. **81 GB**;
- `/srv/dimpro-dev` worktree-k nélkül: kb. **3,1 GB**;
- backup: kb. **2,2 GB**;
- artifact: kb. **270 MB**;
- Git repository: kb. **76 MB**.

A fő ok a párhuzamos AI-fejlesztések során létrejött sok Git worktree volt. A lezárt worktree-kben a forráskód mellett teljes `node_modules` és `.next*` build outputok maradtak.

A korábbi retention V1.0 egyik vakfoltja: worktree-nként védte a legfrissebb 3 buildet. Egy már teljesen integrált, régi worktree egyetlen `.next` buildje ezért továbbra is `newest` védelem alatt maradhatott.

## 2. Worktree audit

A részletes audit:

- Git worktree: 69;
- legalább 24 órája inaktív, clean, canonical baseline-ba integrált, processz- és PM2-mentes worktree: 33;
- ezek logikai mérete: kb. **43,05 GiB**;
- a nagy többségben a foglalás `node_modules` + `.next*` volt.

A teljes worktree-k törlése helyett a biztonságosabb megoldás került alkalmazásra: csak a regenerálható dependency/build tartalom került eltávolításra. A branch, commit, forráskód és worktree struktúra megmaradt.

## 3. Nagy worktree-karbantartás

A 24+ órája lezárt és minden gate-en átment worktree-k közül 23 tartalmazott jelentős regenerálható adatot.

Törlés előtt worktree-nként újra ellenőrzés történt:

- Git status clean;
- HEAD változatlan;
- HEAD a `integration/benjadmin-dev` vagy operator canonical baseline őse;
- nincs futó processz a worktree alatt;
- PM2 nem hivatkozik a worktree cwd-jére;
- kizárólag `node_modules` vagy `.next*` basename törölhető.

Eredmény:

- érintett worktree: 23;
- törölt regenerálható könyvtár: 41;
- logikai törlési méret: **44 427 030 528 byte**, kb. 41,4 GiB;
- manifest: `/srv/dimpro-dev/artifacts/storage-maintenance-merged-worktrees-1786909455`.

A tényleges fájlrendszer-hatás:

- lemezhasználat: **81% → 45%**;
- szabad hely: kb. **21,8 GB → 61,8 GB**;
- worktree tár: **81 GB → 42 GB**.

## 4. Összesített helyreállítás

A teljes karbantartási sorozat során korábban már megtörtént:

1. 20 régi operator `.next*` build törlése;
2. 4 biztos legacy `node_modules` deep-prune;
3. három régi integrált worktree dependency/build takarítása;
4. npm/APT/node-compile/temp cache takarítás;
5. 23 további lezárt worktree regenerálható tartalmának takarítása.

A kiinduló 98–99%-os állapothoz képest a végső állapot:

- root lemez: **45%**;
- root szabad hely: kb. **62 GB**;
- teljes `/srv/dimpro-dev`: kb. **45 GB**;
- ebből worktree: kb. **42 GB**.

Ez azt mutatja, hogy a fennmaradó rendszer + backup + artifact + repository + egyéb DEV tartalom normális nagyságrendű; a rendellenes növekedést a worktree dependency/build réteg okozta.

## 5. Storage Retention V1.1 javítás

Új worktree-retirement szabály:

Egy worktree `retired` állapotúnak minősül build-retention szempontból, ha:

- nem az operator worktree;
- Git clean;
- HEAD canonical baseline-ba integrált;
- legalább 24 órája nincs érdemi build/commit/dependency aktivitás;
- nincs futó processz a worktree alatt;
- PM2 nem hivatkozik a worktree-re;
- nincs aktív koordinált művelet, amely ezt a worktree-t használja.

Retired worktree esetén:

- a `keepNewestPerWorktree` védelem nem tartja meg örökre az egyetlen régi buildet;
- a `.next` név önmagában nem ad örök védelmet;
- aktív/rollback/runtime path védelem továbbra is elsőbbséget élvez;
- a worktree maga automatikusan továbbra sem törlődik;
- backup/artifact automatikusan továbbra sem törlődik;
- `node_modules` automatikus deep-prune továbbra is külön gate alatt marad.

Konfiguráció:

- `worktrees.retireRegenerablesAfterHours = 24`;
- canonical refs: `integration/benjadmin-dev`, `feat/benjadmin-operator-ui-v2`.

## 6. Worktree-létrehozási szabály

Az Ármin által hardenelt `scripts/dimpro-create-dev-worktree.sh` továbbra is kötelező elsődleges worktree-létrehozási út.

Azonos `package-lock.json` esetén Turbopack-safe `cp -al` hardlinkelt dependency-fa készül. Külső `node_modules` symlink tiltott.

Ezzel a jövőbeli worktree-k nem hoznak létre automatikusan új, teljes 1,3–1,5 GB-os dependency-másolatot.

## 7. Acceptance

Storage Retention V1.1 contract:

- **34/34 PASS**.

A contract külön valódi Git-worktree fixture-ben igazolja:

- 72 órás régi commit;
- 30 órás `.next` build;
- clean és main-be integrált worktree;
- az egyetlen/newest `.next` build cleanup candidate lesz;
- `retiredWorktree=true`;
- nincs `newest-3` vagy `protected-name` blokkolás.

Storage Retention Hardening compatibility:

- **13/13 PASS**.

ESLint az érintett retention scriptekre:

- 0 error.

Valódi DEV dry-run a nagy takarítás után:

- lemezhasználat: 45%;
- szabad hely: kb. 61,8 GB;
- régi build candidate: 0;
- aktív runtime változatlan.

## 8. Runtime állapot

A tárhelykarbantartás és retention tooling módosítása nem igényelt runtime cutovert.

Aktív DEV release változatlan:

- pointer: `.next-benjadmin-v13-storage-retention-hardening-final`;
- build: `uAeE_RE6Wld75DZ9JUXHN`;
- PM2: online;
- unstable restart: 0.

## 9. Biztonsági szabály

A jövőben a 85%-os warning küszöb elérése előtt a worktree-létrehozó helper csökkenti az új dependency-másolatokat. 85% felett a post-build retention a régi build outputokat kezeli. A retired-worktree szabály megakadályozza, hogy lezárt worktree-k egyetlen `newest` buildje korlátlan ideig bent maradjon.

A teljes worktree, backup és artifact törlése továbbra is külön, kézi döntést igényel.
