# DIMPRO Drop 1.2.3 – központi Send felhasználó és ténylegesen használható Send-kód release

Dátum: 2026-08-08  
Állapot: released / private pilot  
Fejlesztési Központ: `version_53f700a6-ed8`  
Éles release: `.next-v123-release-final`  
BUILD_ID: `Vgc0cCBB8Qp0ZHQmPY8g5`  
Közvetlen rollback: `.next-v122-release-final`  
Aktiválási backup: `backups/drop_v123_release_activation_20260807_222244`  
Végső forrásbackup: `backups/drop_v123_final_pre_release_20260807_222025`

## Cél

A DROP 1.2.2-ben a központi licenc és Send entitlement adminfolyamat már létrejött, de a Send kártyáról nem lehetett új, használható központi felhasználót létrehozni vagy egy meglévő, még nem hitelesített központi felhasználót Send-használatra aktiválni. Emiatt a gyakorlatban előfordulhatott, hogy a megadott Send-kódhoz nem jött létre használható központi entitlement.

A DROP 1.2.3 ezt a használati láncot zárja le. Nem jött létre külön Drop-specifikus user/licenc adatbázis; minden változatlanul a LIVE Identity Core 0.1.0 központi tábláit használja.

## Elkészült módosítások

- új vagy meglévő központi DIMPRO felhasználó kezelése közvetlenül a Send adminfelületen;
- kötelező mezők: teljes név és egyedi e-mail-cím;
- opcionális mezők: telefonszám és szervezet;
- adminisztratív e-mail-ellenőrzés szükséges a Send-jogosultság aktiválásához;
- meglévő, azonos e-mailű felhasználónál nem készül duplikált rekord: a központi rekord frissül és aktiválható;
- opcionális szervezet a központi `dimpro_organizations` táblában és `dimpro_organization_memberships` kapcsolaton keresztül kezelődik;
- a központi licencválasztó csak ténylegesen használható `active` / `trial` licencet enged: az aktiválási és lejárati idő is ellenőrzött;
- a saját `LIC-ÉÉ-XXXX-XXXX` licenckód és a saját `ABCD-123-456` Send-kód logikája megmaradt;
- Send entitlement csak aktív, e-mailben ellenőrzött központi userhez és ténylegesen aktív licenchez hozható létre;
- a nyers Send-kód továbbra sem kerül adatbázisba, csak HMAC-lenyomat és biztonságos hint;
- a `/send` felület ugyanazzal a frissen létrehozott kóddal ténylegesen beléptet és megjeleníti a központi feladó nevét, e-mailjét és szervezetét;
- a Send-kód eszközön történő megjegyzése és törlése változatlanul működik;
- mobil böngészőn nincs vízszintes overflow a sikeres Send-belépés után;
- a browser E2E fixture cleanup javítva lett: a kapcsolódó `drop_public_sessions`, entitlement, licenc, membership, audit és szervezet rekordok is törlődnek.

## Központi adatmodell

A fejlesztés kizárólag a meglévő Identity Core táblákat fogyasztja:

- `dimpro_users`
- `dimpro_organizations`
- `dimpro_organization_memberships`
- `dimpro_licenses`
- `dimpro_license_modules`
- `dimpro_send_entitlements`
- `dimpro_send_recipients`
- `dimpro_access_audit_logs`
- `dimpro_access_rate_limits`

Új Identity Core migráció, bootstrap vagy párhuzamos Drop user/licenc adatbázis nem készült.

## Használati folyamat

1. A Send adminfelületen válasszon meglévő központi felhasználót, vagy nyissa meg az `Új központi felhasználó létrehozása` panelt.
2. Adja meg a teljes nevet és e-mail-címet; opcionálisan telefonszámot és szervezetet.
3. Erősítse meg, hogy az e-mail-cím adminisztratívan ellenőrzött.
4. A felhasználó létrejön vagy az azonos e-mailű meglévő központi rekord frissül és kiválasztódik.
5. Válasszon aktív központi licencet, vagy hozzon létre saját `LIC-...` kóddal új licencet.
6. Adja meg a saját Send-kódot, például `HAGE-123-456`.
7. Állítsa be a címzettmódot, limiteket és moduljogosultságokat.
8. Hozza létre a központi Send entitlementet.
9. A kód a `https://drop.dimpro.hu/send` felületen azonnal használható.

## Validáció

- TypeScript: **PASS**;
- teljes ESLint: **0 hiba**, 107 meglévő warning;
- production candidate build: **exit 0**;
- BUILD_ID: `Vgc0cCBB8Qp0ZHQmPY8g5`;
- központi user → licenc → entitlement → verify szerveroldali teszt: **11/11 PASS**;
- meglévő, nem hitelesített user frissítési/aktiválási teszt: **7/7 PASS**;
- candidate browser E2E: **16/16 PASS**;
- immutable release browser E2E: **16/16 PASS**;
- live production browser E2E: **16/16 PASS**;
- teljes Send → projekt → S3 → ClamAV → finalize → audit/rate-limit → elszámolás → album/ZIP E2E: **42/42 PASS**;
- Send regresszió: **24/24 PASS**;
- Identity Core fogyasztói contract: **55/55 PASS**;
- kamera/e-mail contract: **58/58 PASS**;
- private-pilot validáció: **97/97 PASS**;
- Identity Core health: **12/12 READY**;
- HTTPS Drop health: `DROP 1.2.3`, `dimproSend=true`, `identityCoreConsumer=true`, `emailNotifications=true`, `submissionGate=true`;
- PM2 `dimprover`: **online**;
- Drop worker timer: **active**;
- tesztfixture maradványok célzott takarítása megtörtént.

## Biztonság

- a Drop továbbra sem hoz létre párhuzamos identity/licenc adattárat;
- az admin e-mail-hitelesítési jelölés a belső Send-admin folyamathoz tartozik, és nem helyettesíti a későbbi `auth.dimpro.hu` OTP/passkey/Eszközhíd folyamatot;
- a Send-kód nyers formája nem olvasható vissza a központi adatbázisból;
- lejárt vagy még nem aktivált licenc nem választható használható entitlementhez;
- a release private-pilot marad, nyilvános GA nem került megnyitásra.

## Release állapot

A DROP 1.2.3 éles private-pilot release. Aktív release: `.next-v123-release-final`. Közvetlen rollback pont: `.next-v122-release-final`.
