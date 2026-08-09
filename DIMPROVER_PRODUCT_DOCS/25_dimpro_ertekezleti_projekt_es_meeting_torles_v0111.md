# DIMPRO Értekezleti Kísérő – projekt- és értekezlettörlés v0.1.11

Dátum: 2026-07-23

## Felhasználói funkciók

### Projekt törlése

Az `/ertekezleti-kisero` projektkártyáin külön piros kuka gomb található.

A törlés előtt a felhasználónak pontosan be kell írnia a projekt nevét. A megerősítő ablak előre jelzi a kapcsolódó értekezletek számát.

A projekt törlése eltávolítja:

- az Értekezleti Kísérő projektadatlapját;
- a projekthez kapcsolódó összes értekezleti munkateret;
- az értekezletek feltöltött mellékleteit;
- a snapshotokat;
- az editor-, Teams- és prezentációs párosítási rekordokat.

A DIMPRO Drive eredeti projektmappája és fájljai nem törlődnek. A törölt Drive-projekt az Értekezleti Kísérő projektlistájából rejtve marad. Azonos projektazonosítóval történő új projektmentés visszaállítja a projektet az Értekezleti Kísérőben.

### Korábbi értekezlet törlése

Törlőgomb található:

- a kezdőoldali `Korábbi értekezletek` listában;
- a teljes `/ertekezletek` archívumban.

A törlés előtt pontosan be kell írni az értekezlet címét.

A törlés eltávolítja:

- a munkatér JSON-adatát;
- a feltöltéseket;
- a snapshotokat;
- az ideiglenes szerkesztői, Teams- és közösnézet-vezérlési kódokat.

A `meeting-assistant-home` és `demo-meeting` rendszer-munkaterek nem törölhetők.

## Biztonság és audit

- Csak szervezői jogosultsággal törölhető projekt vagy értekezlet.
- Hibás megerősítő név/cím esetén a szerver elutasítja a törlést.
- A törölt értekezletek alapadatai bekerülnek a `deletion-audit.jsonl` naplóba.
- A törlés végleges, ezért külön piros megerősítő ablak és pontos névbeírás szükséges.

## Ellenőrzések

- projekt- és értekezlettörlési integráció: 12/12 sikeres;
- kezdőoldali meeting bootstrap regresszió: 6/6 sikeres;
- együttműködési regresszió: 22/22 sikeres;
- élő követés és dokumentum regresszió: 34/34 sikeres;
- TypeScript: sikeres;
- teljes ESLint: 0 hiba, 112 korábbi figyelmeztetés;
- production build: sikeres;
- PM2: online, unstable restart: 0;
- az éles újraindítás óta nincs új error-log bejegyzés.

## Backup

`backups/meeting-delete-20260723_124613`

## v0.1.12 – Nyomva tartásos törlésmegerősítés

A korábbi pontos név- vagy címbeírásos felhasználói megerősítés helyett a törlési ablak 3 másodperces nyomva tartásos műveletet használ.

Működés:

- a kuka ikon továbbra is először figyelmeztető ablakot nyit;
- az ablak megmutatja a projekt vagy értekezlet nevét és a törlődő adatok körét;
- a piros törlőgombot 3 másodpercig folyamatosan nyomva kell tartani;
- a gombon sötétpiros folyamatjelző fut végig;
- a felirat tizedmásodperces visszaszámlálást mutat;
- idő előtti egérfelengedés, kurzorelhúzás, érintésmegszakítás vagy billentyűfelengedés megszakítja a törlést;
- egér, érintőképernyő, Enter és Space billentyű támogatott;
- mobilon a nyomva tartás nem indítja el az oldal görgetését;
- a szerver továbbra is ellenőrzi a háttérben a törlendő projekt vagy értekezlet pontos nevét.

A törlés elindulása után a gomb `Törlés folyamatban...` állapotot és forgó folyamatjelzőt mutat.

Célzott komponensellenőrzés: 9/9 sikeres.
