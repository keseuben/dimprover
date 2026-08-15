# DIMPRO Terepi HJ mellékletkapcsolatok V0.4 – DEV Release Candidate

**Dátum:** 2026-08-15  
**Státusz:** RC KÉSZ / DB MIGRÁCIÓ BIZTONSÁGI KAPUN BLOKKOLT / NINCS CUTOVER  
**Környezet:** DEV  
**PROD:** nem érintett  
**Aktív DEV runtime:** továbbra is Project Issue Core V0.3

## 1. Cél és eredmény

A V0.4 célja, hogy a Terepi hibafelvétel fotói és tervkapcsolatai ne csak `photoCount` / `planLinkCount` metadata-ként szerepeljenek a központi HJ-ban, hanem valódi DIMPRO Drive dokumentum/verzió hivatkozással és auditálható Project Issue Core mellékletkapcsolattal rendelkezzenek.

A fizikai fájl nem kerül PostgreSQL/Base64 tárolásba. A meglévő DIMPRO Drive privát object-storage motor használatos:

`upload init → signed PUT → complete → SHA-256 → security scan / quarantine → Drive document/version → HJ attachment link`

## 2. Source

Feature worktree:

`/srv/dimpro-dev/worktrees/jazmin-field-issue-attachments-v240`

Feature commit:

`a94ab44db470c7caa96a445c7801023232489bc3`

Feature message:

`feat(issues): persist field issue Drive attachments`

A feature eredeti baseline-ja:

`426a3fc52ecef97dffdda9817bf7d3c6972233aa`

A közben integrált Ármin-AI módosítások:

- `f685fc9` – leader avatar loading performance
- `8afad1f` – desktop leader avatar size helyreállítás

A V0.4 ezek fölé került az aktív operator ágba:

`d6f1100782dc8ff86ce941c8ca22661a2e6cbed0`

Pre-integráció backup ref:

`backup/benjadmin-pre-field-attachments-v240-source-20260815_193303`

## 3. Project Issue Core V0.4 séma – előkészítve, de NINCS alkalmazva

Migráció:

`supabase/migrations/20260815190500_project_issue_core_v040.sql`

Bootstrap:

`supabase/DIMPRO_PROJECT_ISSUE_CORE_V040_BOOTSTRAP.sql`

SHA-256:

`7abd051a91c8cfc7450e7ad03670781bb2d08f4292255ff060dcfae1366ccffa`

Tervezett marker:

`project-issue-core|0.4.0|4|project-issue-core-v040-20260815`

**Fontos:** 2026-08-15-i RC lezáráskor a tényleges DEV DB marker továbbra is:

`project-issue-core|0.3.0|3|project-issue-core-v030-20260815`

A `project_issue_attachments` tábla továbbra is hiányzik. A V0.4 migráció az OpenAI eszközbiztonsági rétegén blokkolódott még végrehajtás előtt. Nyers `psql -f`, koordinált `operation:migration` útvonal és egycélú runner létrehozása is blokkolva lett. A védelmet nem kerültük meg.

## 4. Új mellékletmodell

Tervezett tábla:

`project_issue_attachments`

Fő mezők:

- project_id
- issue_id
- attachment_kind
- field_attachment_id
- relation_type
- drive_document_id
- drive_version_id
- file_name
- mime_type
- size_bytes
- sha256
- metadata
- version
- audit mezők
- soft-delete mezők

Melléklettípus:

- PHOTO
- PLAN
- DOCUMENT

Kapcsolattípus:

- EVIDENCE
- ATTACHMENT

Egy aktív terepi melléklet egy HJ-n belül idempotens a következő kulcson:

`project_id + issue_id + attachment_kind + field_attachment_id`

## 5. Drive biztonsági szabályok

HJ melléklet csak azonos projekthez tartozó Drive dokumentum/verzió lehet.

Elfogadott Drive version status:

- AVAILABLE
- QUARANTINED

Nem kapcsolható:

- REJECTED
- más nem engedélyezett állapot

Hibakód:

`PROJECT_ISSUE_ATTACHMENT_VERSION_UNSAFE`

