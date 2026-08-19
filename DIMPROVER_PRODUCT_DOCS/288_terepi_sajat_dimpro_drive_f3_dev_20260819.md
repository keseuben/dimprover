# DIMPRO Terepi Gyorsrögzítő – F3 Saját DIMPRO Drive UI aktiválás

**Dátum:** 2026-08-19  
**Környezet:** kizárólag DEV  
**Állapot:** SOURCE CANDIDATE

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
