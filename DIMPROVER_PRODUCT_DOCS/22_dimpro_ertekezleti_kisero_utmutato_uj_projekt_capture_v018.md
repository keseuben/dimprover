# DIMPRO Értekezleti Kísérő – útmutató, új projekt/értekezlet és képernyőrögzítő v0.1.8

Dátum: 2026-07-23

## Információs és útmutató munkatér

A felső ikonsor végére új Információ gomb került. A korábbi, panel alján megjelenő e-mailes tájékoztató megszűnt.

A nagy, jól olvasható útmutató három fület tartalmaz:

1. Felhasználói útmutató
2. Szerkesztői útmutató
3. Kapcsolat és információ

A használati útmutató nem összefüggő hosszú szöveg, hanem gombonként és funkciónként lenyitható kártyákból áll. Minden kártya tartalmazza:

- a funkció célját;
- ki használhatja;
- mikor érdemes használni;
- mi történik a művelet után;
- számozott használati lépéseket.

A Felhasználói útmutató fő témái:

- kép vagy fájl feltöltése;
- megosztott kép megnyitása;
- kép alatti közös szöveg szerkesztése;
- szöveges javaslat küldése;
- visszajelzés és tudomásulvétel;
- DIMPRO felület megosztása a Teams nagy munkaterületére.

A Szerkesztői útmutató fő témái:

- résztvevői feltöltés jóváhagyása;
- mellékletszerkesztő;
- képernyő vagy alkalmazásablak rögzítése;
- napirend és jegyzőkönyvi tartalom;
- szerkesztési jogosultság átadása;
- AI dokumentumtervezet;
- lezárás és archiválás.

## Kapcsolati e-mail gombok

A Kapcsolat fülön két nagy e-mail gomb található.

### info@dimpro.hu

Használati kérdés, funkciójavaslat és általános tájékoztatás.

Automatikus tárgy:

`DIMPRO Értekezleti Kísérő – használati kérdés vagy funkciójavaslat – <meetingId>`

### admin@dimpro.hu

Belépési, jogosultsági, párosítási vagy technikai probléma.

Automatikus tárgy:

`DIMPRO Értekezleti Kísérő – technikai hiba, jogosultság vagy párosítás – <meetingId>`

## Kompakt alsó vezérlősáv

A panel alján egyetlen, minimális magasságú, fix sor marad:

- bal oldalon egysoros állapotjelző;
- középen négyzetes szövegküldő gomb;
- jobb oldalon négyzetes Teams-megosztás gomb.

A szövegküldő gomb kattintásra popover kártyát nyit. A popover tartalmazza:

- többsoros szövegmezőt;
- jóváhagyásra váró résztvevői szövegeket a szervező/szerkesztő számára;
- a legutóbbi megosztott szövegeket;
- szervezőnél „Megjelenítés az értekezletben” gombot;
- résztvevőnél „Küldés a szervezőnek vagy szerkesztőnek” gombot.

## Képernyőrögzítő nagy ablak

A képernyő vagy alkalmazásablak rögzítése nem közvetlenül a keskeny panelben indul.

A Teams-panel gombja új, nagy URL-dialogot nyit:

`/teams/meeting-assistant/capture`

A munkafolyamat:

1. nagy rögzítőablak megnyitása;
2. külön felhasználói kattintás a képernyőválasztóhoz;
3. képernyő, alkalmazásablak vagy böngészőlap kiválasztása;
4. egyetlen állókép készítése;
5. a képernyőmegosztás azonnali leállítása;
6. Képmetsző, jelölők és képre írt szöveg használata;
7. mentés ugyanabba az értekezleti munkatérbe.

A capture útvonal szerveroldalon csak szervezői tokent fogad el. Résztvevői tokennel zárolt tájékoztató jelenik meg.

Ha a Teams beágyazott dialog nem ad képernyőmegosztási engedélyt, a rögzítő ugyanazzal a tokennel külső Edge/Chrome ablakban nyitható meg.

## Új projekt létrehozása

A `/ertekezleti-kisero` kezdőoldalon több helyen is látható az Új projekt gomb:

- a fő fejlécben;
- a projektlista fejlécében.

Az űrlap mezői:

- projektkód;
- projekt neve;
- helyszín;
- megrendelő;
- projektvezető;
- kezdési dátum;
- tervezett befejezés.

A projekt a Meeting Project Profile adatmodellbe kerül, és azonnal megjelenik az Értekezleti Kísérő projektlistájában.

## Új értekezlet létrehozása projekten belül

Az Új értekezlet gomb megjelenik:

- a kiválasztott projektlista fejlécében;
- minden projektkártyán.

Az űrlap mezői:

- értekezlet címe;
- értekezlet típusa;
- dokumentumforma;
- tervezett időpont;
- helyszín vagy Teams-kapcsolat;
- értekezletvezető;
- jegyzőkönyvvezető;
- kezdő napirendi sablon.

Támogatott dokumentumformák:

- Egyeztetési emlékeztető;
- Értekezleti jegyzőkönyv;
- Értekezleti feljegyzés.

A létrehozás után a rendszer megnyitja az új értekezleti munkateret.

## Biztonság

- a capture útvonal csak szervezői tokennel használható;
- a projektadatlap létrehozása szervezői/session jogosultságot igényel;
- az értekezlet létrehozása szervezői/session jogosultságot igényel;
- a résztvevői szöveg továbbra is jóváhagyásra vár;
- a kapcsolati mailto tárgy csak a rövid meetingazonosítót tartalmazza, privát tartalmat nem.

## Rollback

`backups/meeting-home-info-capture-20260723_070605`

## Megosztott Teams-stage állapotjelzés

A Teams közös nagy felületén megosztott DIMPRO tartalom egyértelmű vizuális állapotot kap:

- 5 pixeles piros keret a teljes megosztott munkatér körül;
- felső középső piros címke fehér szöveggel: `Megosztott DIMPRO tartalom`;
- jobb felső sarokban nagy, piros, négyzetes X gomb;
- a gomb felirata és akadálymentes címkéje: `Megosztás leállítása`;
- leállítás közben forgó folyamatjelző;
- sikeres vagy sikertelen leállításról rövid állapotüzenet.

A piros X a Microsoft Teams SDK `meeting.stopSharingAppContentToStage` műveletét hívja meg. A megosztás megszüntetése után a piros keret és címke eltűnik, a Teams pedig bezárja a közös stage-megosztást.

## Végső ellenőrzési eredmények

- új projekt / új értekezlet / útmutató / capture / stage böngészős teszt: 27/27;
- együttműködési integráció: 22/22;
- mellékletszerkesztő regresszió: 11/11;
- szerkesztői jogosultság regresszió: 17/17;
- lezárás és archiválás regresszió: 16/16;
- TypeScript: sikeres;
- teljes lint: 0 hiba;
- production build: sikeres;
- Teams panel: 200 OK;
- Teams stage: 200 OK;
- capture munkatér: 200 OK;
- PM2: online, 0 unstable restart.

A `stopSharingAppContentToStage` sikeres tényleges leállítása csak valódi Teams meeting-stage környezetben próbálható ki; a gomb, az SDK-hívás, a jogosultsági útvonal és a vizuális állapot automatizált tesztje sikeres.
