# BENJADMIN Developer Grid v0.1.16 – System Health párosítási helyreállítás

**Dátum:** 2026-09-05
**Worker:** OutminAI
**Környezet:** DEV ONLY · PROD DENY
**Alap:** v0.1.15 fizikai Windows E2E képernyőképek

## Fizikai E2E megállapítás

A v0.1.15 Windows felület vizuális javításai a képernyőképek alapján megfelelően működnek: a két soros alkalmazásfejléc tiszta, a System Health gyorsnézet olvasható, a részletes System Health fejléc elkülönül a body felülettől, és a Health réteg nem kerül a Central Core mögé.

A fennmaradó blokk nem BUILD-node vagy System Health UI hiba, hanem hitelesítési állapot: a Windows alkalmazásnak nincs aktív Developer Grid device tokenje, ezért a lábléc és a Health panelek `PÁROSÍTÁS` állapotot mutatnak. A szerveroldali System Health read plane szándékosan fail-closed; jogosultság nélkül nem ad infrastruktúra-adatot.

## v0.1.16 változás

- Jogosultsághiány esetén a részletes System Health panel nem üres `NINCS ADAT` kártyát mutat, hanem közvetlen párosítási helyreállító felületet.
- Közvetlenül a System Health panelből megnyitható a BENJADMIN párosítási oldal.
- Az egyszer használatos `pairing-id#code` közvetlenül a Health panelbe illeszthető, nem szükséges előbb a globális Beállítások felületet megnyitni.
- A desktop továbbra sem tartalmaz admin-, reporter- vagy beégetett device tokent.
- Az explicit webes BENJADMIN jóváhagyás kötelező marad. Ez biztonsági kapu, nem kerülhető meg automatikus jóváhagyással.
- A kiadott device token kizárólag a Windows `safeStorage` titkosított tárolójába kerül.
- Sikeres aktiválás után a live delta kapcsolat újraindul és a System Health azonnal újra lekérődik; nincs szükség alkalmazás-újraindításra.

## DEV runtime megállapítás

A fizikai E2E során az `admin.dev.dimpro.hu/api/dev/grid/*` Nginx útvonal még a régi v0.1.11 immutable runtime-ra (`127.0.0.1:3295`) mutatott. A v0.1.16 kiadás része ezért az exact current-HEAD Developer Grid API runtime külön candidate smoke-ja és csak sikeres ellenőrzés után a DEV `/api/dev/grid/` upstream átvezetése. PROD változatlanul DENY.

## Kötelező ellenőrzések

- Desktop/System Health/workspace/chat contract PASS.
- TypeScript és lint: 0 error.
- Valódi BUILD01 FULL BUILD az MCP Build Transport Gatewayen.
- Exact HEAD + BUILD_ID release provenance.
- Candidate Developer Grid API runtime smoke külön porton.
- A candidate smoke runnerhiány esetén `BUILD_QUEUE` fail-closed állapotot vár; DEV-host FULL BUILD fallback továbbra is tiltott.
- DEV Nginx `/api/dev/grid/` átvezetés csak valid candidate-re, config backup + `nginx -t` mellett.
- Authorized System Health read smoke szerveroldali credentialdel úgy, hogy titok nem kerül logba vagy kimenetre.
- Windows EXE/DEV ZIP/manifest immutable DEV release és teljes publikus SHA-256 visszaellenőrzés.
- A fizikai Windows E2E végén a felhasználói explicit párosítás az egyetlen kötelező emberi biztonsági lépés.
