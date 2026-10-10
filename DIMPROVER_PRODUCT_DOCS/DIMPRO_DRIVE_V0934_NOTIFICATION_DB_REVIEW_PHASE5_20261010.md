# DIMPRO Drive V0.9.34 – értesítési DB migrációs ellenőrzés / 5. fejlesztési szakasz

Állapot: **SOURCE ONLY – DO NOT DEPLOY**, nem történt DB migráció, e-mailküldés, PROD vagy DEV runtime-változtatás.

## Feltárt és javított, érdemi hiba

Az eredeti `drive_core_digest_deliveries` egyediség `(project_id,user_id,category,scheduled_slot)` volt. Egy nagy forgalmú, több mint 250 releváns naplóeseményt tartalmazó értesítési időszak csak az első csomagot engedte; annak SMTP-elfogadása után a következő cursorral érkező csomag ugyanazon scheduled_slot alatt `SLOT_ALREADY_RESERVED` eredménnyel blokkolódott.

**Javítás (csak még nem alkalmazott SQL fájlban):**
- `supabase/migrations/20261010_drive_notification_preferences_v010.sql`: az egyediség most `(project_id,user_id,category,scheduled_slot,cursor_from)`.
- `supabase/migrations/20261010_drive_digest_cursor_producer_v013.sql`: a `ON CONFLICT` pontosan ugyanezt a kulcsot használja; az ugyanabban az időpontban újabb, de következő kurzortartományú események külön outbox sorba kerülhetnek.
- A cursor továbbra is `last_success_sequence` CAS ellenőrzés és külön project+user+category szerializáló advisory lock mellett léphet. Amíg PENDING/PROCESSING/FAILED/AMBIGUOUS korábbi outbox van, új batch nem foglalható.
- Az RPC tranzakción belül leellenőrzi a tényleges `(cursor_from,cursor_to]` projektnapló-események számát (1–250) **ÉS a cursor_to esemény létezését**, azaz üres tartomány/fantom kurzor nem léptethet előre.
- `app/lib/drive-notifications/deliveryRepository.ts`: eltávolítottam a nem használt közvetlen táblás outbox INSERT függvényt. Foglalás kizárólag az atomikus consent+cursor+dedup RPC-n keresztül történhet.

## Fontos migrációs körülmény

**Az eredeti v010 és a módosított v010 ugyanannak a még nem alkalmazott fejlesztési csomagnak a forrása.** Amennyiben bármely DBA már végrehajtotta volna a korábbi v010-et bármilyen környezetben, a v010 átírása nem migráció; kötelező külön v015 `ALTER TABLE DROP CONSTRAINT/ADD CONSTRAINT` korrektív migráció, pontos constraintnév-readonly ellenőrzéssel. Ne próbáljuk egy korábban lefuttatott CREATE TABLE IF NOT EXISTS paranccsal korrigálni az indexet.

Az alapmigrációkat **csak kézi sorrendben** lehet tesztelni (nem globból automatikusan):
1. `supabase/migrations/20261010_drive_document_follow_v010.sql`
2. `supabase/migrations/20261010_drive_review_decision_events_v010.sql`
3. `supabase/migrations/20261010_drive_notification_preferences_v010.sql`
4. `supabase/migrations/20261010_drive_digest_delivery_gate_v011.sql`
5. `supabase/migrations/20261010_drive_notification_consent_v012.sql`
6. `supabase/migrations/20261010_drive_digest_cursor_producer_v013.sql`
7. `supabase/migrations/20261010_drive_notification_hu_calendar_v014.sql`

Az AUTH profilfotó migráció **KÜLÖN saját központi PostgreSQL szerveren**, nem a Drive DB-n:
- `db/auth/migrations/012_auth_v049_profile_photo.sql`

## Tesztigazolás és határok

- `scripts/tests/drive-notification-migration-batches-contract.mjs`: simulatív, két csomagos teszt ugyanarra a slotra (250 és 2 naplóeseménnyel), forrás SQL egyediség/konfliktuskulcs egyezés, közvetlen outbox insert tiltása, bound ellenőrzés. PASS.
- Korábbi 11 tesztcsoport szintén újra futtatandó.
- **NINCS PostgreSQL szerver a fejlesztői MCP workstationön**, ezért a PL/pgSQL-függvények, névütközések és RLS valós Postgres-integration PASS állítása tilos. Külön, izolált BUILD01/BUILD02 vagy erre kijelölt DBA teszt-PostgreSQL kell, éles DEV DB módosítás nélkül.
- Több mint 250 releváns eseményre folyamatos integrációs worker és konkrét SMTP/suppression tranzakciós E2E még hátravan.
- Az értesítések tényleges kiküldésének forrás hard gate-je `DRIVE_DIGEST_SENDING_RELEASED=false`, az automatikus producer gate-je `PRODUCER_RELEASED=false` marad; e két flaghez ne nyúljunk DBA+QA és explicit jóváhagyás nélkül.

## Következő biztonságos végrehajtási lépés

1. Független PG séma és PL/pgSQL integrációs teszt izolált DB-n, külön jóváhagyással; ellenőrizni kell: migrációs sorrend, 2 batch/slot, cursor no-gap, retry/ambiguous, role/revoked ACL, és suppression checkpoint.
2. BUILD01 vagy BUILD02 build és böngészős profilkép/értesítési UX QA.
3. DEV telepítés csak tárhelybővítés és jóváhagyott DB-migráció után. PROD DENY.
