# DIMPRO Terepi Gyorsrögzítő – F3 Saját DIMPRO Drive UI aktiválás

**Forrás candidate:** 2026-08-19 (`5613bae`)
**Release ellenőrzés:** 2026-08-21
**Környezet:** kizárólag DEV
**Állapot:** AKTÍV DEV RELEASE – VALIDÁLT

## 1. Cél

A P8 Saját DIMPRO Drive backend, USER ownership, Content Core kapcsolat és kliensszinkron korábban elkészült. Az F3 fejlesztési blokk célja, hogy a teljes F1/F2 mobil/browser acceptance után a **Saját DIMPRO Drive** mentési cél a Terepi Gyorsrögzítő felhasználói felületén is választható legyen.

A Projektkapu Drive **nem része az aktiválásnak**; továbbra is P9 és kikapcsolva marad.

## 2. Aktivált felhasználói működés

A kép előtti gyors beállításban a felhasználó opcionálisan bekapcsolhatja:

**Saját DIMPRO Drive – P8 aktív**

A kapcsoló alapállapota továbbra is KI, tehát a mentés explicit felhasználói döntés.

A kiválasztás képenként kerül a capture option snapshotba. Ha a munkamenet alapbeállításainak megjegyzése be van kapcsolva, a következő képnél ez az opció is öröklődhet, de képenként felülírható.

## 3. Mentési sorrend és biztonsági kapuk

A Saját Drive mentés sorrendje nem változik:

1. helyi IndexedDB capture;
2. DIMPRO szerveres session/item rekord;
3. privát Field Capture staging;
4. resumable Drop feltöltés;
5. upload complete + reconcile;
6. `SERVER_STORED` állapot;
7. vírus- és biztonsági ellenőrzés;
8. Saját DIMPRO Drive mentés;
9. `SYNCED` állapot.

A User Drive mentés csak tiszta Drop objektumból indulhat. Ha a vírusellenőrzés még folyamatban van, a kliens `DESTINATION_PENDING` állapotot tart fenn, és a mentés újrapróbálható.

## 4. Ownership és életciklus

A Saját DIMPRO Drive cél:

- ownership: `USER`;
- scope: `USER_ROOT`;
- független retention: igen;
- Content Core referencia: igen;
- content-addressed objektumtárolás: igen;
- nyers upload capability/token tartós tárolása: nincs.

A Projektkapu Drive külön tulajdonosi és ACL tartomány marad, ezért a P8 aktiválása nem engedélyezi automatikusan a projektoldali Drive célt.

## 5. Mentés és befejezés kapcsolat

Ha egy képnél a Saját DIMPRO Drive mentés ki van választva, a munkamenet `Mentés és befejezés` művelete csak akkor tekinti teljesnek az adott tételt, ha a User Drive mentés is `SYNCED` állapotba került.

Ez megakadályozza, hogy a UI lezártnak jelezzen olyan munkamenetet, ahol a felhasználó kifejezetten Saját Drive mentést kért, de az még nem teljesült.

## 6. UI és health módosítás

- Terep kliensverzió: `0.4.1-dev`;
- health fázis: `P0-P8`;
- Saját DIMPRO Drive kapcsoló: aktív;
- Projektkapu Drive kapcsoló: továbbra is disabled / `P9`;
- a korábbi jövő idejű P8 tájékoztató szövegek megszűnnek.

## 7. Kötelező release gate

F3 csak akkor kerülhet DEV cutoverre, ha legalább az alábbiak zöldek:

- P8 backend contract;
- P8 UI activation contract;
- client-sync contract;
- finalize contract;
- upload-rules proxy;
- P7 server/staging;
- Terep acceptance;
- GPS fotótérkép / kalibráció regresszió;
- GyorsSend regresszió;
- TypeScript;
- célzott ESLint;
- `git diff --check`;
- mobil/browser candidate acceptance;
- User Drive választás és státuszmegjelenítés acceptance.

**PROD változatlan marad.**

## 8. 2026-08-21 – F3 DEV release lezárás

Az F3 shared release a `release/jazmin-terep-f3-shared-20260821` ágon készült el úgy, hogy egyszerre megőrzi az aktuális Commerce integration, a BENJADMIN operator és a Terep F3 történetét.

### Release identity

- runtime source commit: `ef77d4832b01ef50fd67e010a2383c95685da324`;
- release: `.next-terep-f3-shared-ef77d48`;
- BUILD_ID: `3sC-DdpF28XJFcx-no46D`;
- aktiválás ideje: `2026-08-21T13:00:00+02:00`;
- előző release: `.next-chatgrid-pairing-v023-release3-a82d2bf`;
- rollback backup: `/srv/dimpro-dev/backups/shared-ef77d48-cutover/20260821T125953+0200`.

Az első shared cutover-kísérlet automatikusan rollbackelt, mert az operatorba másolt standalone artifact `.dimprover` symlinkje még nem a kanonikus operator adattárra mutatott. A symlink javítása után a második, koordinált cutover sikeresen lefutott.

### Exact shared candidate gate

- P8 backend contract: `14/14 PASS`;
- P8 UI activation contract: `12/12 PASS`;
- client-sync contract: `15/15 PASS`;
- Terep statikus acceptance: `66/66 PASS`;
- TypeScript: PASS;
- `git diff --check`: PASS;
- izolált F3 mobil UI browser acceptance: `13/13 PASS`;
- izolált Terep P0–P6 mobil regresszió: `28/28 PASS`;
- izolált teljes kliensszinkron browser E2E: PASS;
- server status: `SERVER_STORED`;
- asset storage: `STORED`;
- staging private: true;
- raw capability persistence: false;
- browser page error: 0;
- browser console error: 0;
- E2E cleanup: capture 0 / package 0.

### Live DEV gate

A `https://drop.dev.dimpro.hu` aktív DEV domainen:

- F3 mobil UI browser acceptance: `13/13 PASS`;
- Terep P0–P6 mobil regresszió: `28/28 PASS`;
- teljes kliensszinkron browser E2E: PASS;
- health: `0.4.1-dev`;
- phase: `P0-P8`;
- Saját DIMPRO Drive: READY;
- Projektkapu Drive: továbbra is P9 / kikapcsolva;
- browser page error: 0;
- browser console error: 0;
- E2E cleanup: capture 0 / package 0.

### Záró állapot

**F3 – Saját DIMPRO Drive UI: AKTÍV DEV RELEASE / VALIDÁLT.**

A runtime artifact forrása továbbra is az `ef77d48` commit. Az ezt követő dokumentációs closeout commit nem módosít runtime kódot, ezért új build nem szükséges.

**PROD változatlan.**
