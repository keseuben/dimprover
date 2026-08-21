# DIMPRO Terepi Gyorsrögzítő – P9.1 Projektkapu Drive PROJECT Content binding

Dátum: 2026-08-21
Környezet: DEV-only · PROD DENY
Kiinduló baseline: `68333c261395dc4613b40df3b0131b4459d3dccf`
Branch: `feature/jazmin-terep-p91-project-content-20260821`
Terep kliensverzió: `0.4.5-dev`
Állapot: **SOURCE CANDIDATE – VALIDÁLT**

## 1. Cél és fázishatár

A P9.1 a Terepi Gyorsrögzítő Projektkapu Drive integrációjának szerveroldali biztonsági alapja. Csak a Content Core `PROJECT` ownershipot, a canonical Project Core ACL ellenőrzést és az idempotens Drop → Drive tartalomkötést aktiválja.

A klasszikus Project Drive mappafa (`drive_core_documents` / `drive_core_document_versions`) bekötése P9.2 feladat. A felhasználói Projektkapu Drive kapcsoló továbbra is kikapcsolva marad.

Fail-closed állapot:
- `projectDriveContentBinding`: külön backend readiness;
- `projectDriveTreeBinding=false`;
- `projectDriveUiEnabled=false`;
- `projectDriveBinding=false`;
- a kliensszinkron nem hívja automatikusan a `/project-drive` route-ot;
- a Terep fő phase továbbra is `P0-P8`, amíg a teljes P9 workflow nincs aktiválva.

## 2. PROJECT ownership és ACL

Új repository műveletek: `findProjectContentRef(...)`, `ensureProjectContentRef(...)`.

A projekt referencia:
- `owner_type=PROJECT`;
- `owner_user_id=NULL`;
- `owner_project_id=<canonical project_core_projects.id>`;
- P9.1-ben `folder_id=NULL`;
- `retained_independently=true`;
- idempotens `(owner_project_id, source_system, source_ref)` szerint.

A fizikai Content Object SHA-256 + méret alapján deduplikálható, és ugyanazt a verified Drop → Drive stream-copy motort használja, mint a P8 Saját DIMPRO Drive.

A jogosultsági kapu:
- projekthez kötött Terep session;
- canonical Supabase Project Core;
- aktív Project Core membership a Send user ID/e-mail alias alapján;
- `document.write`;
- írható projekt-életciklus: `DRAFT`, `ACTIVE`, `CLOSING`.
Minden más életciklus fail-closed.

## 3. Fájl- és vírusbiztonság

PROJECT content csak `SERVER_STORED` Field Capture item és `STORED` asset után készülhet. Kötelező az előre kért `PROJECT_DRIVE` destination `PROJECT` ownershippal, érvényes Drop binding, `upload_status=ready`, `processing_status=ready`, `security_status=clean`, `virus_scan_status=clean`, S3-kompatibilis tárhely, érvényes SHA-256 és pozitív méret.

Raw Send/PIN/capability/upload token nem kerül Content Core-ba, destinationbe, sync queue-ba vagy auditba.

Siker után:
- destination `STORED`;
- ownership `PROJECT`;
- scope `PROJECT_ROOT`;
- `projectContentBound=true`;
- `projectDriveTreeBound=false`;
- sync operation `SYNC_PROJECT_DRIVE_CONTENT` / `DONE`;
- audit `PROJECT_DRIVE_CONTENT_STORED`;
- `rawTokenPersisted=false`.

P9.1 minden nem-null `folder_id` értéket megtagad; a Drive mappafa P9.2 feladat.

## 4. API és health

Új backend route:
`POST /api/field-capture/sessions/[sessionId]/items/[itemId]/project-drive`

Védelmek: UUID validáció, Send bearer auth, session-owner check, canonical Project Core ACL, `document.write`, clean Drop gate.

Health:
- `projectDriveContentBinding`;
- `projectDriveContentOwnership=PROJECT`;
- `projectDriveContentScope=PROJECT_ROOT`;
- `projectDriveTreeBinding=false`;
- `projectDriveUiEnabled=false`;
- `projectDriveBinding=false`.

## 5. Acceptance

- P9.1 PROJECT Content contract: **20/20 PASS**
- Project Core ACL runtime E2E: **4/4 PASS**
- P8 User Drive: **14/14 PASS**
- P8 UI: **12/12 PASS**
- F4: **11/11 PASS**
- F5: **16/16 PASS**
- F6: **18/18 PASS**
- client sync: **15/15 PASS**
- finalize: **11/11 PASS**
- P7.1: **12/12 PASS**
- P7: **14/14 PASS**
- staging: **14/14 PASS**
- upload-rules proxy: **6/6 PASS**
- Terep alap acceptance: **66/66 PASS**
- TypeScript / targeted ESLint / `git diff --check`: **PASS**

### Valós Drop → PROJECT Content E2E

Valódi böngészős Terep feltöltés + privát staging + ClamAV + Drive S3 + canonical Project Core ACL:
- QA projekt: `project-040c0035-191`;
- role: `OWNER`;
- `projectContentBound=true`;
- `projectDriveTreeBound=false`;
- első másolás `true`, retry másolás `false`;
- ugyanaz Content Object + PROJECT ref retry esetén: PASS;
- `SERVER_STORED` és asset `STORED`: PASS;
- raw capabilities persisted: `false`;
- page errors `0`, console errors `0`;
- cleanup: capture `0`, Drop package `0`, PROJECT ref `0`.

A DEV teszt Send entitlement projektlistája üres, ezért nem készült hamis entitlement → project mapping. A normál browser upload projekt nélkül futott, majd a service-layer teszt idejére a már `SERVER_STORED` QA session egy valódi, ugyanahhoz a DEV userhez tartozó canonical QA projekthez kapcsolódott. A termék session-create Send project authorization logikája változatlan és fail-closed.

## 6. DEV ClamAV infrastruktúrahiba

A P9.1 E2E közben az INSTREAM scan hibázott. Gyökérok: DEV-en `/tmp` tévesen `700 root:root` volt, ezért a clamd nem tudott temp fájlt létrehozni (`Permission denied`).

Kontrollált DEV maintenance:
`/tmp: 700 root:root → 1777 root:root`

Utóellenőrzés:
- clamav user temp write: PASS;
- ClamAV INSTREAM: `stream: OK`;
- teljes P9.1 E2E: PASS.

PROD nem változott.

## 7. Következő lépés – P9.2

P9.1 release validálás után külön kör:
1. Project Drive provisioning/readiness;
2. célmappa-szabály;
3. Content Object ↔ Drive document/version bridge;
4. idempotens Drive document/version;
5. audit/change event;
6. kliensszinkron PROJECT_DRIVE ág;
7. mobil/browser acceptance;
8. csak ezután `projectDriveUiEnabled=true`.

A P9.1 önmagában nem kapcsolja be a felhasználói Projektkapu Drive mentést.
