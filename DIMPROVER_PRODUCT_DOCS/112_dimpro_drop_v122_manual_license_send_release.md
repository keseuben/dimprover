# DIMPRO Drop 1.2.2 – kézi központi licenckód és használható Send entitlement release

Dátum: 2026-08-07  
Állapot: released / private pilot  
Éles release: `.next-v122-release-final`  
BUILD_ID: `r2ZFL-goBnOHXH_veTf8a`  
Közvetlen rollback: `.next-v121-release-final`  
Aktiválási backup: `backups/drop_v122_release_activation_20260807_193121`

## Cél

A DROP 1.2.1-ben a központi Send entitlement már az Identity Core adatbázist használta, de az adminfelületen csak meglévő központi licencek közül lehetett választani. A DROP 1.2.2 ezt a hiányzó használati láncot zárja le: az admin saját központi licenckódot adhat meg, létrehozhatja a licencet a kiválasztott felhasználóhoz, majd ugyanott saját Send-kódot és Send entitlementet hozhat létre.

Az Identity Core 0.1.0 adatbázissémája nem változott, új bootstrap vagy újramigrálás nem történt, és nem jött létre Drop-specifikus párhuzamos felhasználói/licencadatbázis.

## Elkészült funkciók

- saját, admin által meghatározott központi DIMPRO licenckód;
- kötelező központi formátum: `LIC-ÉÉ-XXXX-XXXX`;
- a biztonságos karakterkészletből a `0`, `1`, `I`, `L`, `O` karakterek kizárva;
- duplikált licenckód adatbázisoldali elutasítása;
- a licenc közvetlenül a LIVE `dimpro_licenses` táblába kerül;
- moduljogosultságok a központi `dimpro_license_modules` táblába kerülnek;
- licenclétrehozás auditálása a központi hozzáférési auditban;
- teljes DIMPRO Licencközpont: `/admin/licenckozpont`;
- a Drop Send adminfelületen helyben lenyitható `Új központi licenc létrehozása` blokk;
- az inline módon létrehozott licenc automatikusan kiválasztódik az új Send entitlementhez;
- saját DIMPRO Send-kód mező a Send adminfelületen;
- Send-kód formátum: négy betű + hat számjegy, például `HAGE-123-456`;
- automatikus Send-kódgenerálás nem szükséges;
- a szerver a Send-kódból kizárólag HMAC-lenyomatot tárol, a nyers kód nem olvasható vissza;
- saját licenckód és saját Send-kód együttes, auditált Identity Core kapcsolata;
- a licenckódmező gépelési UX javítása: gépelés közben nem erőlteti újra az előtagot, kilépéskor normalizál;
- elfogadott licencbevitel: teljes kód, kötőjel nélküli teljes kód vagy a nyolc karakteres saját rész;
- a korábbi DROP 1.2.1 képnév-, album-, többcímzettes Gyors KépSend-, kódmegjegyzési és Drop SMTP funkciók változatlanul megmaradtak.

## Admin használati folyamat

1. Központi felhasználó kiválasztása.
2. `Új központi licenc létrehozása` megnyitása.
3. Saját `LIC-ÉÉ-XXXX-XXXX` licenckód megadása.
4. Termék, csomag, státusz, aktiválás és lejárat beállítása.
5. Licenc létrehozása; az új licenc automatikusan kiválasztódik.
6. Saját `ABCD-123-456` Send-kód megadása.
7. Címzettmód, címzettek, csomaglimit és moduljogosultságok beállítása.
8. Központi Send entitlement létrehozása.
9. A Send-kód azonnal használható a `https://drop.dimpro.hu/send` felületen.

## Validáció

- licenckód normalizálási teszt: PASS három beviteli formára;
- valós Supabase központi licenc + Send entitlement teszt: **13/13 PASS**;
- candidate admin böngésző E2E: **14/14 PASS**;
- immutable release admin böngésző E2E: **14/14 PASS**;
- production admin böngésző E2E: **14/14 PASS**;
- teljes Send → projekt → S3 → ClamAV → finalize → audit/elszámolás → album → ZIP E2E: **42/42 PASS**;
- Send regresszió: **24/24 PASS**;
- Identity Core fogyasztói szerződés: **55/55 PASS**;
- kamera/e-mail regresszió: **58/58 PASS**;
- private-pilot validációs szerződés: **97/97 PASS**;
- Identity Core health: **12/12 READY**;
- TypeScript: **PASS**;
- teljes ESLint: **0 hiba**, 112 korábbról ismert warning;
- production HTTPS: kezdőlap, Send és licencadmin workflow **HTTP 200**;
- PM2 `dimprover`: **online**;
- worker timer: **active**;
- tesztmaradvány: **0 felhasználó / 0 licenc / 0 projekt**;
- teljes E2E S3 tesztobjektum: törölve.

## Biztonsági döntések

- a licenckódot az admin választja, de a központi forma és karakterkészlet kötelező;
- licenckód-egyediség adatbázisoldalon is védett;
- a Send-kód nyers formában nincs központi adatbázisban tárolva;
- az új licenc kizárólag a központi Identity Core táblákba kerül;
- legacy Send-kódok automatikus összerendelése továbbra sincs;
- a teljes `auth.dimpro.hu` passkey / Eszközhíd / session / recovery rendszer továbbra is külön fejlesztési szakasz.

## Release állapot

A DROP 1.2.2 private-pilot kiadás. A nyilvános GA nincs megnyitva, `generalAvailabilityReleased=false` marad.
