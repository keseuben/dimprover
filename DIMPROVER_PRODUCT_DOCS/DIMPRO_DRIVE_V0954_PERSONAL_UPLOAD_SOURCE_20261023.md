# DIMPRO Drive V0.9.54 – Saját Drive közvetlen feltöltés, forrásfázis

Dátum: 2026-10-23
Fázis: SOURCE ONLY, API FEATURE FLAG OFF; nincs új adatbázis-migráció vagy böngészős runtime aktiválás.
Környezet: DEV ONLY · PROD DENY. Central Developer Grid változatlan.

## Fejlesztési alap és különbség a Projekt Drive-hoz képest

A Projekt Drive már működő Transfer Center + single PUT + opcionális multipart szerverútvonalait nem duplikáljuk. A Saját Drive saját USER ownership adatmodellje a dimpro_content_objects / dimpro_content_refs táblákkal, a dimpro_personal_drive_ensure_ref_atomic RPC-vel és a személyes mappaazonosítókkal működik. Emiatt új, közvetlen személyes upload-adapter és ugyanaz a Transfer Center UI használatos.

MVP korlátozás: 16 MiB fájlonként, legfeljebb 25 fájl egy böngészős kijelölésben, egyetlen egymás utáni szerveres POST, nincs multipart/resume vagy automatikus újraküldés. Nem általános háttérfeltöltő.

## Állapot és aktiválás

- `DIMPRO_DRIVE_PERSONAL_UPLOAD_ENABLED=true`, `DIMPRO_PRODUCTION_ACCESS=DENY`, `DIMPRO_AUTH_ENVIRONMENT=DEV` együtt szükséges; egyik hiányában személyes feltöltés zárt.
- `GET /api/drive/personal/uploads`: bejelentkezett USER hozzáférés és szerver readiness után `enabled/maxBytes`; flag off esetén nem kérdez DB-t vagy ClamAV-ot.
- `POST /api/drive/personal/uploads`: azonosított személyes hozzáférés, explicit flag, https same-origin header, ismert Content-Length, multipart/form-data, korlátozott form body és fájlméret.
- A felület csak a GET pozitív válasza után aktiválja a feltöltés gombját; alapból a régi nem használható állapot marad.
- ClamAV INSTREAM ellenőrzi a teljes fájlt, a scanner által számolt SHA-256 lesz a hiteles lenyomat; INFECTED esetén nincs S3/Content Core regisztráció.
- Az S3-ba mentett objektumot teljes SHA-256 és byte-méret alapján visszaolvassuk. Meglévő, azonos tartalom deduplikálásakor a clean státuszon és bucketen túl a tárolt objektum valódi hashét is ellenőrizzük.
- Az új regisztráló `registerVerifiedPersonalContentObject` INSERT-et használ, nem a meglévő rekordot átíró UPSERT-et. Unique konfliktusnál csak clean, azonos-bucket objektum használható; a redundáns egyedi storage key eltávolítható.
- `ensureUserContentRef` az atomikus, kvótát ellenőrző USER-ref RPC. A szerver előzetesen is ellenőrzi a személyes kvótát.
- A felhasználó által kijelölt célmappa tulajdonjogát még feldolgozás előtt ellenőrizzük. Mentés után a meglévő `moveUserContentRef` teszi a refet a célmappába; mozgatási hiba esetén a fájl a személyes gyökérben marad, nem jelöljük elveszettnek.
- A kliens egyedi `personal-web:<UUID>` kérésazonosítót küld; már lezárt azonos request esetén azonos objektumvizsgálat mellett visszaigazolható.
- A browser POST hálózati hibája után nem indul automatikus újrafeltöltés: `CONFIRMATION_UNKNOWN` üzenet és kézi ellenőrzés. Nincs signed URL, token vagy fájlbájt tartós böngészőtárolóban.
- A közös Transfer Center már támogatja a személyes `AVAILABLE` státuszt, és elkülöníti a projektfájlokra vonatkozó `AWAITING_REVIEW` állapottól. Valós XHR-előrehaladást mutat.
- Várakozó fájl megszakítása működik, az aktív böngészőfeltöltés abortálható; munkatér elhagyása után további fájl nem kezdődik el.

## Kiadás előtti kötelező ellenőrzések, amelyek még nem történtek meg

1. Nginx személyes POST útvonalra mérethatár ~18 MiB; a teljes form parserek és felső proxy body-korlátok ellenőrzése.
2. A dev AUTH, Content Core, `dimpro_personal_drive_ensure_ref_atomic` migráció és a kvóta-rezerváció/versenyhelyzet hitelesített működési tesztje.
3. Valós ClamAV clean / EICAR teszt biztonságos izolált DEV fájllal, S3 roundtrip, Content Core ownership, célmappa, letöltés, fájlnevek és kvótatúllépés.
4. Elveszett válasz és részleges / elárvult S3 objektumhoz reconciliation + retention terv. Már regisztrált Content Core objektumot nem törlünk vakon.
5. Fájlonkénti feltöltés és szünet nélküli böngészős útvonal külön végpontja; a teljes 16 MiB memóriakorlát és API időtúllépések igazolása.
6. A személyes direkt upload funkció csak ezek után kapcsolható be DEV-en, nem aktiváljuk pusztán build hatására.
7. Külön BUILD01 és izolált runtime-gate az új V0.9.54 forráshoz; Nginx cutover és rollback rehearsal. PROD tiltva.

## Verziók 2026-10-23 reggel

- Publikus DEV: **V0.9.52**, `1402cd6e5`, 3413.
- V0.9.53: BUILD01 PASS, source `a425a6ef9`, build `01N85zeJMHwiId5eDTln3`, artifact SHA `ef1a02f80c99da4a476cdcff919dcee5e08a6c9fad43710423864b7fe877fa30`, DEV candidate release kibontva; az új PM2 indítást a külső eszközbiztonság blokkolta, így nem fut publikus új verzió.
- V0.9.54: jelen dokumentum pillanatában SOURCE ONLY, az átviteli feature OFF.

Fejlesztési források:
- `app/lib/content-core/personalUploadPolicy.ts`
- `app/lib/content-core/repository.ts`
- `app/lib/drive-core/securityScanService.ts`
- `app/api/drive/personal/uploads/route.ts`
- `app/lib/transfer-core/personalFormUpload.ts`
- `app/lib/transfer-core/transferModel.ts`
- `components/drive/PersonalDriveWorkspace.tsx`
- `components/drive/DriveTransferCenter.tsx`
- `scripts/tests/dimpro-drive-v0954-personal-upload-contract.mjs`

Az új route valódi adatfeltöltéses E2E-jét nem tekintjük PASS-nak pusztán a TypeScript/lint/static contract tesztek alapján.

## SOURCE ellenőrzések (2026-10-23)

- TypeScript `npx tsc --noEmit`: PASS.
- Célzott ESLint új és módosított fájlokra: PASS.
- V0.9.54 személyes feltöltés policy/security/UI contract: PASS.
- V0.9.53 Transfer Center UI regresszió: PASS.
- V0.9.52 S3 multipart és V0.9.51 resume/scanner, HTTP retry: PASS.
- V0.9.50 Transfer Center/XHR: PASS.
- Drive quota contract: 29/29 PASS; folder-drop contract: 22/22 PASS.
- Git whitespace diff-check: PASS.
- Nem helyettesít hitelesített end-to-end tesztet. A személyes feltöltés továbbra is FEATURE OFF.
