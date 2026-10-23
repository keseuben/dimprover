# DIMPRO Drive V0.9.58 – Személyes multipart API és karantén workflow

Dátum: 2026-10-23 · **SOURCE ONLY** · DEV ONLY · PROD DENY.

## Fejlesztési eredmény

Az 5 GiB/fájl személyes feltöltés S3 multipart szerveroldali vezérlése elkészült, az összes művelet a közös tárolómotorra építve, de a Projekt Drive projekt-ACL / projektadatmodell használata nélkül:

| Végpont | Művelet | Feladat |
| --- | --- | --- |
| POST `/api/drive/personal/uploads/multipart/init` | Indítás | USER kvóta szerinti atomikus lefoglalás, request UUID idempotencia, 24 órás munkamenet, S3 multipart megnyitás |
| GET `/api/drive/personal/uploads/multipart/{sessionId}/checkpoint` | Ellenőrzőpont | USER-azonosítás és S3-részlista/DB manifest összevetés; csak visszaigazolt részekre támaszkodik |
| POST `/api/drive/personal/uploads/multipart/{sessionId}/parts/{partNumber}` | Rész-url | Rövid lejáratú aláírt S3 feltöltési URL az adott USER munkamenethez és pontos fájlrészmérethez |
| PATCH `/api/drive/personal/uploads/multipart/{sessionId}/parts/{partNumber}` | Rész-igazolás | S3 part tényleges méret/ETag egyezés; kliensről érkező SHA auditadat; CAS DB részmanifest |
| POST `/api/drive/personal/uploads/multipart/{sessionId}/abort` | Megszakítás | Tulajdon- és státuszkontroll, CAS ABORTED, S3 abort |
| POST `/api/drive/personal/uploads/multipart/{sessionId}/complete` | Lezárás | Teljes részlista validálása, CAS COMPLETING, S3 finalizálás, tárhelyméret-ellenőrzés, CAS QUARANTINED (NEM CLEAN) |

A közös `personalMultipartService` és `personalMultipartApi` végzi a tulajdonellenőrzést, a HTTPS Origin vizsgálatot, a kisméretű JSON kérések valódi byte-limitjét, a váratlan JSON és URL-paraméterek ellenőrzését, a 64 MiB partméreteket és a rendezést.

## Biztonsági követelmények és fennmaradó tiltások

1. **Új külön kódszintű kiadási retesz:** `PERSONAL_MULTIPART_SERVER_RELEASED = false`. Az API-k fail-closed állapotban 503-at adnak az authenticated hívóknak, még akkor is, ha az üzemeltető más környezeti változókat beállítana.
2. A `DIMPRO_DRIVE_PERSONAL_MULTIPART_ENABLED=true` és a DEV-ONLY feltételek önmagukban nem elégségesek. A kliens `GET .../capabilities` válaszában `enabled:false` és `usableMaxFileBytes:0` marad.
3. Későbbi kódrelease esetén is 5 GiB-ot teljes egészében ellenőrző víruskereső munkafolyamat és validált DB/S3 kell. Az aktuális ClamAV 100 MiB default limitje ezt nem teljesíti.
4. Nincs `CLEAN` állapotváltás vagy `dimpro_content_refs` létrehozás a multipart API-ban. A sikeres S3 Complete csak **karantén**, tehát semmi sem válik automatikusan elérhetővé.
5. `COMPLETING` átmeneti állapot került a munkamenetmodellbe és az SQL-tervezetbe. Ha az S3 befejezési válasza elveszik, a fájl marad `COMPLETING`; külön reconciliation folyamat állapíthatja meg a valós állapotot. Nem ismételhető vakon a Complete.
6. A megszakítás csak `INITIATED` vagy `UPLOADING` fázisban lehetséges. A lejárt munkamenetek külön, auditált retention/cleanup feldolgozást igényelnek.
7. A 64 MiB-os fájlrész SHA-256 értékét jelenleg a kliens adja be auditadatként; S3 ETag+méret ellenőrzés van, de ez nem egyenértékű a szerveroldali rész-hash igazolásával. Végleges CLEAN csak ellenőrzött teljes fájl SHA-256 + teljes vírusellenőrzés után lehet.
8. A V0.9.57 migráció SQL-forrásában a `COMPLETING` új állapot felvéve, **de a migrációt továbbra sem telepítettük**.
9. Nincs felhasználói multipart kliens, tartós checkpoint a böngészőben, S3 CORS end-to-end teszt vagy 5 GiB-os malware worker; a funkció még nem kiadható.
10. Fontos blokkoló: a meglévő személyes `dimpro_personal_drive_ensure_ref_atomic` kvóta RPC és az aktuális quota UI még nem számolja be az új multipart foglalásokat. A személyes teljes tárhelymodell egységesítéséig a feature OFF.

## QA

- TypeScript `npx tsc --noEmit`: PASS.
- Célzott ESLint: PASS.
- V0.9.58 API, owner/CSRF, bounded JSON, S3 állapotgép, „sosem CLEAN” és 101 MiB / 512 MiB / 1 GiB / 5 GiB terv contract: PASS.
- V0.9.57/56/55/54, V0.9.53/52/51/50 átviteli regressziók: PASS.
- Personal folders, CsomagBOX, project folder-drop: PASS.
- `git diff --check`: PASS.
- Valós S3 multipart integrációs teszt / izolált PostgreSQL migrációs teszt / hitelesített böngészős E2E: **NEM FUTOTT**.

## Következő fejlesztési fázis – V0.9.59

Elsőbbség: izolált PostgreSQL migrációteszt, a személyes kvóta UI és RPC egységesítése a multipart foglalással, a lejárt/COMPLETING/orphan S3 munkamenetek biztonságos reconciliációja, 5 GiB teljes fájl scanner megtervezése és erőforrásmérése. Ezután a böngészős persistent checkpoint és megszakítás utáni resume, majd valódi DEV E2E.

Az eddigi V0.9.52 publikus Drive, a korábbi 100 MiB-os V0.9.56 személyes pilot és a PROD környezet sem változott. A V0.9.56 is külön aktiválási tesztekre vár.