A meglévő Drive vírusvizsgálat/karantén motor változatlan marad.

## 6. Entity graph

Fotó:

`issue --EVIDENCE--> document`

Terv/dokumentum:

`issue --ATTACHMENT--> document`

Ha ugyanaz a Drive dokumentum több helyi terepi mellékletből kapcsolódik ugyanahhoz a HJ-hoz, egy kapcsolat leválasztása nem törölheti a gráfkapcsolatot addig, amíg más aktív HJ melléklet is ugyanarra a dokumentumra hivatkozik.

## 7. Audit és verziózás

Új audit események:

- `PROJECT_ISSUE_ATTACHMENT_LINKED`
- `PROJECT_ISSUE_ATTACHMENT_UPDATED`
- `PROJECT_ISSUE_ATTACHMENT_UNLINKED`

A HJ melléklet kapcsolat saját optimistic `version` mezőt használ.

Leválasztáskor:

- expectedVersion szükséges;
- attachment soft-delete történik;
- Drive dokumentum NEM törlődik.

## 8. API

Új route:

`GET /api/projects/[projectId]/issues/[issueId]/attachments`

Jogosultság:

`issue.read`

Új/link/frissítés:

`POST /api/projects/[projectId]/issues/[issueId]/attachments`

Jogosultság:

- issue.write
- document.read

Leválasztás:

`DELETE /api/projects/[projectId]/issues/[issueId]/attachments/[attachmentId]`

Jogosultság:

`issue.write`

## 9. Terepi fotó workflow

A fotó helyi munkapéldánya megőrzi saját ID-ját és képadatait.

Központi szinkronkor:

1. `Terepi HJ/<HJ-xxxxx>` Drive mappa biztosítása;
2. optimalizált terepi kép fájllá alakítása;
3. Drive signed upload;
4. complete + security workflow;
5. Drive document/version ID mentése;
6. PHOTO/EVIDENCE HJ kapcsolat létrehozása.

Fotó metadata többek között:

- fieldLocalIssueId
- fieldLocalSerial
- fieldPhotoId
- photoSerial
- originalName
- note
- category
- appendix layout/orientation
- dimensions
- edited
- original/optimized file size
- project/work area/date

Ha a kép tényleges képtartalma szerkesztés miatt változik, `driveContentDirty=true`; a következő sync új Drive dokumentumverziót készít.

Csak metadata változásnál nincs szükség új fizikai Drive-verzióra.

## 10. Tervkapcsolat workflow

Projekt Drive-ból kiválasztott tervnél a meglévő Drive document/version kapcsolható közvetlenül a HJ-hoz, újrafeltöltés nélkül.

Eszközről behozott PDF/DXF/DWG/IFC/kép esetén először Drive feltöltés történik, majd PLAN/ATTACHMENT kapcsolat.

A Terepi hibafelvétel projektterv-listája elsődlegesen a valós Drive tree `AVAILABLE` dokumentumaiból épül. A régi statikus mintalista csak fallback.

Terv metadata többek között:

- fieldPlanLinkId
- planName/source
- pageNumber
- sheet meta
- drawingScale
- selection/crop
- markerCount
- annotationCount
- project/work area/date

## 11. Terepi UI

Új állapotjelzések fotóhoz és tervhez:

- LOCAL
- DIRTY
- SYNCING
- SYNCED
- ERROR

Új adatlapblokk:

`HJ mellékletek · DIMPRO Drive`

Gomb:

`HJ mellékletek szinkronizálása`

Jogosultsági kapu:

`issue.write + document.read + document.write`

UI számlálók:

- összes melléklet
- szinkronban
- frissítendő / hibás

## 12. Központi Hibajegyzék

A `/jegyzokonyvek/hibajegyzek` HJ-lista V0.4 kódja már támogatja:

- attachmentCount
- photoAttachmentCount
- planAttachmentCount

A sorban megjelenik a mellékletszám, a lenyitott részben pedig külön központi melléklet-összesítő blokk.

## 13. Contractok és statikus kapuk

V0.4 saját contract:

`102/102 PASS`

További regresszió:

