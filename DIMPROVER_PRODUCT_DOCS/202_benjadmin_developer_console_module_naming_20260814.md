# 202 — BENJADMIN Fejlesztői Konzol · normatív modulnév-struktúra

Dátum: 2026-08-14
Állapot: NORMATÍV NÉV- ÉS NAVIGÁCIÓS SZABÁLY

## Fő felhasználói név

A fejlesztői munkatér felhasználói neve:

**BENJADMIN Fejlesztői Konzol**

A `V1`, `V2`, `V3` és hasonló verziójelölések belső fejlesztési/verziózási jelölések. A végfelhasználói főnévben alapértelmezetten ne jelenjen meg a `V1` utótag.

A felületet nem nevezzük `Codex`-nek. A BENJADMIN Fejlesztői Konzol funkcionálisan túlmutat egy AI-kódoló felületen: koordinációs, terminál-, workspace-, audit-, Git- és fejlesztésvezérlési tér.

## Normatív fő részek

A **BENJADMIN Fejlesztői Konzol** alatt a következő önálló, de közös kontextust használó részek épülnek ki:

1. **AI Fejlesztői Tér**
   - Ben-AI, Ármin-AI, Jázmin-AI, Outmin-AI, M.Forge-AI, V.Guard-AI és későbbi worker szerepkörök munkatere;
   - közös fejlesztési beszélgetés, task, worker státusz és koordináció.

2. **Terminal Hub**
   - szabályozott DEV terminál és későbbi kontrollált környezetek;
   - session, stream, resize, reconnect és managed operations;
   - RAW / SANITIZED / AUDIT elválasztás.

3. **Live Workspace**
   - allowlistelt projekt/worktree fájlfa;
   - worker activity;
   - aktuális fájl és módosítás követése;
   - később 1/2/4 paneles munkatér.

4. **Terminál Parancstár**
   - shell/Git/PowerShell parancsok deduplikált, maszkolt tudástára;
   - nem azonos a ChatGPT Parancstárral.

5. **Fejlesztési Tár**
   - fejlesztési PDF-ek, képek, ZIP-ek, kód- és egyéb segédanyagok;
   - SHA-256, modul, verzió, kötelező olvasási jelölés.

6. **ChatGPT Parancstár**
   - promptok, DEV START/FOLYTASD/átadó és más AI-munkamenet sablonok;
   - nem shell-parancstár.

7. **Git / Diff / History**
   - Git állapot, diff és változástörténet;
   - Live Workspace-szel közös fájl- és worker kontextus;
   - ugyanaz a syntax highlighting motor használható Live/Diff/History nézetben.

## Navigációs elv

A hét rész ne hét különálló termék legyen. Egyetlen BENJADMIN Fejlesztői Konzolon belüli, egymással kontextust megosztó munkaterületek legyenek.

A kiválasztott projekt, worker, task, branch/worktree és fejlesztési session lehetőség szerint maradjon meg modulváltáskor.

## Kötelező névütközés-elkerülés

- `ChatGPT Parancstár` = prompt- és munkamenet-sablon tár.
- `Terminál Parancstár` = shell/Git/PowerShell parancstudástár.

A két elnevezést UI-ban, dokumentációban, API-ban és fejlesztői átadóban következetesen külön kell kezelni.

## Fejlesztési következmény

A jelenlegi Terminal Hub / Live Workspace fejlesztés a fenti közös Fejlesztői Konzol struktúra része. Későbbi UI-refaktor során a Konzol fő navigációja ezt a hét fő részt tükrözze, jogosultság és feature flag alapján.
