# Grid 0.1.112 – meglévő munka helyreállítása

A READY recovery a feladat létrehozására szolgáló tiszta-worktree kaput használta. A 112 csak a hiteles, BOOT-validált execution-authority recoveryben választja a meglévő task saját munkakönyvtárának olvasási ellenőrzését; branch, HEAD, canonical repository és top-level path egyezés kötelező, a nem commitolt tartalom változatlan marad. Új task és pre-BOOT recovery továbbra is tiszta worktree-t követel. A source ellenőrzése a session nyitása előtt történik.

Ha egy korábbi recovery már nyitott engine sessiont, annak folytatása csak a szerver által rögzített previous-session lineage, ugyanaz a task/project/worker, pontos claim és egyetlen aktív session esetén engedélyezett. Lejárt köztes recovery sessionből a meglévő engine recovery nyit új sessiont. Más worker, claim vagy ismeretlen kapcsolat továbbra is tilt. A READY branch/worktree binding mindegyik handshake-szakaszban ellenőrzött.

Validáció: dirty-workspace-recovery-v01112-contract.mjs – valódi ideiglenes Git repositoryban bájtazonos dirty/BOM/CRLF tartalommegőrzés és írást tiltó Git-hívás guard; szimulált engine lineage és produkciós recovery-függvény tesztek. Az élő visszaállítás még külön ellenőrzendő.