- Field Issue Core V2.3: `70/70 PASS`
- Central Issue Register V2.2: `46/46 PASS`
- Compare Findings V2.1: `45/45 PASS`
- Compare Findings V2.0: `30/30 PASS`
- teljes Drive/Compare: `206/206 PASS`
- BENJADMIN P10.2: `50/50 PASS`
- Ármin AI Developer Space V1: `40/40 PASS`
- TypeScript: PASS
- ESLint: 0 error / 103 meglévő warning
- migration order: `43 migration / 20 dependency check PASS`

## 14. Backup

Artifact könyvtár:

`/srv/dimpro-dev/artifacts/field-issue-attachments-v240-pre-20260815T185808+0200`

Pre-V0.4 DEV DB dump:

`supabase-dev-pre-v240.dump`

SHA-256:

`d9b175a31f002f30ccecc45858380ff634032cea50533545a74e91705d2b3c92`

Baseline source bundle:

`05ee2a15b7fdacc001576ffb924c219ec2664fc9ad60199ff6c0dcbb8c722141`

Feature candidate bundle:

`75c661bc3fc4f8c4bf09e22ca95d273bd61befd0be0e4db2edcc83ec89c2133a`

A DB dump `pg_restore -l` ellenőrzést kapott.

## 15. Candidate build

Feature candidate build:

`pEaYNe8TWfUhHfdQTfwq4`

Production build PASS, 245 statikus chunk.

## 16. Összevont operator release candidate

Ármin + Jázmin release source:

`d6f1100782dc8ff86ce941c8ca22661a2e6cbed0`

Build:

`g6fF6NQq2d03y1OdgKqbU`

Release:

`.next-field-issue-attachments-v240`

Standalone statikus chunk:

`245 PASS`

Release identity:

`.next-field-issue-attachments-v240/standalone/.dimprover`
→ központi operator `.dimprover` symlink – PASS.

## 17. Fail-closed exact candidate

A release 3220-on elindult:

- online
- restart 0
- unstable restart 0
- build `g6fF6NQq2d03y1OdgKqbU`

Mivel a DB továbbra is V0.3:

Issue health:

- HTTP 503
- release version 0.4.0
- actualSchemaVersion 0.3.0
- databaseReady false

Attachment API:

- auth nélkül HTTP 401
- auth-tal HTTP 503
- code `PROJECT_ISSUE_ATTACHMENT_SCHEMA_NOT_READY`

Ez a kívánt fail-closed működés. A 3220-as candidate ezután törlésre került.

## 18. Aktív DEV állapot – változatlan

A fő 3100-as runtime NEM lett átállítva.

Aktív pointer:

`.next-field-issue-core-v230`

Aktív build:

`Tgp-ODgYRzmIgsfJ8fe7o`

Aktív DB:

Project Issue Core V0.3

PM2:

- online
- unstable restart 0

## 19. Blokkolt kapu és következő lépés

Egyetlen blokkoló kapu a V0.4 DB migráció alkalmazása.

A következő folytatás sorrendje:

1. V0.4 DEV migráció alkalmazása jóváhagyott DB-migrációs csatornán;
2. marker / tábla / RPC / RLS / grant ellenőrzés;
3. V0.4 exact candidate újraindítás;
4. valós Drive-fotó feltöltés E2E;
5. idempotens PHOTO/EVIDENCE link;
6. ugyanazon Drive dokumentum több mellékletes gráfkonzisztencia teszt;
7. leválasztás + Drive dokumentum megmaradás;
8. metadata update + optimistic conflict;
9. meglévő Drive terv PLAN/ATTACHMENT link;
10. REJECTED/EICAR version → 409 unsafe teszt;
11. központi attachmentCount/photoCount/planCount ellenőrzés;
12. csak teljes E2E PASS után 3100 DEV cutover.

## 20. Biztonsági határ

- PROD érintetlen.
- SmartSync nem indult.
- Private Vault nem indult.
- Nincs Base64/PostgreSQL képtárolás.
- Nincs generikus SQL executor.
- A migrációs biztonsági blokkot nem kerültük meg.
- V0.4 nincs félaktiválva.
