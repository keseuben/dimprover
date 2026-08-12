# BENJADMIN e-mail központ – hibrid táblázat-első profil- és tesztnapló

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

Az E-mail beállítások oldal átalakítása olyan hibrid BENJADMIN munkatérré, ahol a feladóprofilok és a tesztnapló táblázat-első módon kezelhető, miközben a közös SMTP konfiguráció és a profil szerkesztési műveletek külön jobb oldali panelekben megmaradnak.

## Főfelület

Az `/admin/email` a közös `BenjadminDataWorkspace` komponenst használja.

Két fő nézet:

1. Feladóprofilok;
2. Teszt napló.

Közös funkciók:

- keresés;
- nézetfüggő szűrők;
- 25 / 50 / 100 soros lapozás;
- ragadós táblafejléc;
- világos/sötét mód;
- tablet és mobil no-page-overflow.

## Feladóprofil tábla

Oszlopok:

- Profil;
- E-mail cím;
- Feladat / cél;
- Engedélyezve;
- SMTP;
- Jelszóállapot;
- Utolsó teszt;
- Teszt eredmény;
- Művelet.

Profil szűrők:

- mind;
- aktív;
- kikapcsolt;
- SMTP kész;
- hiányos.

KPI-k:

- feladóprofilok száma;
- engedélyezett profilok;
- SMTP-kész profilok;
- sikeres tesztek;
- sikertelen tesztek.

## Drop profil javítás

A kliensoldali profilazonosító-típus és a profilsorrend most már külön támogatja a `drop` profilt is.

Az élő DEV API jelenleg 8 profilt ad vissza, köztük:

- system;
- notifications;
- drive;
- drop;
- noreply;
- billing;
- admin;
- info.

Így a DIMPRO Drop értesítési profil nem kerül többé ismeretlen/rossz sorrendű kliensoldali állapotba.

## SMTP beállítási panel

Külön jobb oldali panelben megmaradt:

- SMTP host;
- SMTP port;
- SSL/TLS;
- közös SMTP jelszó;
- teszt címzettek;
- licencaktiválási rendszerüzenet címzettjei;
- licenclevelek válaszcíme;
- konfigurációs állapot;
- mentés.

A jelszó továbbra is `password` típusú maszkolt mező, és a mentett jelszó nem jelenik meg vissza a felületen.

## Profil részletező

A profil jobb oldali panelben szerkeszthető:

- e-mail cím;
- megjelenő név;
- automatikus küldés engedélyezése;
- SMTP állapot;
- jelszóállapot;
- utolsó teszt eredménye.

A profil mentése és tesztküldése külön gomb. Tesztküldés csak SMTP-kész profilnál engedélyezett.

## Tesztnapló

Oszlopok:

- Időpont;
- Profil;
- Feladó;
- Eredmény;
- Címzett;
- SMTP;
- Kísérlet;
- Részlet.

Szűrők:

- mind;
- sikeres;
- sikertelen.

## Élő DEV állapot

A fejlesztéskor:

- profilok: 8;
- engedélyezett: 7;
- SMTP-kész: 0;
- mentett közös SMTP konfigurációs fájl: még nincs;
- tesztnapló: 0 rekord.

Ezért a valós DEV felületen a tesztküldési gombok helyesen letiltottak.

## Acceptance

`scripts/benjadmin-email-hybrid-table-first-acceptance.mjs`

Eredmény: 24/24 PASS.

Az acceptance nem mentett SMTP konfigurációt és nem küldött teszt e-mailt. A profil-, Drop-, sikeres/sikertelen teszt- és részletező logikát böngészős read-only fixture-rel ellenőrizte.

Regressziók:

- Drive admin: 20/20 PASS;
- Admin belépési napló: 21/21 PASS;
- Release feltöltő: 20/20 PASS;
- Vezérlés / Partner V3: 21/21 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

## Következő fejlesztési pont

A következő admin UI auditban csak azokat a felületeket kell táblázat-első mintára átvezetni, ahol a rekordlista a fő munkafolyamat. A tisztán konfigurációs vagy műveleti oldalak maradjanak célzott paneles felületek.
