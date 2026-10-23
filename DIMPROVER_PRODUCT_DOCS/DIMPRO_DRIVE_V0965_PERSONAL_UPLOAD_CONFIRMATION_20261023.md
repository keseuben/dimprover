# DIMPRO Drive V0.9.65 – személyes feltöltés bizonytalan eredményének visszaellenőrzése

Dátum: 2026-10-23 | SOURCE ONLY | PROD DENY | A publikus DEV továbbra is V0.9.52.

## Miért szükséges?

A V0.9.55 (500 fájl), V0.9.56 (100 MiB/fájl) és V0.9.62 (bizonytalan HTTP eredmény) után a Transfer Center `CONFIRMATION_UNKNOWN` státuszba helyezhetett egy fájlt, de nem volt dedikált, kizárólag olvasó visszaellenőrzési végpont. Egy szerveroldali véglegesítés sikerülhet akkor is, ha az ACK elveszik. Ilyenkor az automatikus ismétlés dupla feltöltést/felhasználói félreértést okozhat.

## Új szolgáltatás

1. **Tulajdonosi S3-visszaellenőrzés, kizárólag olvasó:**
   `GET /api/drive/personal/uploads/status/{requestId}`.
   A központi auth és személyes Drive jogosultság kötelező, USER tulajdonos-szűrés megelőzi a Content Core objektum olvasását; requestId szintaktikai vizsgálat; DEV-only/PROD DENY; no-store válasz. A végpont nem tölt fel, nem töröl, nem ír DB-refet és nem kapcsolja át a fájl státuszát a szerveren.
2. **Tulajdonoshoz kötött referenciakereső:**
   `findOwnedPersonalUploadReceipt` először `findUserContentRef` USER/OWNER/DRIVE/`personal-web:{requestId}` szűréssel olvas, csak ezután keresi az objektumot a tartalomazonosító alapján.
3. **Ellenőrzési döntés:**
   `assessPersonalUploadConfirmation` megköveteli az ACTIVE objektumot, mindkét `clean` jelzést, megfelelő aktív bucketet és az S3 fizikai `GetObject` visszaolvasásán számított teljes SHA-256 + pontos byte-egyezést.
4. **Három kimenet, soha nincs auto retry:**
   - HTTP 200 `VERIFIED_CLEAN`: tényleges objektum igazolt, `retryAllowed:false`.
   - HTTP 202 `PENDING_OR_NOT_FOUND`: jelenleg nincs tulajdonolt végleges ref; nem bizonyítja a feltöltés sikertelenségét, `retryAllowed:false`.
   - HTTP 409 `OBJECT_UNVERIFIED`, illetve HTTP 503 `PERSONAL_UPLOAD_STATUS_UNAVAILABLE`: hiba vagy nem bizonyítható állapot; `retryAllowed:false`.
5. **Transfer Center UX:** a személyes felületen `CONFIRMATION_UNKNOWN` és `STATUS_UNAVAILABLE` soroknál külön **Ellenőrzés** gomb jelenik meg. A gomb egyszeri GET hívást indít, nem újra-POST-ol és nem használ külön request ID-t. Csak 200 + VERIFIED_CLEAN + egyező méret után válik a sor AVAILABLE státuszúvá. Ha a fájllista újratöltése sikertelen, az igazolt státuszt nem vonjuk vissza.
6. **XHR megszakítás:** a hálózati küldés megkezdése (`xhr.send()`) után a megszakítás bizonytalan eredmény; a hálózati progress esemény hiánya már nem jelenti, hogy szerveroldali commit biztosan nem volt.

## QA

- V0.9.65 új `scripts/tests/dimpro-drive-v0965-personal-receipt-contract.mjs`: saját USER sikeres, nem található ref, sérült/hiányzó objektum, rossz bucket, nem CLEAN, hibás hash/méret, DB/S3 elérhetetlenség, authentikáció és read-only route/UI source contract **PASS**.
- V0.9.62 valós TypeScript transportot futtató XHR mock + megszakítás-besorolás **PASS**.
- 21 szerződéses/regressziós teszt **PASS**.
- 5 migráció izolált PGlite tesztje és rollback **PASS**.
- TypeScript / ESLint **PASS**, `git diff --check` **PASS**.
- Nincs hitelesített valós Next.js → S3 → DEV DB E2E. A tesztek nem igazolják a publikus böngészős működést.

## Release korlátok és következő V0.9.66

- A V0.9.63 BUILD01 végrehajtási hívását külső eszközbiztonsági réteg blokkolta. V0.9.64-65 forrásfejlesztés **BUILD PENDING**, nem minősül BUILD01 PASS-nak. Nem kerültük meg a blokkolást.
- A DEV/PROD S3/DB elkülönítés független, ellenőrzött inventory-ja hiányzik. Valódi S3 PUT/DB-írás és a 100 MiB/500 fotós pilot továbbra is **NO-GO**.
- A feladatlista memóriában van: a böngésző újranyitása után a bizonytalan request ID még nem kerül tartósan, titokmentes formában visszaállításra. Ez külön V0.9.66 UX/biztonsági feladat.
- V0.9.66 javaslat: tartós, minimális, nem titkos receipt-jegyzék, felhasználóhoz kötött helyreállítás; a 500 elemes queue UI akadálymentes/hibaállapot tesztek, majd jóváhagyott BUILD01 + izolált DEV E2E.
- A hosszú távú 5 GiB multipart `PERSONAL_MULTIPART_SERVER_RELEASED=false` tiltása továbbra is kötelező.

A publikus `drive.dev.dimpro.hu` V0.9.52 marad, a PROD rendszeren nincs változás.
