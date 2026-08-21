# DIMPRO Terepi Gyorsrögzítő – F6 e-mail delivery idempotencia és retry

**Dátum:** 2026-08-21
**Környezet:** kizárólag DEV
**Baseline:** `65c1d1a` – lezárt F5 DEV release
**Állapot:** F6 SOURCE CANDIDATE – DB rollback/apply, build és browser acceptance előtt

## 1. Cél

Az F6 az F5 kézi PDF e-mail küldését teszi duplikációvédetté és kontrolláltan újrapróbálhatóvá. A cél az, hogy hálózati hiba, dupla kattintás vagy ismételt kérés ne eredményezzen indokolatlanul több azonos levelet.

A Terep kliensverziója `0.4.4-dev`.

## 2. Idempotencia

A kliens minden új riportküldési tartalomhoz egy 16–128 karakteres idempotency kulcsot készít. A szerver az eredeti kulcsot nem tárolja, csak annak SHA-256 lenyomatát.

Az idempotencia scope-ja: `session_id + idempotency_key_hash`.

A normalized delivery payload SHA-256 lenyomata tartalmazza a feladóprofilt, rendezett címzettlistát, tárgyat, kísérőszöveget, riportcímet, session azonosítót, csatolmánynevet és a PDF SHA-256 lenyomatát. Ugyanaz a kulcs eltérő payloadhoz 409 hibával elutasításra kerül.

## 3. Delivery állapotok

A server-only `field_capture_report_email_deliveries` tábla állapotai:

- `SENDING`: a kérés lefoglalta a küldést;
- `SENT`: SMTP-küldés sikeresen elfogadva és a delivery állapot rögzítve;
- `FAILED`: az SMTP elfogadása előtt keletkezett, biztonságosan retryolható hiba.

Retry maximum 5 próbálkozásig engedélyezett.

`SENT` állapotú azonos kérésnél az SMTP nem fut újra. `SENDING` állapotú párhuzamos kérés blokkolódik. `FAILED` azonos payloaddal újrapróbálható.

## 4. Fail-closed SMTP bizonytalanság

SMTP-kézbesítésnél nem garantálható valódi tranzakció a levelezőszerver és a DIMPRO adatbázis között. Ha az SMTP már elfogadta a levelet, de az ezt követő delivery státuszmentés hibázik, a rekord nem vált `FAILED` állapotba és nem indul automatikus retry. `REPORT_EMAIL_DELIVERY_STATE_UNCERTAIN` audit készül.

Ez tudatosan a duplikáció elkerülését részesíti előnyben az automatikus újraküldéssel szemben. Az F6 ezért nem állít matematikai értelemben vett exactly-once SMTP kézbesítést.

## 5. Kliens retry

A mobil kliens változatlan tartalomnál ugyanazt tárolja memóriában:

- fingerprint;
- idempotency kulcs;
- már legenerált PDF ArrayBuffer;
- fájlnév.

Így hiba után a felhasználó a Küldés gombbal biztonságosan ugyanazt a requestet próbálja újra. Ha címzett, tárgy, kísérőszöveg, riportmeta vagy rögzített tétel változik, új fingerprint, új idempotency kulcs és új PDF készül.

## 6. Adatminimalizálás

A delivery ledger nem tárol:

- címzett e-mail-címet;
- kísérőszöveget;
- SMTP hostot/felhasználónevet/jelszót;
- nyers Send tokent;
- nyers idempotency kulcsot.

Tárolható technikai metaadat: session, actor, hash-ek, státusz, attempts, címzettszám, Drop profilazonosító, csatolmány neve, SMTP message id, hibakód és időbélyegek.

## 7. DB migráció

Migráció:
`supabase/migrations/20260821173500_field_capture_report_email_delivery_f6_v010.sql`

Rollback:
`supabase/rollback/FIELD_CAPTURE_REPORT_EMAIL_F6_V010_ROLLBACK.sql`

Migráció SHA-256:
`80843faac0897c475a179c9174153638b75769d97ecfb57a69e0f08297d85670`

Rollback SHA-256:
`ba059db48ee87b4867140ebe466faef5c37d7f21b912fd0936c0800a04238376`

A migrációs gate kötelező sorrendje: preflight → rollback-test → teljes DEV pg_dump backup + listing verify → explicit DEV approval → apply → verify → runtime E2E.

## 8. Jelenlegi source acceptance

- F6 idempotencia contract: `18/18 PASS`;
- F5 e-mail contract: `16/16 PASS`;
- F5 recipient/PDF service E2E: `9/9 PASS`;
- TypeScript: PASS;
- célzott ESLint: PASS;
- migration preflight: PASS;
- `git diff --check`: PASS.

A DB runtime E2E csak az F6 migráció sikeres DEV apply-ja után futtatható.

## 9. Release korlátok

- automatikus e-mail küldés továbbra sincs;
- Projectkapu Drive P9 továbbra is kikapcsolva;
- a shared build/cutover kizárólag koordinációs lock alatt történhet;
- automatizált browser acceptance nem küld valódi e-mailt;
- PROD módosítás tilos.

**PROD DENY – éles környezet változatlan.**
