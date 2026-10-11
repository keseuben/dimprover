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
