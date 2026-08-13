# 194 — BENJADMIN csapatképernyő V1.2.1

Dátum: 2026-08-13. Környezet: DEV.

## Vizuális szabályok
- A csapattabló teljes szervezeti fája egyetlen kompakt tablóblokkban marad; nem fedheti a költség- vagy időráfordítás panelt.
- A részletes munkakörök avatárra kattintva a közös profilkártyán érhetők el; a tabló áttekintő marad.
- Desktop/laptop nézetben a három belső/partner kódmérnök egy sorban, a két külső AI worker egy sorban jelenik meg.
- A költség- és időráfordítás kártyák világos admin alaptéma mellett is sötét navy BENJADMIN hátteret használnak.
- A közös profilkártya desktop avatárja 500 px széles; mobilon reszponzív méret marad.
- Az AI KOORDINÁCIÓ kategória-pill világos profilkártyán erősebb teal kontrasztot kap.

## Ellenőrzés
- Browser acceptance: 14/14 PASS desktop 1440×900 és laptop 1366×768.
- Tabló containment, panel-átfedés, 7 profil, vízszintes overflow, navy háttér, profilavatár és kategória-kontraszt ellenőrizve.
- Build: yzDF_5LJ8kbyWqpU6FtB9.
- PROD nem módosult.
