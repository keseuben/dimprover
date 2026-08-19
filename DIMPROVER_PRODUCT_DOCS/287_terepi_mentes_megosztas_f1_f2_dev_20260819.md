# DIMPRO Terepi Gyorsrögzítő – Mentés és megosztás F1/F2 DEV fejlesztés

**Dátum:** 2026-08-19  
**Környezet:** kizárólag DEV  
**Állapot:** SOURCE CANDIDATE – release/cutover előtt

## 1. Cél

A Terepi Gyorsrögzítő technikai P7/P7.1/P7.2 kliensszinkronja és a GPS fotótérkép után a 3. workflow-lépés felhasználói lezárása készült el.

A korábbi, elavult szöveg – amely még külön jövőbeli P7 fejlesztési kapuként hivatkozott a szerveres szinkronra – kikerült. A 3. lépés neve:

**Mentés és megosztás**

A fejlesztés nem tartalmaz PDF/DXF tervillesztést, Projektkapu Drive P9 aktiválást, e-mail küldést vagy teljes terepi riportot.

## 2. F1 – Mentés képernyő valós státuszai

A Mentés képernyő külön mutatja:

- helyben mentett képek száma / IndexedDB;
- DIMPRO szerveren igazoltan tárolt képek száma;
- Saját DIMPRO Drive cél állapota, ha ilyen cél ténylegesen kérve van;
- várakozó szinkron vagy mentési célok;
- sikertelen, újrapróbálható elemek;
- munkamenet ACTIVE/CLOSED állapota;
- képszám;
- megjegyzések száma;
- GPS-pontok száma;
- rögzített kamerairányok száma;
- szerkesztett/képjelölővel módosított képek száma.

A szerveres státusz csak a kliensszinkron által visszaigazolt `SERVER_STORED`, `DESTINATION_PENDING` vagy `SYNCED` állapotból számolódik. A UI nem állít felhő- vagy Drive-mentést pusztán a helyi IndexedDB rekord alapján.

## 3. F2 – Mentés és befejezés

Új explicit felhasználói művelet:

**Mentés és befejezés**

A lezárás előtt:

1. ellenőrzésre kerül a helyi capture állapot;
2. ha kell, a meglévő kliensszinkron indul el;
3. hibás vagy várakozó szerveres/Drive cél esetén a session nem záródik le;
4. a Projektkapu Drive P9 cél jelenleg blokkolja a lezárást, mert az még nincs aktiválva;
5. sikeres szerveres ellenőrzés után külön finalize API zárja le a munkamenetet;
6. a kliens csak szerveres `CLOSED` visszaigazolás után állítja helyben lezártnak a sessiont.

Új API:

`POST /api/field-capture/sessions/:sessionId/finalize`

A finalize szerveroldalon ellenőrzi:

- a session ownership + entitlement jogosultságot;
- a helyi és szerveres tételszám egyezését (`expectedItemCount`);
- hogy minden szerveres képtétel `SERVER_STORED` állapotú;
- hogy minden CAPTURE cél `STORED`;
- hogy minden ténylegesen kért USER_DRIVE / PROJECT_DRIVE cél `STORED`;
- az idempotens `CLOSED` újrahívást;
- a `SESSION_CLOSED` audit eseményt.

A `field_capture_sessions.closed_at` már a P7 sémában rendelkezésre állt, ezért új DB migráció nem szükséges.

## 4. Closed session és offline adatbiztonság

A helyi session modell új mezői:

- `closedAt`;
- `serverSessionId`.

A lezárt session reload után is visszaállítható, nem indul automatikusan új session.

**Fontos adatbiztonsági szabály:** a `Mentés és befejezés` nem törli az IndexedDB képeket. A lezárt munkamenet helyi adatai csak az explicit `Új munkamenet` műveletkor kerülnek eltávolításra az aktuális eszközről.

Offline állapotban szerveres lezárás nem történik. A helyi képek és metaadatok változatlanul megmaradnak, és hálózat visszatérésekor a lezárás újrapróbálható.

## 5. Idempotencia javítás

A szerveres session upsert többé nem írja minden újrahívásnál kényszerítetten `ACTIVE` állapotba a munkamenetet.

Ez azért szükséges, hogy egy lezárt session helyreállító/retry hívása ne nyissa újra véletlenül a `CLOSED` sessiont.

## 6. Új / módosított fő fájlok

- `components/field-capture/FieldCaptureShell.tsx`;
- `app/lib/field-capture/types.ts`;
- `app/lib/field-capture/captureSessionService.ts`;
- `app/lib/field-capture/captureFinalizeService.ts`;
- `app/lib/field-capture/clientSyncService.ts`;
- `app/lib/field-capture/serverRepository.ts`;
- `app/api/field-capture/sessions/[sessionId]/finalize/route.ts`;
- `scripts/field-capture-finalize-contract.mjs`;
- `scripts/terep-p0-p6-acceptance.cjs`.

Terepi kliensverzió source candidate: **0.4.0-dev**.

## 7. Source gate aktuális eredmények

- Field Capture finalize contract: `11/11 PASS`;
- Field Capture upload-rules proxy: `6/6 PASS`;
- Field Capture client sync: `14/14 PASS`;
- Field Capture staging: `14/14 PASS`;
- P8 Saját DIMPRO Drive: `14/14 PASS`;
- P7 server: `14/14 PASS`;
- Terep acceptance: `66/66 PASS` a friss valós státusz-elvárással;
- GPS fotótérkép UI: `11/11 PASS`;
- GPS PDF contract: `12/12 PASS`;
- GPS calibration UI: `12/12 PASS`;
- GyorsSend regresszió: `44/44 PASS`;
- célzott ESLint: PASS;
- `npx tsc --noEmit` / TypeScript compiler: PASS;
- `git diff --check`: PASS.

A candidate build, izolált browser/mobile acceptance és DEV cutover külön release-kapu után történhet.

## 8. Következő fejlesztési blokkok

A jelen átadó szerinti sorrend változatlan:

- F3 – Saját DIMPRO Drive UI aktiválása teljes browser/mobile acceptance után;
- F4 – Terepi összesítő / PDF riport;
- F5 – e-mail küldési UI;
- F6 – meglévő Drop e-mail/report engine újrahasználata;
- F7 – teljes mobil/PWA E2E;
- F8 – release.

A Projektkapu Drive továbbra is P9 és kikapcsolva marad.

**PROD változatlan.**
