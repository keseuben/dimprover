# DIMPRO Drive V0.9.32 – Súgó keresés és billentyűzetes akadálymentesség

Dátum: 2026-10-09
Környezet: DEV ONLY
PROD: DENY

## Cél

A V0.9.31 Súgó utóellenőrzése két UX-hiányosságot azonosított. A kereső témaköri találat mellett is jelezhetett nulla vezérlőtalálatot úgy, hogy a fő panel ezt teljes találathiánynak mutatta. A modal továbbá kezelte az Esc bezárást és a kezdeti fókuszt, de nem tartotta a Tab fókuszt a dialóguson belül és bezáráskor nem állította vissza a fókuszt a megnyitó vezérlőre.

## V0.9.32 módosítások

- A keresési fejléc külön számolja a talált súgótémákat és vezérlőket.
- A talált Súgó-fejezetek külön kattintható kártyákon jelennek meg.
- Témakör-találat mellett, vezérlőtalálat hiányában nincs többé téves Nincs találat állapot.
- A témakártyák reszponzív és dark-theme stílust kaptak.
- A dialógus aria-labelledby és aria-describedby kapcsolatot kapott.
- A keresőmező explicit aria-label értéket kapott.
- Megnyitáskor a keresőmező kap fókuszt.
- Tab és Shift+Tab esetén a fókusz a modalon belül marad.
- Esc továbbra is bezárja a Súgót.
- Bezáráskor a fókusz visszatér a Súgót megnyitó elemre.
- A bezárási callback stabil refen keresztül fut.

## Verzió és Súgó-regiszter

Drive fejlesztési verzió: 0.9.32.
A V0.9.31 Súgó tartalmi regisztere változatlan: 183 kezelőelem, 14 témakör, 5 projekt-szerepkör.

## Tesztelés

- scripts/drive-v0932-help-search-accessibility-contract.mjs: 9/9 PASS
- V0.9.31 Help + UX audit: 28/28 PASS
- V0.9.30 review workline: 8/8 PASS
- V0.9.29 visual density: 13/13 PASS
- V0.9.28 workspace UX + personal favorites: 31/31 PASS
- célzott ESLint: 0 error
- TypeScript npx tsc --noEmit: PASS
- git diff --check: PASS

A korábbi regression contractok verziókapuja monoton 0.9.x kompatibilitási ellenőrzésre módosult, hogy újabb Drive verzión is futhassanak. A funkcionális assertionök nem lazultak.

## Biztonság

Nincs adatbázis-migráció, AUTH- vagy jogosultsági módosítás, fájl-/release-törlés. PROD DENY. Aktiválás csak validált DEV build/candidate után.
