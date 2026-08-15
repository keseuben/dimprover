# DIMPRO Terepi HJ mellékletkapcsolatok V0.4 – DEV aktiválás

**Dátum:** 2026-08-15  
**Státusz:** DEV AKTÍV / E2E LEZÁRVA  
**PROD:** nem érintett  
**SmartSync / Private Vault:** nem indult

## 1. Aktivált funkció

A Terepi hibafelvétel fotói és tervkapcsolatai most már valódi, auditálható Project Issue Core mellékletek. A fizikai fájl a meglévő DIMPRO Drive privát object-storage motorban marad; a HJ adatbázis csak Drive document/version hivatkozást és metaadatot tárol.

Fotó:

`Terepi fotó → Drive signed upload → SHA-256 → security scan → Drive document/version → PHOTO/EVIDENCE → HJ`

Terv:

`Drive terv/document version → PLAN/ATTACHMENT → HJ`

Eszközről behozott tervnél előbb Drive feltöltés történik, majd a HJ kapcsolat.

## 2. Project Issue Core V0.4

Migráció:

`supabase/migrations/20260815190500_project_issue_core_v040.sql`

SHA-256:

`7abd051a91c8cfc7450e7ad03670781bb2d08f4292255ff060dcfae1366ccffa`

Aktív marker:

`project-issue-core|0.4.0|4|project-issue-core-v040-20260815`

Új tábla:

`project_issue_attachments`

Új RPC-k:

- `project_issue_attachment_link_atomic(text,text,jsonb,text,text)`
- `project_issue_attachment_unlink_atomic(text,text,text,integer,text,text)`

Biztonság:

- RLS aktív;
- anon/authenticated közvetlen tábla-hozzáférés tiltva;
- link/unlink RPC anon/authenticated EXECUTE tiltva;
- service_role CRUD + RPC engedélyezve;
- REJECTED Drive-verzió nem kapcsolható;
- HJ leválasztás nem törli a Drive dokumentumot;
- nincs Base64/PostgreSQL képtárolás.

## 3. Dedikált DEV migration gate

A nyers SQL apply helyett célhoz kötött, fail-closed gate készült:

- `scripts/project-issue-v040-migration-gate.mjs`
- `scripts/project-issue-v040-migration-gate-contract.mjs`

Integrált commit:

`31dc831 chore(issues): add guarded V0.4 DEV migration gate`

Contract:

`43/43 PASS`

A gate fixen ellenőrzi:

- migrációs fájl és SHA-256;
- DEV Supabase cél;
- pontos V0.3 baseline;
- QA sentinel projekt + HJ-00001 + HJ-00002;
- explicit DEV-only approval phrase;
- teljes `pg_dump` backup;
- `pg_restore --list` visszaolvashatóság;
- post-migration schema marker/tábla/RPC;
- RLS és grantok;
- QA HJ-k üzleti állapotának deep-equality megőrzése.

Nem generikus SQL executor.

## 4. Migráció backup és eredmény

Új, közvetlen apply előtti teljes DEV DB backup:

`/srv/dimpro-dev/backups/project-issue-v040/20260815T192901Z/supabase-dev-pre-project-issue-v040.dump`

SHA-256:

`d6b4cd621acce6bb935d32359decef3094d95d5952636295381386d69a367d66`

`pg_restore --list`: PASS.

Schema átállás:

`0.3.0 / migration_count 3 → 0.4.0 / migration_count 4`

QA HJ-k állapota a migráció alatt változatlan maradt.

## 5. HJ mellékletmodell

Típusok:

- PHOTO
- PLAN
- DOCUMENT

Kapcsolatok:

- EVIDENCE
- ATTACHMENT

Idempotens aktív kulcs:

`project_id + issue_id + attachment_kind + field_attachment_id`

Optimistic attachment versioning aktív.

Audit események:

- `PROJECT_ISSUE_ATTACHMENT_LINKED`
- `PROJECT_ISSUE_ATTACHMENT_UPDATED`
- `PROJECT_ISSUE_ATTACHMENT_UNLINKED`

