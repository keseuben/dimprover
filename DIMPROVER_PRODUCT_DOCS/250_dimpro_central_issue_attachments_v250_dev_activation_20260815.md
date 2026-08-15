# DIMPRO Központi Hibajegyzék – mellékletmunkatér V0.5 DEV aktiválás

Dátum: 2026-08-15
Állapot: DEV AKTÍV
Környezet: `https://app.dev.dimpro.hu`
PROD: nem érintett

## 1. Cél

A Project Issue Core V0.4 már központilag tárolta a HJ ↔ DIMPRO Drive dokumentum/verzió kapcsolatokat. A V0.5 célja az volt, hogy ezek a kapcsolatok a központi `/jegyzokonyvek/hibajegyzek` felületen ténylegesen használható mellékletmunkatérré váljanak.

A V0.5 nem vezet be új fizikai fájltárolót és nem tartalmaz új DB-migrációt. Minden előnézet és letöltés továbbra is a meglévő DIMPRO Drive jogosultsági, object-storage és biztonsági útvonalán történik.

## 2. Megvalósított funkciók

### 2.1. Központi HJ mellékletmunkatér

Új komponens:

`components/minutes/shared/IssueAttachmentWorkspace.tsx`

A HJ részletei alatt teljes szélességű munkatér jelenik meg. Csoportok:

- Fotók (`PHOTO`)
- Tervek (`PLAN`)
- Dokumentumok (`DOCUMENT`)

Megjelenített adatok:

- fájlnév;
- MIME típus;
- fájlméret;
- kapcsolat típusa (`EVIDENCE` / `ATTACHMENT`);
- HJ melléklet verzió;
- Drive document ID rövidített formában;
- Drive version ID rövidített formában;
- melléklet metaadat;
- kapcsolás ideje és létrehozója.

### 2.2. Drive preview

A melléklet Előnézet gombja kizárólag a meglévő:

`POST /api/projects/[projectId]/drive/documents/[documentId]/preview`

route-ot használja.

Következmény:

- `document.read` jogosultság szükséges;
- a Drive security policy változatlanul érvényes;
- a HJ modul nem kap külön, lazább fájlhozzáférési utat;
- PDF és kép inline modalban nyitható meg.

### 2.3. Biztonságos letöltés

A Letöltés gomb a meglévő:

`POST /api/projects/[projectId]/drive/documents/[documentId]/download`

route-ot használja, az adott `driveVersionId` megadásával.

A kliens a rövid életű Drive letöltési URL-t nyitja meg. A HJ modul nem fér közvetlenül az object-storage credentialhöz.

### 2.4. Jogosultságfüggő HJ unlink

A Leválasztás csak `issue.write` jogosultsággal jelenik meg.

Működés:

- megerősítő dialógus;
- `DELETE /api/projects/[projectId]/issues/[issueId]/attachments/[attachmentId]`;
- kötelező `expectedVersion` optimistic lock;
- siker után HJ mellékletlista és központi számlálók frissülnek;
- a DIMPRO Drive dokumentum fizikailag és logikailag megmarad.

Fontos szabály:

**HJ-ról leválasztás ≠ Drive dokumentum törlése.**

### 2.5. HJ audit / eseménytörténet

Új repository:

`app/lib/project-core/issueAuditRepository.ts`

Új API:

`GET /api/projects/[projectId]/issues/[issueId]/audit?limit=80`

Biztonsági szabályok:

- `issue.read` kötelező;
- projekt + issue scope;
- maximum 100 esemény;
- newest-first sorrend;
- no-store cache;
- sémahiba fail-closed.

A HJ részletben megjelennek többek között:

- HJ létrehozás;
- HJ frissítés;
- melléklet kapcsolás;
- melléklet metadata frissítés;
- melléklet leválasztás.

### 2.6. Központi HJ UI

`components/minutes/pages/IssueRegisterPage.tsx`

Új marker:

`data-project-issue-register="0.5.0"`

A jobb oldali adatblokkban megmaradt a kompakt mellékletösszesítő, alatta teljes szélességben nyílik a melléklet- és auditmunkatér.

## 3. Adatmodell

Új DB-migráció nem készült.

A V0.5 a már aktív Project Issue Core V0.4 tábláira és RPC-ire épít:

- `project_issue_attachments`;
- `project_core_entity_links`;
- `project_core_audit_events`;
- `project_issue_attachment_link_atomic`;
- `project_issue_attachment_unlink_atomic`.

A migrációs sorrend továbbra is V0.4-nél végződik.

## 4. Contract és regresszió

Új contract:

`scripts/central-issue-attachments-v250-contract.mjs`

Eredmény:

