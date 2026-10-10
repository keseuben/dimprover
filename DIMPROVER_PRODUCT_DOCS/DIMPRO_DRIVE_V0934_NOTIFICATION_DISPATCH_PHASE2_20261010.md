# DIMPRO Drive V0.9.34 – értesítési rendszer: 2. fejlesztési szakasz

Dátum: 2026-10-10
**Source ready for integration; no migrations applied; no SMTP dispatch, no deployment. PROD DENY.**
Előzmény: `DIMPRO_DRIVE_V0934_COMPLEX_SOURCE_HANDOFF_20261010.md`.

## Elkészült a jelen forráskörben

- Közös DIMPRO levelezés ellenőrizve: `app/lib/license/mail-profiles.ts`, használható a meglévő `drive` profil + HTML + szöveg + XLSX csatolmány. Új SMTP-rendszer nincs.
- Jogosultságra szűrt kézi értesítési előnézet és önálló XLSX export:
  `GET /api/projects/[projectId]/drive/notification-preview` (csak bejelentkezett saját hozzáférés; legfeljebb 7 nap és 250 utolsó audit esemény; truncation jelzés). A döntési eseményekhez dokumentum megtekintési jogosultságon túl `document.approve` szükséges.
- `components/drive/DriveNotificationSettings.tsx`: kézi Dokumentumváltozások / Jóváhagyások előnézet és Excel export gombok. Semmilyen emailt nem küldenek.
- Outbox/kézbesítési kapu: `supabase/migrations/20261010_drive_digest_delivery_gate_v011.sql` – single-writer claim per recipient/category, legfeljebb 3 retry tényleg küldés előtti hibára, valós SMTP elfogadás külön ack, ambiguitás automatikus újraküldés nélkül. Adatbázis-migráció NINCS végrehajtva.
- `app/lib/drive-notifications/deliveryRepository.ts`: insert-only slot registration, atomikus claim + SMTP ack + suppression/ambiguous ledger műveletek.
- `app/lib/drive-notifications/liveDelivery.ts`: küldés pillanatában központi AUTH fiók+hiteles email, aktív projekttagság, megfelelő projekt permission, tényleges mappajogosultság/jelszókapu, értesítési opt-in, aktuális dokumentumkövetés és eseményazonosító ismételt ellenőrzése; csak adott felhasználóra összeállított levél és Excel.
- `app/lib/drive-notifications/dispatchFlow.ts`: dependency injection alapú küldési tranzíciók és sikertelenség/SMTP ambiguitás kezelése.
- `app/lib/drive-notifications/driveSmtpAdapter.ts`: központi `sendDimproMail` wrapper. Csak `DIMPRO_DRIVE_DIGEST_SEND_ENABLED=true` ÉS `DIMPRO_DRIVE_DIGEST_EXECUTION_ENV=DEV` együtt teszi elérhetővé; jelenleg NINCS hívója, nincs scheduler, nincs API route; PROD DENY.
- `supabase/migrations/20261010_drive_notification_consent_v012.sql`: opt-in újraengedélyezéskor az eseménynapló aktuális markere kerül kezdőcursorba. Korábbi historikus változások nem indíthatnak azonnali tömeges levelet. Külön jóváhagyandó migráció.
- `app/lib/drive-notifications/followPolicy.ts`: Követett dokumentumok szűrése (verzió, revízió, jóváhagyás, explicit NONE opt-out). A dokumentumszintű egyedi gyakoriság ütemezési rétege még nincs bekötve, a kategória szerinti összesítési beállítás irányadó.

## Fontos biztonsági/termékdöntések

- Címzettenként külön levél megy majd, más címzett személyes adata nem szivároghat át. Az admin számára később külön kézbesítési audit kell; SMTP elfogadás **nem bizonyítja** az email postafiókba érkezését.
- A levelező ne induljon csak azért, mert a szerver elindul: külön kontrollált schedulerre és jóváhagyott aktiválásra van szükség.
- SMTP time-out vagy elveszett ack esetén AMBIGUOUS -> automatikusan NEM küldhető újra. Admin felülvizsgálat szükséges.
- Hozzáférés visszavonása a kiküldés előtt SUPPRESSED állapotot jelent; nem kerül levélbe eltitkolt fájlnév.
- `APPROVAL_DECISIONS` eddigi korlátozó értelmezése: `document.approve` plusz dokumentum/mappa hozzáférés. Később bővíthető célzott jóváhagyási résztvevőkkel.
- Külső jogszabályi magyar munkanapnaptár nincs bekötve, emiatt havi automatikus digest továbbra is fail-closed.

## Meglévő, de még nem teljes feladatok

1. Éles használatra kész tartós esemény-cursor bejárás, backlog-ciklus kezelése és pontos, fogyasztótól függő ütemező producer/scheduler.
2. Ugyanazon címzettre/projektre több kategória vagy több dokumentum-frekvencia összehangolása; dokumentumszintű külön ütemezés.
3. Címzetti kézbesítési audit-UI, napló/riport és nyilvánossági szabályok: csak kifejezetten jogosult szereplő láthasson más címzetteket.
4. Visszahívható/engedélyezett worker telepítési runtime, engedélyezett email smoke kizárólag tesztcímzettel.
5. Közös Projektadatlap maximum **2 soros** Drive fejléc, több szakmai szerepkörös jogosultsági bővítés, profilfotók a többi modulban, új feltöltések/legutóbbi tervek felület.
6. Adatbázis DBA review és migrációk külön végrehajtási jóváhagyással; BUILD01/02 valós build és böngészős QA, utána csak DEV release.

## Ellenőrzés

`npx tsc --noEmit`, célzott ESLint, `git diff --check`, valamint a tisztán izolált módon futtatott értesítési/digest/Excel/schedule/follow/dispatch szerződéses tesztek.
Nem történt SMTP-küldés, adatbázis-migráció vagy DEV runtime módosítás.