Ha ugyanazt a Drive dokumentumot több aktív HJ-melléklet használja, egy kapcsolat leválasztása nem törli a közös entity graph kapcsolatot addig, amíg más aktív hivatkozás megmarad.

## 6. Terepi UI

A Terepi hibafelvétel most:

- valós Drive projektterveket listáz;
- projekt Drive dokumentum/version ID-t őriz;
- fotókat Drive-ba tölt;
- szerkesztett fotónál új Drive-verziót tud létrehozni;
- projektkönyvtári tervet újrafeltöltés nélkül kapcsol;
- eszközről betöltött tervet előbb Drive-ba ment;
- megjeleníti a LOCAL / DIRTY / SYNCING / SYNCED / ERROR állapotot;
- külön `HJ mellékletek szinkronizálása` műveletet ad;
- `issue.write + document.read + document.write` jogosultságot követel.

## 7. Központi Hibajegyzék

A központi HJ lista már visszaadja és megjeleníti:

- `attachmentCount`
- `photoAttachmentCount`
- `planAttachmentCount`

A lenyitott HJ-részlet külön melléklet-összesítőt tartalmaz.

## 8. V0.4 runtime E2E

Script:

`scripts/field-issue-attachments-v240-runtime-e2e.mjs`

Unified candidate eredmény:

`39/39 PASS`

Artifact:

`/srv/dimpro-dev/artifacts/benjadmin-v11-field-v240-unified-20260815T214227+0200/v240-runtime-e2e-unified.log`

SHA-256:

`bc39b19d69979a7e7530fae5b0bdc7297c29b3a6980b095dd86fa2767f59e10a`

Valósan ellenőrzött folyamat:

1. Issue Core auth/health;
2. HJ-00002 FIELD_CAPTURE;
3. valódi Drive signed upload;
4. privát S3 PUT;
5. complete + szerver SHA-256;
6. PHOTO/EVIDENCE create;
7. idempotens repeat;
8. metadata update → attachment v2;
9. stale unlink → HTTP 409;
10. két attachment ugyanarra a Drive dokumentumra;
11. entity graph megőrzés első unlink után;
12. graph törlés utolsó unlink után;
13. Drive dokumentum megmarad;
14. PLAN/ATTACHMENT create;
15. PLAN idempotencia;
16. központi mellékletszámlálók;
17. REJECTED EICAR → HTTP 409 `PROJECT_ISSUE_ATTACHMENT_VERSION_UNSAFE`;
18. cleanup után aktív HJ mellékletlista üres;
19. audit 3 linked / 1 updated / 3 unlinked az adott E2E futásban.

A QA bizonyíték Drive dokumentum megmaradt:

`drive-document-f4121ea18e6b`

## 9. Ármin V11 + Jázmin V0.4 unified release

Ármin V11 külön release-e már aktív volt a V0.4 cutover előtt, ezért a V0.4 nem válthatta vissza a runtime-ot korábbi buildre.

A két fejlesztési ág összevonása után új unified release készült.

Release:

`.next-benjadmin-v11-field-v240-unified`

Build:

`AYDYKkH-j2894_4NduMJF`

Immutable release source:

`8ee7e1722b63e1e3cdfc041c0936c2dab19a0a86`

Branch:

`feat/benjadmin-operator-ui-v2`

Standalone chunk ellenőrzés:

`245 PASS`

A későbbi `fc1c17c` Ármin commit kizárólag dokumentációs változás volt, ezért nem igényelt új runtime buildet.

## 10. Ármin V11 regresszió az unified builden

Unified candidate 3220:

- V11 runtime acceptance: `25/25 PASS`
- V11 security acceptance: `8/8 PASS`
- V11 browser acceptance: `12/12 PASS`

Artifact hash-ek:

- runtime: `900467dda5d65a9b3d5104a97fb6b1b9a7816b73d91e615007f3fd6a1c71de94`
- security: `b7bd9f2d6e6dcdb08c06b4d94f0205e71e0af68d7333e507e274c9cfedd64b9e`
- browser: `becde8ad2e918990c4a22c1e996a192258e7f2bda9b889f99941496234d2de26`

