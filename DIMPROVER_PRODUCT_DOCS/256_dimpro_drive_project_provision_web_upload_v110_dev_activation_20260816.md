# DIMPRO Drive Project Provisioning + Web Upload V1.1 - DEV aktiválás

Dátum: 2026-08-16

## Állapot

DEV AKTÍV.

- Aktív pointer: `.next-ben-v13-drive-v110-final`
- Aktív build: `HfISE6GuO1uUrUnHUT4Dz`
- Release source commit: `1e25420190801def449d9e5daa808366a913e347`
- Operator branch: `feat/benjadmin-operator-ui-v2`
- Aktiválás utáni operator HEAD csak tesztfájl-kiegészítést is tartalmaz; a runtime-kód a release source commitnak felel meg.
- PM2: `dimpro-benjadmin-operator-ui-v2-dev`
- Port: `127.0.0.1:3100`
- Unstable restart: 0
- PROD nem érintett.
- SmartSync nem indult.
- Private Vault nem indult.

## Fejlesztési cél

A Drive V1.1 két korábban hiányzó alapfolyamatot aktivál:

1. új Projektkapu projekt létrehozásakor automatikus, idempotens DIMPRO Drive inicializálás;
2. webes többfájlos feltöltési UX külső Windows/asztal drag & drop támogatással, a meglévő privát objektumtárhely és biztonsági lánc megtartásával.

A fejlesztés nem hozott létre új V1.1 adatbázis-migrációt. A meglévő Drive bootstrap, folder repository, signed upload, SHA-256, quarantine és ClamAV szolgáltatásokat használja.

## Project Provisioning V1.1

Új komponens:

- `app/lib/drive-core/projectProvisioning.ts`

Új API:

- `GET /api/projects/[projectId]/drive/provision`
- `POST /api/projects/[projectId]/drive/provision`

Projekt létrehozás integráció:

- `app/api/projects/route.ts`

Fő szabályok:

- a meglévő Drive bootstrap idempotens módon újrahasználódik;
- minden új projektben biztosított a gyökérszintű `Beérkező Drop` mappa;
- párhuzamos vagy ismételt provisioning nem duplikálja a mappát;
- GET jogosultság: `project.read`;
- POST/retry jogosultság: `project.update`;
- ha a Drive provisioning átmenetileg hibázik, a létrehozott projekt nem törlődik; a válasz retry-required állapotot ad.

## Web Upload UX V1.1

Módosított aktív Projektkapu felület:

- `components/project-gate/DriveWorkspace.tsx`
- `components/project-gate/DriveWorkspace.module.css`

Új működés:

- `multiple` fájlválasztás;
- külső OS drag & drop Windows Intézőből / asztalról;
- konkrét kiválasztott célmappa szükséges külső drop esetén;
- fájlonkénti queue állapot:
  - `QUEUED`
  - `UPLOADING`
  - `VERIFYING`
  - `DONE`
  - `ERROR`
- XHR-alapú feltöltési progress;
- maximum 2 párhuzamos feltöltő worker;
- fájlonkénti retry;
- kliensoldali max-upload-size gate;
- üres fájlok kiszűrése.

## Biztonsági lánc

A V1.1 nem vezetett be alternatív vagy gyengébb feltöltési útvonalat.

Megmaradt lánc:

`document.write -> upload/init -> signed PUT -> upload/complete -> objektumméret -> szerveroldali SHA-256 -> quarantine -> ClamAV -> review / AVAILABLE`

Biztonsági szabályok:

- storage credential nem kerül a klienshez;
- signed URL rövid életű és projektjogosultsághoz kötött;
- server-side object size és SHA-256 ellenőrzés kötelező;
- ClamAV ugyanazt a hitelesített objektumot vizsgálja;
- scanner nélkül a jóváhagyás fail-closed;
- PROD / SmartSync / Private Vault nincs bekapcsolva.

## Contract és statikus tesztek

