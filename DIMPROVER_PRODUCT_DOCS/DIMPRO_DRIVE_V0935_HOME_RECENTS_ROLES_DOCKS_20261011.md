# DIMPRO Drive V0.9.35 – Projektfejléc, Legutóbbiak, alsó panel, szerepkörök, súgó
Állapot: SOURCE PREPARED | NO DEV/PROD DEPLOY | NO DATABASE MIGRATION | NO EMAIL | PROD DENY
Dátum: 2026-10-11.

## Elkészült forrásfejlesztések
1. Kezdőlap és Legutóbbiak: Saját és Projekt Drive; a meglévő home/óraikon aktiválása, 10 legutolsó fájl és teljes időrendi táblázat; a fájlverzió tényleges feltöltési ideje, nem metaadatszerkesztés szerinti sorrend. Projektben a hozzáférés-szűrt meglévő Drive tree API a forrás. Csak a legutolsó dokumentumverziót mutatja; teljes korábbi verzió-eseménytörténet még nincs.
2. Összecsukható Fájlrészletek sáv: CsomagBOX fölött külön 36 px-es panel, kinyitva a régi méretező, bezárva a dokumentumtáblának nagyobb szabad hely; a két sáv független, állapot és adat megmarad. Projektben böngészős per-projekt állapotmegőrzés, Saját Drive-ban munkamenet állapot.
3. Kompakt projektfejléc: türkiz Projektkapu ikongomb ugyanazon Project Core projektazonosítóval a ProjektTér DOCK nézetre mutat; nem vesz el további helyet a bal navigációból. A cél Projektkapu külön jogosultsági korlátokat alkalmaz. Kifejezett Projektkapu-link aktiváltsági flag hiányzik, ezért az első verzió a közös Project Core projekten és project.read-on alapul, külön kapcsolati QA szükséges.
4. CsomagBOX archiválási UX: megerősítés, külön Archív állapotszűrő és pontos felirat, meglévő lifecycle RPC/REST. Az archív státusz a forrásfájlt nem törli. A DEV lifecycle DB RPC aktiváltsága NEM ellenőrzött; letiltott gomb esetén migráció/jogosultság szükséges.
5. Szakmai szerepkörök: 12 építőipari szakmai minőség, max 8 per tag, projekttagsági panelen szerkesztve. Auditált új PostgreSQL migráció és project.manage_members védett API. A szakmai minőségek KIZÁRÓLAG leíró címkék: az 5 technikai Project Core szerep és ACL továbbra is egyetlen jogosultsági forrás. A szakmai szerepkörhöz kötött automatikus értesítési célzás NINCS bekötve. Nem adnak plusz levelezési vagy fájlhozzáférést.
6. Súgó: új Kezdőlap/Legutóbbiak, Fájlrészletek polc, CsomagBOX archiválás, Projektkapu, értesítések/gyakoriság/XLSX/jogosultság/audit, szakmai szerepkörök témák és új kereshető ikongombok. A kiadási és adatbázis-aktiválási korlátok külön szerepelnek.
7. Forráskijelzés V0.9.35 candidate; a felhasználó V0.9.32-t lát a DEV felületen, míg a korábbi aktív Nginx HTTP candidate fejléc V0.9.33-at jelzett. Az új verziót NEM telepítettük, kijelzett és runtime verzióeltérés további ellenőrzést igényel.

## QA
- Mind a 14 korábbi értesítési contract tesztcsoport PASS.
- Legutóbbi időrend és metaadatvédelmi unit teszt: 5/5 PASS.
- Új szerepkörök DB PGlite (PostgreSQL WASM, izolált stub baseline): migráció, többes címke, audit, idempotencia, cross-project, revoked és invalid role kontroll PASS.
- TypeScript noEmit és célzott ESLint PASS. git diff --check PASS.
- Következő release kapu: BUILD01 Next.js fordítás és vizuális QA laptop 1366×768/1600×900; valós migráció DB-jóváhagyás; ACL/profil/auth és Projektkapu navigáció E2E. SMTP producer és küldés tiltva.
- DEV tárhely továbbra is nagyon kevés, DEV-re nem fordítunk, nem telepítünk. PROD DENY.

## BUILD01 – 2026-10-11, teljes fordítás

- BUILD01 ellenőrzés: **PASS**, nem történt DEV-telepítés.
- Run ID: drive-v0935-2d5efb080-20261011-build01-b1.
- Forrás Git commit: 2d5efb0807953db06ea1aa00fcfdac30846144e5.
- BUILD_ID: 3GA5bSLjEZBAJ1KkXYBHe.
- Artifact SHA-256: 1dcfd0bf77259727f13456f544cfa56bcd54182c336a5f3509fad030ad856c76.
- A BUILD01 standalone asset generálás és 103 statikus oldal, TypeScript, Next optimalizálás: PASS.
- A csomag a BUILD gateway független futási mappájában található, 92 MB körül.
- DEV aktuális HTTP candidate továbbra is c74326afd / V0.9.33; a felhasználói UI-képernyőképen V0.9.32 olvasható. Eltérő információ: verziócímke/router külön QA.
- DEV /dev/sda3: 118 GiB összes, 115 GiB foglalt, 2,3 GiB szabad (99%). Nincs automatikus telepítési jóváhagyás.
- Még szükséges: browser responsive QA, központi/auth és végső ACL QA, szakmai roles DB migráció review, Box lifecycle DB readiness, felhasználói elfogadás, külön email release gate.
