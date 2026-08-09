# 04 Adatmodellek

## Terepi hiba

A terepi hiba fő adatai:

- azonosító
- sorszám
- cím
- helyszín
- leírás
- súlyosság
- felelős vállalkozó
- kapcsolattartó
- határidő
- státusz
- megjegyzés

## Tervi marker

A `PlanIssueMarker` hibajegyhez kötött tervi jelölést ír le:

- `issueId`
- `serial`
- `title`
- `discipline`
- `xPercent`
- `yPercent`
- `paperSize`
- `orientation`
- `cropImageDataUrl`

## DIMPRO licencszerver adatmodell MVP

A licencszerver MVP jelenleg fájlalapú adattárat használ:

- `.dimprover/data/license-store.json`

Későbbi adatbázisos működésnél ugyanez a modell vihető át `licenses` és `license_devices` táblákba.

### `licenses`

- `id`
- `licenseKey`
- `companyId`
- `companyName`
- `status`
- `startsAt`
- `expiresAt`
- `maxDevices`
- `enabledModules`
- `createdAt`
- `updatedAt`

Engedélyezett licencstátuszok:

- `active`
- `expired`
- `blocked`
- `trial`
- `pending`

### `license_devices`

- `id`
- `licenseId`
- `machineIdHash`
- `appId`
- `firstActivatedAt`
- `lastOnlineCheckAt`
- `offlineGraceUntil`
- `status`
- `createdAt`
- `updatedAt`

Engedélyezett gépstátuszok:

- `active`
- `blocked`

### API válasz `licenseState`

Sikeres aktiválás és ellenőrzés esetén a szerver ezt a kliens által is értelmezhető állapotot adja vissza:

- `licenseKey`
- `companyId`
- `companyName`
- `machineIdHash`
- `activatedAt`
- `expiresAt`
- `lastOnlineCheckAt`
- `offlineGraceUntil`
- `enabledModules`
- `maxDevices`
- `status`

### Token payload

Az Ed25519 aláírt token payload fő mezői:

- `licenseKey`
- `companyId`
- `machineIdHash`
- `appId`
- `appVersion`
- `enabledModules`
- `status`
- `issuedAt`
- `expiresAt`
- `offlineGraceUntil`

Token forma:

```txt
base64url(payload).base64url(ed25519_signature)
```

### Környezeti változók

- `DIMPRO_LICENSE_PRIVATE_KEY_PEM` – Ed25519 privát kulcs PEM formában.
- `DIMPRO_LICENSE_PRIVATE_KEY_BASE64` – Ed25519 PKCS8 DER privát kulcs base64 formában.
- `DIMPRO_LICENSE_BOOTSTRAP_KEY` – MVP induló licenckulcs, ha nincs még külön adatbázisos admin felület.
- `DIMPRO_LICENSE_BOOTSTRAP_MAX_DEVICES` – induló licenchez tartozó gépszám limit.
- `DIMPRO_LICENSE_OFFLINE_GRACE_DAYS` – offline türelmi idő napokban, alapértelmezés: 7 nap.

### HAGE 118 licenckulcs minta

Éles használatban nem használható egyszerűen kikövetkeztethető licenckulcs, például:

- `DIMPRO-HAGE-2026-H1`
- `DIMPRO-HAGE-2026-H2`
- `DIMPRO-HAGE-INVEST-2026-001`
- `DIMPRO-HAGE-INVEST-MVP-2026`

A javasolt kulcsminta:

```txt
DIMPRO-HAGE-6M-K7QD-P4VX-9LTA-M3RF
```

Felépítés:

- `DIMPRO` – rendszerazonosító
- `HAGE` – ügyfél / cég rövid azonosító
- `6M` – 6 hónapos licenc
- `K7QD-P4VX-9LTA-M3RF` – véletlenszerű, legalább 16 karakteres rész

A véletlen rész karakterkészlete:

```txt
ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

Kerülendő karakterek: `O`, `0`, `I`, `1`, mert kézi beírásnál és telefonos diktálásnál könnyen összekeverhetők.

Új környezeti változó:

- `DIMPRO_LICENSE_BOOTSTRAP_MONTHS` – induló licenc hónapokban, alapértelmezés: 6.
- `DIMPRO_LICENSE_BOOTSTRAP_COMPANY_CODE` – induló kulcsgenerálás cégkódja, alapértelmezés: `HAGE`.

Ha nincs `DIMPRO_LICENSE_BOOTSTRAP_KEY`, az MVP licencmotor nem a régi egyszerű kulcsot használja, hanem véletlenszerű DIMPRO kulcsmintát generál.

## 2026-07-12 – Notification és NotificationRecipient adatmodell

### Notification

Fő mezők:
- `id`
- `type`: `FILE_UPLOADED`, `FILE_UPDATED`, `PROJECT_INVITE`, `PROJECT_INVITE_ACCEPTED`, `MINUTES_CREATED`, `DEADLINE_SOON`, `DOKUBOX_DROP_UPLOAD`, `DRIVE_SYNC_ERROR`, `SYSTEM_INFO`
- `title`
- `message`
- `projectId`, `projectName`
- `relatedFileId`, `relatedFileName`
- `relatedMinuteId`, `relatedDeadlineId`
- `createdByUserId`, `createdByName`
- `source`, `sourceClient`
- `priority`
- `actionUrl`
- `createdAt`

### NotificationRecipient

Felhasználónkénti címzetti és olvasottsági állapot:
- `notificationId`
- `userId`
- `deliveredAt`
- `readAt`
- `archivedAt`
- `emailSentAt`
- `desktopShownAt`
- `webShownAt`

A web és a desktop ugyanazt a `NotificationRecipient.readAt` mezőt frissíti, ezért az olvasottsági állapot közös.

## 2026-07-13 – Fejlesztési Napló / AI Kontextustár adatmodell MVP

A Fejlesztési Napló MVP fájlalapú adattárat használ:

```text
.dimprover/dev-notes/dev-notes.json
```

Későbbi adatbázisos működésnél ugyanez a modell vihető át `dev_notes` táblába.

### DevNote

Fő mezők:

- `id`
- `title`
- `type`
- `status`
- `module`
- `priority`
- `summary`
- `description`
- `codingInstruction`
- `aiContext`
- `source`
- `tags`
- `relatedFiles`
- `nextStep`
- `createdAt`
- `updatedAt`
- `archivedAt`

### Engedélyezett típusok

- `idea` – ötlet
- `decision` – fejlesztési döntés
- `task` – feladat
- `bug` – hiba
- `fix` – javítás
- `module_plan` – modulterv
- `ai_context` – AI kontextus
- `coding_instruction` – kódolási utasítás
- `release_note` – release megjegyzés
- `saved_for_later` – későbbre mentve

### Engedélyezett státuszok

- `new`
- `reviewing`
- `ready_for_coding`
- `in_progress`
- `testing`
- `done`
- `deferred`
- `withdrawn`
- `archived`

### Engedélyezett prioritások

- `low`
- `normal`
- `high`
- `critical`

### API

Védett licencadmin API:

```text
GET /api/license/dev-notes
POST /api/license/dev-notes
```

A `GET` szűrési paraméterei:

- `search`
- `type`
- `status`
- `module`
- `priority`
- `includeArchived=1`

A `POST` műveletei:

- `create`
- `update`
- `archive`
- `restore`
- `remove`

### DevNote kapcsolatkezelő mezők – 2026-07-13

A Fejlesztési Napló DevNote modellje bővült többfelületű és párhuzamos csevegős fejlesztések kezelésére.

Új mezők:

- `surfaces`: string tömb, az érintett felületek listája;
- `epic`: fejlesztési csomag / nagyobb fejlesztési egység neve;
- `relatedNoteIds`: kapcsolódó fejlesztési naplóbejegyzések azonosítói;
- `dependencies`: függőségek, előfeltételek;
- `blockers`: blokkoló tényezők;
- `crossChatStatus`: másik csevegő vagy párhuzamos fejlesztési ág állapota;
- `externalAiNote`: külső AI / Codex / reviewer megjegyzés;
- `handoffSummary`: rövid átadó összefoglaló másik csevegő vagy fejlesztő számára.

A `GET /api/license/dev-notes` válasz bővült:

- `allNotes`: könnyített lista kapcsolódó bejegyzések kiválasztásához;
- `options.surfaces`: érintett felület opciók;
- `options.epics`: előre definiált és meglévő bejegyzésekből gyűjtött fejlesztési csomagok.

Új szűrési paraméterek:

- `surface`
- `epic`

## 2026-07-13 – Fejlesztési Napló AI usage adatmodell

A Fejlesztési Napló AI Kontextussegéd használati naplója JSONL formátumban készül:

```text
.dimprover/dev-notes-ai/usage.jsonl
```

Egy usage rekord fő mezői:

- `id`
- `createdAt`
- `actionId`
- `noteTitle`
- `model`
- `estimatedUsd`
- `estimatedHuf`
- `inputTokenEstimate`
- `maxOutputTokens`
- `actualUsage`
- `success`
- `error`

A költség becslés fejlesztési kontrollra szolgál, nem számlaérték. A tényleges számlaértéket az AI szolgáltató dashboardja mutatja.

## Release Központ adatmodell – 2026-07-13

A Release Központ fájlalapú MVP tárolója:

```text
.dimprover/release-center/release-center.json
```

Fő objektum: `ReleaseRecord`.

Fő mezők:

- `id`
- `version`
- `title`
- `type`
- `status`
- `sourceStage`
- `targetStage`
- `modules`
- `summary`
- `technicalChangelog`
- `publicChangelog`
- `internalChangelog`
- `knownIssues`
- `testResult`
- `rollbackPlan`
- `rollbackPath`
- `buildResult`
- `smokeResult`
- `relatedDevNoteIds`
- `aiHandoff`
- `checklist`
- `createdAt`
- `updatedAt`
- `approvedAt`
- `deployedAt`
- `archivedAt`

Státuszok:

- `draft`
- `dev_testing`
- `staging_candidate`
- `approved`
- `ready_for_production`
- `production_deployed`
- `rollback_ready`
- `rolled_back`
- `blocked`
- `archived`

Checklist mezők:

- `id`
- `label`
- `required`
- `checked`
- `checkedAt`
- `note`

## Szerverőr e-mail teszt napló – 2026-07-13

A Szerverőr e-mail tesztküldések JSONL naplóba kerülnek:

```text
.dimprover/monitor/email-test-history.jsonl
```

Egy rekord fő mezői:

- `id`
- `createdAt`
- `attempted`
- `sent`
- `reason`
- `to`
- `smtpConfigured`
- `error`

A normál szerverőr futások továbbra is a meglévő monitor history fájlba kerülnek:

```text
.dimprover/monitor/server-health-history.jsonl
```

Az utolsó kiküldött riasztás ujjlenyomatát ez a fájl tárolja:

```text
.dimprover/monitor/last-alert.json
```

## DIMPRO e-mail profil konfiguráció – 2026-07-13

Új szerveroldali konfigurációs elv: a DIMPRO automatikus e-mail küldés profilalapú legyen. A profil azonosítója határozza meg a feladót és a felhasználási célt.

Profilmezők: id, label, address, displayName, purpose, enabled, smtpHost, smtpPort, smtpSecure, jelszóállapot. A tényleges jelszót az API soha nem adhatja vissza, csak azt, hogy a profil küldésre konfigurált-e.

A központi API alapja: /api/license/mail-settings. Admin jogosultsággal lekérdezhető a profilok maszkolt állapota és egy kiválasztott profil tesztküldése.

### Mail profile storage fájl – 2026-07-13

A mentett e-mail profilok szerveroldali JSON konfigurációs fájlban tárolódnak: `.dimprover/mail/mail-profiles.json`. A fájl mezői: `smtpHost`, `smtpPort`, `smtpSecure`, `sharedPassword`, `testRecipients`, `profiles`. A profilok egyedi jelszóval is bővíthetők, de induláskor a közös DotRoll postafiók-jelszó használható.

A tesztküldési napló helye: `.dimprover/mail/mail-test-history.jsonl`.

## MeetingWorkspace v3 – jelenléti ív és napirendi sablon

Új mezők:
- `version: 3`
- `attendees: MeetingAttendee[]`
- `agendaTemplateKey: MeetingAgendaTemplateKey`

A `MeetingAttendee` mezői: `id`, `name`, `organization`, `functionTitle`, `email`, `status`, `participationMode`, `arrivalTime`, `departureTime`, `external`, `createdAt`, `updatedAt`.

A régi `participants: string[]` mező kompatibilitási és desktop megjelenítési célból megmarad, és automatikusan az `attendees[].name` értékeiből szinkronizálódik. Régi v2 workspace olvasásakor a névlista automatikusan jelenléti rekordokká migrálódik.

## MeetingWorkspace v4 – részletes napirendi tartalom

A `MeetingAgendaItem` új mezői: `description`, `discussionNotes`, `decisionSummary`, `openQuestions`, `privateNotes`, `updatedAt`, `updatedBy`. A v3 és korábbi napirendi pontok olvasáskor automatikusan v4-re normalizálódnak, szerkeszthető mintaszöveggel.

## MeetingWorkspace v6 – jogosultság, Teams átirat és projektkapcsolat

Új meeting alapadatmezők: `projectId`, `projectCode`, `meetingLocation`, `meetingType`, `minuteNumber`, `documentId`, `previousMeetingId`, `nextMeetingAt`.

Új `teamsTranscript` objektum: `graphOnlineMeetingId`, `organizerUserId`, `status`, `lastSyncAt`, `lastError`, `transcriptIds`, `importedLineCount`, `speakerAttribution`.

A `MeetingActionItem` új `agendaItemId` mezővel kapcsolódik egy napirendi ponthoz. A `MeetingAttachment.agendaItemId` meglévő mezője a felületen is szerkeszthetővé vált. A korábbi munkaterek olvasáskor automatikusan v6-ra normalizálódnak.

## MeetingWorkspace v7 – v0.1.5

Új mezők: `meetingTypeCode`, `documentKind`, `documentLabel`, `minuteSequence`, `chairpersonName`, `minuteTakerName`, `approverName`, `nextMeeting`, `participantPermissions`, `aiMinutesDraft`, `publishedSummaries`, `activePublishedSummaryId`, `feedback`, `emailLog`.

Az `MeetingAgendaItem` új `isJoker` és `topicBlocks` mezőt kapott. A témablokk kezeli az egyeztetés tartalmát, döntést, nyitott kérdést, megrendelői/tervezői/kivitelezői álláspontot, felelőst, határidőt, mellékletet, privát megjegyzést és korábbi dokumentumkapcsolatot.

A `MeetingAttendee` projekt-tagazonosítót és telefonszámot, a `MeetingActionItem` és `MeetingAttachment` témablokk-kapcsolatot kapott. A korábbi munkaterek olvasáskor automatikusan v7-re normalizálódnak.

## 2026-08-02 – Project Core 0.2.0 PostgreSQL táblák

A projekt, projekttagság, projektaudit és modulok közötti entitáskapcsolat külön `project_core_*` táblákban készül. Az azonosítók szövegesek maradnak, hogy a meglévő `project_id` változtatás nélkül emelhető legyen át. A projekt létrehozása, módosítása, tagság hozzáadása, életciklus-váltása és kezdeti file-state bootstrap tranzakciós PostgreSQL RPC-n keresztül történik.

## 2026-08-02 – DRIVE Core adatmodell

A `drive_core_folders` projekten belüli hierarchikus útvonalakat tárol. A `drive_core_documents` a dokumentum állandó identitása, míg a `drive_core_document_versions` az immutable verzióelőzmény. A `drive_core_change_events` monoton sorszámú eseményfolyam a kézi desktop szinkronhoz. A `drive_core_sync_cursors` kliensenként megőrzi az utolsó feldolgozott kurzort. A `drive_core_project_bootstraps` garantálja az alapmappa-készlet idempotens projektenkénti létrehozását. Minden üzleti rekord `project_id` idegen kulccsal kapcsolódik a `project_core_projects` táblához.

## DRIVE Object Storage 0.4.0 adatmodell

### drive_storage_schema_meta

A külön objektumtárhely-réteg sémajelzője. Nem módosítja a DRIVE Core 0.3.0 sémajelzőjét.

### drive_core_upload_sessions

Projektkapcsolt, rövid életű feltöltési munkamenet. Fő mezők: célmappa vagy dokumentum, feltöltési mód, fájlnév, MIME-típus, méret, opcionális SHA-256, kliensazonosító, privát bucket/key, lejárat, végleges verzióstátusz és állapot.

Állapotok: `INITIATED`, `FINALIZED`, `ABORTED`, `EXPIRED`, `FAILED`.

Feltöltési módok: `NEW_DOCUMENT`, `NEW_VERSION`.

A munkamenet nem tartalmaz tárhely-hozzáférési titkot. A storage key szerveroldalon generált és projekthez kötött.

## DRIVE Quarantine Review 0.4.1

### drive_core_object_cleanup_tasks

Elutasított S3-objektumok tartós törlési feladata. Fő mezők: projekt, dokumentumverzió, bucket, object key, indok, állapot, próbálkozásszám, utolsó hiba, kérelmező és időbélyegek.

Állapotok: `PENDING`, `COMPLETED`, `FAILED`.

A feladat projektenként és verziónként egyedi. A service role kezeli, közvetlen anon/authenticated hozzáférés nincs.

## Project Calendar Core 0.5.0

### project_calendar_schema_meta

A közös projekt-naptár sémaverzióját és bootstrap-azonosítóját tárolja.

### project_calendar_events

Közös projekt-esemény és határidő tábla `project_id` idegen kulccsal. Támogatja az értekezlet, határidő, feladat, ellenőrzés, mérföldkő és emlékeztető típusokat; DOCK/DIALOG/DECIDE/DIARY/DRIVE/SYSTEM forrást; prioritást, felelőst, időintervallumot, forrásügy-kapcsolatot és optimista verziózást.

Az aktív forrásügy-kapcsolat projektenként egyedi, így ugyanaz a DIALOG/DECIDE/DIARY ügy nem hoz létre többszörös aktív naptáreseményt. A visszavont esemény rekordja és auditja megmarad.

## DIALOG Communication Core 0.6.0

### dialog_core_schema_meta

A DIALOG sémaverzióját és bootstrap-azonosítóját tárolja.

### dialog_core_sequences

Projektenkénti monoton témakártya-sorszám. A kód típustól függő előtagot, évet és négyjegyű sorszámot tartalmaz.

### dialog_core_threads

A projekt egyeztetési témakártyái: típus, cím, leírás, szakág, státusz, prioritás, felelős, résztvevők, kapcsolódó dokumentumok, válaszadási határidő, Project Calendar eseményazonosító és optimista verzió.

### dialog_core_messages

A témakártyák auditált hozzászólás-, kérdés-, válasz- és állapotjegyzet-bejegyzései.

## DECIDE Workflow Core 0.7.0

### decide_core_schema_meta

A DECIDE sémaverzióját és bootstrap-azonosítóját tárolja.

### decide_core_sequences

Projektenkénti monoton DECIDE-sorszám. A kód formája: `DEC-ÉÉÉÉ-NNNN`.

### decide_core_requests

Döntési és jóváhagyási kérelmek típussal, státusszal, prioritással, költség- és határidőhatással, felelőssel, dokumentum- és DIALOG-kapcsolattal, Project Calendar eseménnyel és optimista verzióval.

### decide_core_approvers

Soros vagy párhuzamos jóváhagyási szakaszok kijelölt résztvevői. A szakasz módja `ALL` vagy `ANY`; a válasz csak az aktuális szakaszban, a kijelölt felhasználó által adható.

### decide_core_notes

Auditált döntési megjegyzések és állapotjegyzetek.

## DIARY Project Log Core 0.8.0

### diary_core_schema_meta

A DIARY sémaverziója és bootstrap-azonosítója.

### diary_core_sequences

Projektenként és évenként monoton `NAP-ÉÉÉÉ-NNNN` sorszám.

### diary_core_entries

Egy projekt–dátum párhoz tartozó napi napló időjárással, hőmérséklettel, létszámmal, munkafolyamatokkal, akadályokkal, munkavédelemmel, ellenőrzésekkel, dokumentumkapcsolatokkal és vezetői lezárással.

### diary_core_events

A napi napló eseményei automatikus `/E-NNN` kóddal, felelőssel, súlyossággal, határidővel, Project Calendar-, DIALOG-, DECIDE- és dokumentumkapcsolattal.