A titokmaszkolás, DEV-only handoff és PROD-deny megmaradt.

## 11. Statikus regresszió

Végső egyesített kapuk:

- Field Issue Attachments V2.4: `102/102 PASS`
- Field Issue Core V2.3: `70/70 PASS`
- Central Issue Register V2.2: `46/46 PASS`
- Compare Findings V2.1: `45/45 PASS`
- teljes Drive/Compare: `206/206 PASS`
- Project Issue V0.4 migration gate: `43/43 PASS`
- BENJADMIN AI Bridge V1.1: `39/39 PASS`
- BENJADMIN AI Developer Space V1: `40/40 PASS`
- runtime build identity: `19/19 PASS`
- BENJADMIN Terminal Hub P10.2: `50/50 PASS`
- migration order: `43 migration / 20 dependency check PASS`
- TypeScript: PASS
- ESLint: `0 error / 103 meglévő warning`

A P10.2 contractot forward-compatible szekcióhatárral javítottuk: a P10.2 saját blokkja továbbra is minimum 12 px, az utána következő V11 CSS már nem számít bele a P10.2 ellenőrzésbe.

## 12. DEV cutover

Pre-cutover rollback pointer:

`.next-benjadmin-ai-bridge-v11-final`

Pre-cutover build:

`MRUtvwU8fqo4rvDtgbTYt`

Új aktív pointer:

`.next-benjadmin-v11-field-v240-unified`

Aktív build:

`AYDYKkH-j2894_4NduMJF`

PM2:

- `dimpro-benjadmin-operator-ui-v2-dev`
- port 3100
- online
- unstable restart 0

A cutover központi restart lock alatt történt.

## 13. Élő 3100 acceptance

Script:

`scripts/field-issue-attachments-v240-live-acceptance.mjs`

Eredmény:

`36/36 PASS`

Artifact:

`/srv/dimpro-dev/artifacts/benjadmin-v11-field-v240-unified-20260815T214227+0200/live-acceptance.log`

SHA-256:

`281149c4d7f3da48d990d2379c38474546b91ba6d9187cc136c2cfd477745b54`

Élő V11 browser acceptance:

`12/12 PASS`

SHA-256:

`d3c43f3415d6da7c6faa9b57d61619bc6d17510d05b0d04b4dab11e2477c359b`

A live acceptance többek között igazolta:

- aktív pointer/build;
- PM2 online / unstable restart 0;
- Hibajegyzék login gate;
- Terepi HJ login gate;
- projectId megőrzés;
- unauth Issue/attachment tiltás;
- Issue Core 0.4.0 ready;
- HJ-00001 és HJ-00002 üzleti állapot;
- HJ-00002 aktív mellékletlista üres;
- Drive Core ready;
- privát object storage aktív;
- ClamAV PONG / ready;
- Compare Findings V2 ready;
- QA fotó Drive dokumentum megmaradt;
- EICAR dokumentum továbbra REJECTED;
- runtime build/source/release identity exact;
- V0.4 audit összesen `linked=6 / updated=2 / unlinked=6`;
- V11 browser acceptance 12/12.

## 14. Candidate cleanup

A 3220-as unified candidate a live acceptance után törlésre került.

Aktív alkalmazásport:

`127.0.0.1:3100`

3220 nincs használatban.

## 15. Biztonsági határ

- PROD nem kapott migrációt, kódot vagy restartot.
- SmartSync nem indult.
- Private Vault nem indult.
- nincs generikus SQL executor.
- nincs titok dokumentálva.
- web login auth nincs gyengítve.
- Drive DEV token kizárólag API tesztekhez maradt.

## 16. Következő logikus fejlesztési szelet

V0.4 után a következő biztonságos irány a **Központi HJ mellékletkezelő V0.5**:

- a Hibajegyzék részleteiben valós mellékletlista;
- fotó/terv típus szerinti csoportosítás;
- Drive preview/open;
- letöltés csak meglévő Drive security policy szerint;
- audit/history megjelenítés;
- jogosultságfüggő unlink;
- később PDF/XLSX HJ riport melléklet-összesítővel.
