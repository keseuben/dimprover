# DIMPRO BENJADMIN – Operator UI 2.0 – 2026-08-10

## Mérföldkő

B3 M3 utáni Operator UI 2.0 felület-átalakítás, az M4 licenc/AI entitlement kör előtt.

## B3 specifikációval való egyezés

Az Operator UI 2.0 megtartja a B3 alapelveit:

- bal szélen állandó, keskeny sötét ikonsáv;
- mellette egyetlen Explorer-board, amely rejtett, lebegő vagy rögzített lehet;
- lebegő módban nem szűkíti a munkateret;
- rögzített módban a rail mellé dokkol és szabályosan eltolja a workspace-t;
- központi munkatér egyképernyős, kompakt és táblázatos;
- hosszú vertikális admin scroll helyett tab és lapozás;
- világos enterprise office és sötét blueprint/control-room téma;
- desktop elsődleges, tablet támogatott, mobil korlátozott operátori nézet.

## Explorer-board

Három nézet készült:

1. Fa – üzleti/komponens alapú DIMPRO struktúra.
2. Modulok – gyors modulnavigáció.
3. Fájlok – fájlkezelő jellegű munkatérnézet.

A fájlnézet jelenleg biztonságos munkatér-/modulstruktúrát jelenít meg; nem ad nyers VPS fájlrendszer-hozzáférést. A későbbi repo/worktree fájlböngésző ugyanebbe a panelbe köthető.

## Központi táblázatos Operator munkatér

Fő nézetek:

- Áttekintés
- Taskok
- Csapat
- Worker-ek
- Környezetek
- Release
- Audit

A táblázatok 8 rekordos lapokra törnek. A 15 rekordos task queue 2 oldalra oszlik. 1440×900 felbontáson a teljes fő Operator nézet egy viewportban marad.

## BENJADMIN csapat

A Csapat nézet a B3 végleges szerepeit mutatja:

- BenjAdmin – Emberi Főirányító / Rendszertulajdonos
- BenAI – Fejlesztésirányító AI
- ÁrminAI – belső Kódmérnök
- JázminAI – belső Kódmérnök
- OutminAI – Külső Kódmérnök, partner/külső projektekre, belső DIMPRO write alapból korlátozott

A felület külön jelzi a 3 aktív kódolói slotot és az élő session/handshake/task kapcsolatot.

## Reszponzív szabályok

- 1440×900: nincs oldalszintű vertikális görgetés.
- 768×1024: a bal rail alsó navigációs sáffá alakul; nincs vízszintes page overflow.
- 390×844: a grid min-width korlátozások miatt a munkatér nem szélesítheti túl a viewportot; a széles táblázatok csak saját belső scrollterületükön mozoghatnak.
- rögzített Explorer mobil/tablet méreten automatikusan lebegő panelként viselkedik.

## Acceptance

Operator UI browser acceptance: 26/26 PASS.

Kiemelt ellenőrzések:

- desktop egyképernyős nézet PASS;
- Explorer lebegő mód PASS;
- lebegő Explorer nem méretezi át a workspace-t PASS;
- Fa / Modulok / Fájlok nézet PASS;
- Explorer pin és persistence PASS;
- Explorer elrejtés PASS;
- light/dark mód PASS;
- B3 öt tag megjelenítése PASS;
- 3 kódolói slot megjelenítése PASS;
- OutminAI külső szerep PASS;
- task lapozás PASS;
- DEV/STAGING/PRODUCTION nézet PASS;
- tablet overflow PASS;
- telefon overflow PASS.

## Statikus kapuk

- TypeScript: PASS
- ESLint: 0 error, 108 örökölt warning; új Operator UI warning nincs
- production build: PASS · build ID `BVBxp0VY2rsX_15ngh792`

## Következő fejlesztési pont

1. záró build és candidate smoke;
2. DEV aktiválás rollback-védelemmel;
3. Operator UI további adatdrill-down;
4. B3 M4 – License + AI keret + audit/refaktor integráció az új Operator UI-ba.
