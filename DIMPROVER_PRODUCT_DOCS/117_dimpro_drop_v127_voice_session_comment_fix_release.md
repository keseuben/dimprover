# DIMPRO Drop 1.2.7 – hangátírás, megjegyzés és Send session hibajavítás

Dátum: 2026-08-08  
Állapot: RELEASED – private pilot  
Éles URL: https://drop.dimpro.hu  
Éles release: `.next-v127-release-final`  
BUILD_ID: `HCvL04edGt_r4vonVtJZR`  
Közvetlen rollback: `.next-v126-release-final`  
Fejlesztési Központ: `version_79a37084-9e8`

## Javított felhasználói hibák

1. **Hangos megjegyzés látható állapot nélkül állt le.**
   - A Gyors KépSend továbbra is a böngésző/készülék `SpeechRecognition` motorját használja, nem tárol DIMPRO hangfájlt.
   - Fájlonként külön állapotgép készült: `Felvétel folyamatban` → `Átirat véglegesítése` → `Átirat elkészült` / `Hiba` / `Megszakítva`.
   - Ha a böngésző nem ad vissza felismerhető szöveget, a felület ezt explicit hibaként jelzi.
   - A leállítás utáni final-result várakozás 1,5 másodperces biztonsági lezárást kapott.

2. **Levélüzenet diktálása.**
   - A Gyors KépSend `Üzenet a képek mellé` mező és a Normál Send `Rövid üzenet a címzetteknek` mező is megkapta a licencelt, max. 60 mp-es diktálást.
   - Ugyanazok a felvétel/feldolgozás/kész/hiba visszajelzések működnek.
   - Az elkészült átirat a levélüzenethez fűződik és küldés előtt szerkeszthető.

3. **Megjegyzés szerkeszthetetlenné vált feltöltés után.**
   - A karanténba került / vírusellenőrzés alatt álló kép megjegyzése továbbra is szerkeszthető.
   - A hangos megjegyzés is használható ebben az állapotban.
   - A fájlmegjegyzés API `PUT` upsert működést kapott: ismételt módosítás nem gyárt több aktív feladói megjegyzést.
   - Üresre törölt megjegyzés a korábbi aktív feladói megjegyzést soft-delete állapotba teszi.
   - A véglegesítés előtt a kliens kötelezően szinkronizálja a legutolsó megjegyzéseket a szerverre.

4. **`A küldemény nem ehhez a publikus munkamenethez tartozik.`**
   - Gyökérok: a `/send` oldal korábban már a központi Send-kód azonosítása előtt visszaállíthatott egy régi csomagot a publikus cookie-ból, majd a Send-kód ellenőrzése egy új publikus session-cookie-t hozott létre. Így a képernyőn lévő package és az aktuális session szétcsúszhatott.
   - Javítás: Send módban nincs automatikus package-resume a központi Identity azonosítás előtt.
   - A Send-kód sikeres ellenőrzése után csak olyan korábbi csomag állítható vissza, amelynek `dimproSendEntitlementId` értéke pontosan megegyezik az aktuális entitlementtel.
   - Resume esetén a rendszer rotálja és újra kiadja az upload capability-t; a régi upload token érvénytelenné válik.
   - `Új képfeltöltés / Send` esetén `forceNew` új publikus session indul, ezért egy korábban kézbesített csomag nem áll vissza újra.

5. **E-mail nem ment ki a finalize hiba miatt.**
   - A session/package kötés javítása után a finalize sikeresen lefut.
   - Candidate és production E2E-ben a workflow `notification_status = sent` értékkel zárult.

## Diagnosztikai pontosítás

A Drop health `emailPreviewMaxImages` értéke a tényleges 20 képes szabályhoz igazítva `20` lett; a korábbi health-adat tévesen még `6` értéket mutatott.

## Validáció

- TypeScript: PASS
- teljes ESLint: 0 error / 108 meglévő warning
- DROP 1.2.7 forrás-contract: 17/17 PASS
- candidate build: exit 0
- candidate BUILD_ID: `HCvL04edGt_r4vonVtJZR`
- 140 statikus chunk: PASS
- termékkód pre-build checksum: PASS
- candidate browser E2E: 30/30 PASS
  - benne szimulált SpeechRecognition → levélüzenet átirat tényleges beillesztése
- candidate teljes S3/ClamAV/session-resume/comment/finalize/e-mail/PDF/TXT/ZIP E2E: 58/58 PASS
- immutable release browser E2E: 30/30 PASS
- production browser E2E: 30/30 PASS
- production teljes S3/ClamAV/session-resume/comment/finalize/e-mail/PDF/TXT/ZIP E2E: 58/58 PASS
- production `notification_status`: `sent`
- production `/`, `/send`, `/open`: HTTP 200
- production Drive: HTTP 200
- production Projektkapu: HTTP 200
- Identity Core: 12/12 READY
- e-mail preview health: 20

## Voice funkció jelenlegi határa

A DROP 1.2.7 Gyors KépSend hangfunkciója **nem szerveres hangrögzítés**. A böngésző/készülék beszédfelismerőjét használja, ezért készülék- és böngészőfüggő. DIMPRO hangfájlt nem tárol. A professzionális szerveres Speech Engine, offline hangqueue és AI feldolgozás a külön DIMPRO Terepi Kontroll fejlesztési kör része.

## Rollback

1. `.dimprover/active-next-release` → `.next-v126-release-final`
2. PM2 `NEXT_DIST_DIR` → `.next-v126-release-final`
3. koordinált `pm2 restart dimprover --update-env`

Az aktiválási backupot a `.work_drop_v127_release_activation_backup` fájl rögzíti.

## Release besorolás

Private-pilot. GA továbbra is `false`.
