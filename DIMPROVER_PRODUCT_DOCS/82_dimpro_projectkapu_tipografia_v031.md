# DIMPRO Projektkapu 0.3.1 – olvashatósági tipográfia

Dátum: 2026-08-02

## Cél

A Projektkapu teljes felületén megszüntetni a túl kicsi, 7–11 px-es feliratokat. A minimum betűméret igazodjon a `dimpro.hu` nyilvános bemutatóoldal ténylegesen megjelenő legkisebb betűméretéhez.

## Referencia

A `https://dimpro.hu` élő oldalon végzett számított CSS-audit eredménye:

- legkisebb látható betűméret: **12 px**;
- általános szöveg jellemző mérete: **14–18 px**.

## Megvalósított szabályok

- A Projektkapu CSS-moduljaiban az abszolút minimum: **12 px**.
- Az általános leíró és magyarázó szöveg jellemzően: **14 px**.
- A fontos lista- és kártyacímek: **13 px vagy nagyobb**.
- Az űrlapmezők és keresők: **13 px**.
- A mobil alsó modulnavigáció feliratai is minimum **12 px**.
- A nagyobb betűméret világos és sötét módban is azonos tipográfiai skálát használ.

## Érintett fájlok

- `components/project-gate/ProjectGateShell.module.css`
- `components/project-gate/DriveWorkspace.module.css`
- `components/project-gate/ProjectListClient.module.css`

A közös `ProjectGateShell` miatt a szabály automatikusan érvényes a következő modulokban:

- DOCK – ProjektTér
- DRIVE – Dokumentumtár
- DROP – Fájlkapu
- DIALOG – Egyeztetések
- DECIDE – Jóváhagyások
- DIARY – Projektnapló

## Ellenőrzések

- statikus CSS minimum-audit: PASS;
- célzott ESLint: PASS;
- TypeScript `npx tsc --noEmit`: PASS;
- Next.js production build: PASS;
- számított böngészős audit: **21/21 PASS**;
- auditált útvonalak: projektlista + 6 modul;
- auditált nézetek: desktop, tablet, mobil;
- legkisebb megfigyelt betűméret: **12 px**;
- oldal-szintű vízszintes túlcsordulás: nincs;
- candidate build: `MtxrFuo2ZJgmg0S7we12s`.

## Rollback

```text
.next_before_projectgate_typography_v031_20260802_115210
```

## Éles kiadás

- éles audit: 21/21 PASS;
- éles minimum betűméret: 12 px;
- éles build: `MtxrFuo2ZJgmg0S7we12s`;
- PM2: online;
- Nginx: PASS;
- ideiglenes tesztfelhasználó-maradvány: 0;
- Drop forrásváltozás: 0.
