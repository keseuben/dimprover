# DIMPRO Drop 1.2.1 – Licencközpont, Send UX és képalbum release

Dátum: 2026-08-07
Státusz: released / private pilot
Éles release: `.next-v121-release-final`
BUILD_ID: `tDQnHhBYliSgpELkCs5bv`
Rollback: `.next-v110-release-final`

## Elkészült funkciók

- központi DIMPRO Licencközpont / Send entitlement adminfolyamat a meglévő Identity Core adatbázisra építve;
- kézzel megadható DIMPRO Send-kód, automatikus generálási kényszer nélkül;
- a legutóbbi Send-kód opcionális eszközoldali megjegyzése mobilon és desktopon;
- a mentett Send-kód külön törölhető a biztonságosabb használathoz;
- Gyors KépSend esetén további címzett(ek) megadása a központi entitlement-szabályok megtartásával;
- Drop rendszerlevelek külön `ertesites.drop@dimpro.hu` feladóprofillal; a Drive profil külön marad;
- mobil lebegő dock igazítása, ikonok/gombok a dock területén belül maradnak;
- letöltési kapu albumos képrácsa, reszponzív 2/3/4 oszlopos megjelenítéssel;
- képre kattintva teljes kép új böngészőfülön nyitható, külön Letöltés gombbal közvetlen fájlletöltés indítható;
- eredeti fájlnév megőrzése az audit-adatban;
- opcionális DIMPRO szabványos és rendezett fotónév;
- rendezett fotónév séma: készítés dátuma + ideje + feltöltés dátuma + automatikus sorszám + képenkénti megnevezés;
- képenként szerkeszthető megnevezés;
- opcionális ékezet- és szóközmegtartás;
- opcionális `DIMPRO_` márkaelőtag kizárólag a ZIP csomag nevében;
- Drop kezdőlapi béta státusz második sora olvashatóbb méretre növelve;
- workflow-kártyák magyarázó szövegei nagyobb, normál betűvastagságú tipográfiát kaptak.

## Validáció

- TypeScript: PASS;
- célzott ESLint: PASS, 0 hiba;
- DROP 1.2.0/1.2.1 funkciós szerződés: PASS;
- Identity Core fogyasztói szerződés: PASS;
- candidate Identity/UI/mobil E2E: 26/26 PASS;
- candidate teljes Send → projekt → S3 → ClamAV → finalize → audit/elszámolás + album/ZIP E2E: 42/42 PASS;
- release-példány Identity/UI/mobil E2E: 26/26 PASS;
- production Identity/UI/mobil E2E: 26/26 PASS;
- production Drop health: PASS;
- Identity Core: 12/12 READY;
- worker timer: active;
- PM2 `NEXT_DIST_DIR`: `.next-v121-release-final`;
- éles HTTPS felület: HTTP 200.

## Release megjegyzés

A kiadás továbbra is private-pilot / korlátozott béta. `generalAvailabilityReleased=false` marad. A teljes `auth.dimpro.hu` passkey / Eszközhíd / session / recovery fejlesztés nem része ennek a release-nek.
