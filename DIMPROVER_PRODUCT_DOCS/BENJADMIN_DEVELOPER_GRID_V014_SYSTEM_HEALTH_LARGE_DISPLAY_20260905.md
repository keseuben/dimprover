# BENJADMIN Developer Grid v0.1.14 – System Health + nagy kijelzős olvashatóság

**Dátum:** 2026-09-05
**Worker:** OutminAI
**Környezet:** DEV ONLY · PROD DENY
**Alap:** Developer Grid v0.1.13 control plane

## Cél

A v0.1.13 Windows fizikai ellenőrzése során láthatóvá vált két felhasználói probléma: a felső fejléc / worker-cellafejlécek / alsó státuszsáv tipográfiája nagy kijelzőn túl kicsi volt, valamint a jobb alsó B logóhoz tartozó System Health gyorsnézetet a dockolt Central Core részben kitakarhatta. A v0.1.14 ezeket javítja, és a System Health felületet tényleges infrastruktúra-kártyává emeli.

## Megvalósítás

- Alkalmazásfejléc: 44 px nagy kijelzős geometria, nagyobb márka-, státusz- és vezérlőtipográfia.
- Worker cellafejlécek: 108 px, nagyobb worker név, szerepkör, állapot, kontextus és 6 lépéses fázissáv.
- Alsó státuszsáv: 42 px, nagyobb BUILD01 / BUILD02 / DEV VPS / PROD / DB / TÁRHELY feliratok és állapotok.
- B logó hover: teljes szélességű, 86 px magas `SYSTEM HEALTH · GYORSNÉZET` közvetlenül a lábléc fölött.
- B logó kattintás: fix, teljes szélességű System Health kártya DEV VPS, BUILD01, BUILD02, PROD, DB, tárhely és Kapcsolat/AI blokkokkal.
- System Health overall állapot + kézi frissítés + utolsó frissítési idő.
- Central Core és a System Health réteg geometriai ütközésének megszüntetése: Health megnyitásakor a dockolt control plane a Health réteg fölé húzódik.
- Natív ChatGPT `WebContentsView` bounds ugyanazt az alsó területet tartja szabadon, ezért a natív chatfelület sem fedheti le a Health kártyát.
- Read-only hitelesítés fallback: érvénytelen device credential után a már konfigurált reporter credential kipróbálható 401/403 esetén. Írási fallback nincs.
- Ha nincs érvényes olvasási credential, a felület `PÁROSÍTÁS SZÜKSÉGES` állapotot jelez a néma `—` helyett.

## Verziózás

A korábbi publikus v0.1.13 artifact immutable. A System Health / nagy kijelzős módosítás ezért új Windows candidate-ként **v0.1.14** verziót kap; a v0.1.13 publikus artifact nem kerül felülírásra.

## Kapuk

- DEV ONLY · PROD DENY.
- Source HEAD / branch / worktree fail-closed.
- Windows csomagolás csak current-HEAD BUILD_ID + `.dimpro-release.json` proof után.
- Publikus artifact név verziózott és immutable.
