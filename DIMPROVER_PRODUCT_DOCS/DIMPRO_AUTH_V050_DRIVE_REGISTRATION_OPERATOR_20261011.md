# DIMPRO Central AUTH V0.5.0 – Enter, Saját Drive regisztráció, üzemeltetői értesítési sor

Állapot: SOURCE CANDIDATE ONLY · NO DEV DEPLOY · NO DB MIGRATION · NO OPERATOR EMAIL · PROD DENY.

## Hitelesített jelenlegi működés

Az új ügyfél igénylésének első lépésében a központi AUTH auth_users táblában közös felhasználói rekord jön létre SIMPLE biztonsági szinttel és login_enabled=false állapottal. Egy már létező felhasználó esetén a meglévő belépési jogosultság nem változik. A kódkérés státusza PENDING_EMAIL, a hatjegyű OTP igazolásáé EMAIL_VERIFIED. Ez önmagában nem ad Drive tárhelyet, licencet, DRIVE_PERSONAL_USER jogosultságot vagy teljes felhasználói aktiválást.

A V0.4.0 regisztrációs forrásban még nem volt üzemeltetői e-mail-értesítés, csak AUTH audit.

## Új V0.5.0 forrás

- app/login/DimproAppOtpLogin.tsx: az Enter ugyanazt a sendCode folyamatot hívja, mint a Küldés gomb, a küldési tiltásokat betartva; siker után a meglévő kódmező fókusz logika fut le.
- db/auth/migrations/013_auth_v050_drive_registration_operator_notices.sql: nem aktivált PostgreSQL migráció. Az EMAIL_VERIFIED státuszt elérő regisztrációhoz tartós, egyedi, auditálható értesítési sor tartozik. Meglévő igazolt kérelmeket migrációkor pótolja, de semmit nem küld.
- A sor foglalása atomikus, egyszer próbálkozhat: PENDING -> PROCESSING -> SENT vagy AMBIGUOUS. Ismételt OTP nem duplikálja a sort; SMTP-hiba vagy bizonytalan átvétel után automatikus újraküldés nincs. PROCESSING/AMBIGUOUS esetén kézi audit szükséges.
- app/lib/dimpro-auth/drive-registration-operator.ts: admin profilú SMTP, magyar nyelvű, HTML-escape-elt levél névvel, e-mail-címmel, szervezettel, regisztrációs azonosítóval és igazolási időponttal. A levél nem tartalmaz OTP kódot.
- A levélküldés a forrásban HARD OFF. Jövőbeni szükséges beállítás: külön jóváhagyott DIMPRO_AUTH_DRIVE_OPERATOR_TO, DIMPRO_AUTH_DRIVE_OPERATOR_NOTIFY_ENABLED=true, működő admin SMTP, és külön felszabadított forráskód release gate. Most nem indul e-mail.
- GET /api/dimpro-auth/admin/drive-registration-requests: DEV auth hostra szűkített, külön DIMPRO_AUTH_OPERATOR_ADMIN_KEY (min 32 bájt) Bearer-kulcs védte várólista API, legfeljebb 100 bejegyzés. Nem tartalmaz OTP-t.
- A dedikált grafikus üzemeltetői inbox, a jóváhagyás és elutasítás, a licenc és Drive-grant megadása MÉG NEM készült el.

## Biztonság és ellenőrzés

- A szakmai vagy felhasználói regisztrációs címke nem emel automatikusan jogosultságot.
- Az AUTH DB migráció csak külön DBA jóváhagyással, később; PROD DENY.
- 18/18 izolált PostgreSQL próbateszt: sor-létrejötte, nem igazolt kérés kizárása, deduplikáció, claim, sender ACK, AMBIGUOUS, role denial PASS.
- TypeScript és célzott ESLint PASS. A böngészős Enter/fókusz UX E2E a későbbi DEV telepítés után végzendő.

## BUILD01 ellenőrzött kiadási jelölt – 2026-10-11

- Source commit: 991971a273cb512bb09555b37c1944f18da15755.
- Run ID: auth-v050-991971a27-20261011-build01-b1.
- Full Next.js BUILD01: PASS, 103 oldal, 270 asset ellenőrizve.
- Build ID: _f5IomIWn85-ATdpF82AF.
- Artifact SHA-256: 0befc0e3093462bb023292fec6c4dc413a2002763bd5369f9bf34425a34f60cb.
- Artifact tárolása: BUILD gateway ellenőrzött futásmappa; NEM telepítve.
- További védelmi unit: scripts/tests/auth-drive-registration-operator-gate.mjs, 11/11 PASS. Vizsgálja a hard OFF tiltást, címzettvalidációt, XSS HTML escape-t és a védett operator kulcsot.
- DEV tárhely továbbra is 99%, 2,2 GiB szabad; build/deploy DEV-en tiltva a külön kapu-jóváhagyásig.
- A regisztrációs üzemeltetői email címzett és az admin felület véglegesítése külön emberi jóváhagyást igényel.