- V0.5: **55/55 PASS**
- V0.4: **102/102 PASS**
- Field Issue Core V2.3: **70/70 PASS**
- Central Issue Register V2.2: **46/46 PASS**
- Compare Findings V2.1: **45/45 PASS**
- Drive web contract: **206/206 PASS**
- BENJADMIN Plus-only V1.2: **47/47 PASS**
- AI Developer Space V1: **40/40 PASS**
- AI Bridge V1.1: **39/39 PASS**
- Terminal Hub P10.2: **50/50 PASS**
- TypeScript: PASS
- lint: **0 error / 103 meglévő warning**

A V0.4 és V2.2 korábbi marker-contractjai forward-compatible-ra módosultak, de csak az explicit régi vagy V0.5 marker engedélyezett.

## 5. Candidate és valós E2E

V0.5 operator candidate build:

- build: `XV0oTRhV-SlfogvhYuYnX`
- source: `44c2836f6f67ab1bd9708c81e5034933e561e086`

Ezen a candidate-en:

- új audit API authenticated: HTTP 200;
- unauthenticated audit: HTTP 401;
- Drive PDF preview: HTTP 200;
- Drive secure download: HTTP 200;
- teljes V0.4 Drive → HJ runtime E2E: **39/39 PASS**.

A V0.5 ezután össze lett fésülve a párhuzamos BENJADMIN Plus-only V1.2 fejlesztéssel.

## 6. Unified Ármin V1.2 + Jázmin V0.5 release

Végleges unified build:

- pointer: `.next-benjadmin-v12-field-v250-unified`
- build ID: `_WHElecnVqTN-ASeiQC-q`
- source commit: `afd9f70f9830f8c5b776126a922dc59272b98fbb`
- branch: `feat/benjadmin-operator-ui-v2`
- statikus chunk: 245 PASS

Az Ármin stable V1.2 release és az unified source V1.2 runtime-fájljai fájlszinten azonosak voltak. Az unified release csak a Jázmin V0.4/V0.5 kiegészítéseket adta hozzá, így a cutover nem veszített V1.2 hotfixet.

Rollback release a cutover előtt:

- pointer: `.next-benjadmin-plus-v12-stable-final`
- build: `1dWSJOqc7KqMuzEoJsSZ5`

Rollback adat:

`/srv/dimpro-dev/artifacts/benjadmin-v12-field-v250-unified-20260815T230112+0200/`

## 7. Unified candidate acceptance

Ugyanazon `_WHElecnVqTN-ASeiQC-q` builden:

- BENJADMIN V1.2 runtime: **29/29 PASS**
- BENJADMIN V1.2 browser: **11/11 PASS**
- Drive/HJ runtime E2E: **39/39 PASS**
- V0.5 audit API: HTTP 200
- audit unauthenticated: HTTP 401
- PDF preview: HTTP 200
- Drive download: HTTP 200

## 8. DEV cutover és live acceptance

A 3100-as DEV runtime pointere átállt:

`.next-benjadmin-v12-field-v250-unified`

Aktív build:

`_WHElecnVqTN-ASeiQC-q`

PM2:

- service: `dimpro-benjadmin-operator-ui-v2-dev`
- status: online
- unstable restarts: 0
- cwd: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`

Live acceptance a tényleges 3100-as runtime-on:

- BENJADMIN V1.2 runtime: **29/29 PASS**
- BENJADMIN V1.2 browser: **11/11 PASS**
- Drive/HJ runtime E2E: **39/39 PASS**
- V0.5 audit API: HTTP 200
- audit események: 37, ebből 35 melléklet esemény a QA HJ történetében
- audit auth nélkül: HTTP 401
- HJ aktív mellékletlista: 0, a teszt után tiszta állapot
- PDF preview: HTTP 200
- Drive secure download: HTTP 200

A candidate PM2 folyamat törölve lett.

## 9. Biztonsági határok

Nem változott:

- PROD nem érintett;
- SmartSync nincs aktiválva;
- Private Vault nincs aktiválva;
- nincs auth bypass;
- nincs generikus SQL executor;
- object-storage secret nem kerül kliensre;
- HJ unlink nem töröl Drive dokumentumot;
- Drive preview/download saját permission és security policy alatt marad.

## 10. Következő logikus fejlesztési pont

A központi HJ mellékletmunkatér után a Drive használhatósági prioritás a teljes projekt-tárhely workflow lezárása:

`projekt létrehozás → automatikus Drive provisioning → Beérkező Drop mappa → többfájlos/drag&drop webfeltöltés → Gyors KépSend projektcél → tartós Drop→Drive archiválás`.

Ennek részletes fejlesztési helyzet- és megvalósítási terve a következő dokumentumban található:

`251_dimpro_drive_teljes_fejlesztesi_helyzet_es_hatralevo_terv_20260815.md`
