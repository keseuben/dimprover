# 272 — BENJADMIN Fejlesztési Térkép V2 · éjszakai DEV checkpoint

**Dátum:** 2026-08-18
**Állapot:** forrás-checkpoint · DEV-only · runtime cutover még nem történt

## Elkészült

- A Fejlesztési Térkép forráslistája három világos rétegre vált: **Aktív**, **Technikai**, **Archív**.
- Az átsorolások előző térképi besorolása korlátozott metadata-historyban megmarad.
- Beépült az auditált **Előző besorolás** visszaállítás.
- Undo esetén az érvénytelen korábbi célpont fail-closed: automatikus találgatás nincs.
- Az auditban külön `TASK_DEVELOPMENT_MAP_UNDONE` esemény készül.
- Git branch, worktree és fájlútvonal továbbra sem mozog automatikusan (`physicalGitMove: false`).
- `productionAccess: DENY` továbbra is explicit.

## Taxonómia-korlát

A V2 **nem véglegesíti** a taxonómiát. A jelenlegi V1 struktúra marad, és a felületen külön jelzés mutatja: **„TAXONÓMIA: V1 · EXCEL JÓVÁHAGYÁSRA VÁR”**. Jóváhagyott Excel nélkül új végleges csoport-/projekt-/modulbesorolás nem készült.

## Ellenőrzések

- `git diff --check`: PASS
- Development Map V1 contract: **25/25 PASS**
- Development Map V2 contract: **13/13 PASS**
- `npx tsc --noEmit`: PASS
- célzott ESLint: **PASS · 0 error / 0 warning**.

## Következő lépés

A következő futásban: célzott lint újrafuttatás → source checkpoint commit → runtime/browser acceptance a V2 rétegekre és undo-ra. Teljes build/cutover csak ezután, közös lock birtokában.

**PROD változatlan, nem történt PROD alkalmazásmódosítás.**