- Drive Project Provisioning + Web Upload V1.1: `47/47 PASS`
- teljes Drive regresszió: `206/206 PASS`
- Central Issue Attachments V2.5: `55/55 PASS`
- Field Issue Attachments V2.4: `102/102 PASS`
- BENJADMIN next-chain contract: `15/15 PASS`
- BENJADMIN Plus-only V1.2 kompatibilitás: `47/47 PASS`
- TypeScript: PASS
- lint: 0 error; a meglévő warning-készlet változatlan nagyságrendű.

## Exact candidate

Candidate build:

- `.next-ben-v13-drive-v110-final`
- `HfISE6GuO1uUrUnHUT4Dz`

Candidate PM2 a végső E2E előtt:

- online;
- 0 restart;
- 0 unstable restart;
- port 3220 kizárólag a candidate build számára.

A korábbi 3220-as candidate folyamatot az E2E előtt eltávolítottuk, mert portütközést okozott. Az ütközés nem érintette a 3100-as fő DEV runtime-ot.

## Valós Drive V1.1 runtime E2E

Candidate és live 3100 runtime-on egyaránt PASS.

Eredmény: `40/40 PASS`.

Igazolt fő lépések:

1. unauthenticated projekt create tiltva;
2. új projekt HTTP 201;
3. automatikus Drive provisioning;
4. provisioning ready;
5. `Beérkező Drop` létrejön;
6. idempotens provisioning retry;
7. pontosan egy `Beérkező Drop` gyökérmappa;
8. default Drive projektmappák létrejönnek;
9. kézi almappa létrehozható;
10. 3 külön valós fájl upload init;
11. 3 signed object PUT HTTP 200;
12. 3 upload complete;
13. 3 szerveroldali SHA-256 ellenőrzés;
14. 3 `CLEAN` ClamAV scan;
15. mindhárom dokumentum a célmappában megjelenik;
16. Drive health object write + security ready.

Live QA projekt a végső 3100 E2E-ből:

- `project-d52e21bc-dfe`

A QA fájlok audit bizonyítékként DEV-ben maradhatnak; közvetlen SQL törlés nem szükséges.

## BENJADMIN unified release kompatibilitás

Ugyanez a build tartalmazza a BENJADMIN V1.3 next-chain runtime kódját.

- next-chain runtime acceptance: `12/12 PASS`
- browser acceptance: `9/9 PASS`

Igazolt lánc:

`task complete -> Ben-AI waiting rebalance -> READY_FOR_PLUS_PULL -> Folytasd -> PULLED -> RUNNING`

A next-chain audit `productionAccess: DENY` marad.

## Cutover és rollback

Cutover előtti backup artifact:

- `/srv/dimpro-dev/artifacts/drive-v110-cutover-20260816T075213+0200`

Előző pointer:

- `.next-benjadmin-v13-pull-feedback-final`
- build: `Xj1I9F74A1fDjeSsojZHf`

Új pointer:

- `.next-ben-v13-drive-v110-final`
- build: `HfISE6GuO1uUrUnHUT4Dz`

A pointerváltás koordinált `operation:restart` lock alatt történt, hibára rollback trap készült.

## Live állapot

A végső ellenőrzéskor:

- PM2 online;
- 127.0.0.1:3100 aktív;
- 3220 candidate port lezárva;
- unstable restart: 0;
- aktív build: `HfISE6GuO1uUrUnHUT4Dz`;
- Drive V1.1 live E2E: 40/40 PASS;
- BENJADMIN next-chain live runtime: 12/12 PASS;
- BENJADMIN next-chain live browser: 9/9 PASS.

## Következő javasolt fejlesztési szelet

1. Drive provisioning repair/admin UX projektbeállításokban;
2. Web Upload V1.2: pause/cancel, batch metadata, per-file célmappa, nagyobb queue kezelése;
3. központi HJ attachment workspace további preview/unlink/audit UX;
4. Drop -> `Beérkező Drop` tartós projektrouting;
5. Desktop bridge előkészítés csak ezután.

SmartSync és Private Vault külön, explicit jóváhagyott fejlesztési kör marad.
