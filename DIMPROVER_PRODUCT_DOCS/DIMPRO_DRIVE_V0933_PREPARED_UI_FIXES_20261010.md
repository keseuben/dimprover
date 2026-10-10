# DIMPRO Drive V0.9.33 – előkészített UI-javítások

Állapot: **SOURCE PREPARED, NOT DEPLOYED**. A DEV-en a V0.9.32 marad aktív. PROD DENY.

## Elkészült forrásmódosítások
1. A `Tervellenőrzés` nézet a korábbi egy-paneles helyett az alsó, méretezhető részletezőt megjelenítő `split` elrendezést állítja be. A normál dokumentumtábla teljes szélességű marad.
2. A jobb oldali fájlmegjelenítő (`DrivePreviewDrawer`) bal szélén húzható, középen megjelölt függőleges fogantyú van. Balra húzva a teljes ablak szélességéig bővíthető, dupla kattintással visszaáll az alapméret. Billentyűzettel a nyilak, Home és End használhatók; mobilon a fogantyú rejtett.

## Ellenőrzés
- `npx tsc --noEmit --pretty false`: PASS
- `npx eslint components/drive/DriveWorkspace.tsx components/drive/DrivePreviewDrawer.tsx`: PASS
- `git diff --check`: PASS
- Böngészős interaktív QA, BUILD01 build, új PM2 runtime és élesítés: **NEM történt meg**.

## Telepítés előtti kötelező teendők
- DEV kapacitás és DotRoll lemezbővítés vizsgálata; jelenleg csupán kb. 3–4 GiB szabad.
- BUILD01 build, funkcionális regressziók, böngészős QA a Tervellenőrzés kiválasztásakor és az oldalsó fájlmegjelenítő fogantyújával.
- Külön DEV candidate és rollback, Nginx/PM2 kontrollált aktiválás.
- A központi Projektadatlap, kétsoros fejléc, role/permission bővítés, Legutóbbiak, Követett dokumentumok és e-mail értesítők későbbi külön scope-ok, itt még nem készültek el.
