# DIMPRO Licencközpont V0.9.47 – DEV telepítési elővizsgálat

Dátum: 2026-10-11. Státusz: READ-ONLY DISCOVERY / DEPLOY BLOCKED.
PROD DENY, DEV RUNTIME UNCHANGED.

## Telepítési cél

Kizárólag https://license.dev.dimpro.hu/admin/licenckozpont, a meglévő BENJADMIN rendszer részeként, ugyanazon URL-en, új párhuzamos felhasználói admin nélkül. A felhasználó DEV-only, visszaállítható telepítést engedélyezett.

## Azonosított valós host és szolgáltatás

- Az MCP parancskapcsolat ubuntu / 213.160.68.24 hoston fut. Ez nem a DEV, és a license.dimpro.hu PROD hosztot szolgálja ki 3000-en. Ezt nem módosítottuk.
- Az autoritatív DEV: dev.dimpro.hu / 213.160.68.32; SSH alias dimpro-dev.
- A license.dev.dimpro.hu HTTPS a /etc/nginx/sites-enabled/dimpro-dev.conf közös virtuális host blokkban van az admin.dev.dimpro.hu, dev.dimpro.hu, app.dev.dimpro.hu és aruter.dev.dimpro.hu domainekkel; mindegyik a 127.0.0.1:3100-as közös Next.js runtime-ra mutat.
- A 3100-as port tényleges PM2 folyamata: ID 2, dimpro-benjadmin-operator-ui-v2-dev, online; cwd /srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2.
- A tényleges futó Next.js cwd: /srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2/.next-chatgrid-egress-hotfix-20260825/standalone. A release-mappa mintegy 968 MiB.
- A régi forrás branch HEAD 7d476fd15, a munkafájában négy korábbi, nem ehhez a feladathoz tartozó módosított fájl van. Nem takarítható, nem írható felül automatikusan.
- A license.dev.dimpro.hu/admin/licenckozpont jelenleg HTTP 200-at ad.
- A DEV root filesystem /dev/sda3 118 GiB, 116 GiB foglalt, kb. 1,1 GiB szabad, df szerint 100% foglaltság.
- A V0.9.47 forráscommit b7f791586e620861d8d4a7ea82ee19c130eb7fdd; BUILD01 ID pHGXJJupAHhRzGRaiGXot; artifact SHA256 4c2b5026b8bb134a264e53064310fff0d56f90d2c2b9cd4512baf2d195c3fbe3.
- Az artifact a build-gatewayen 93 MiB tömörítve, de kibontva jelentősen nagyobb. Teljes BUILD01 PASS, TypeScript PASS, 104/104 oldal, 274 standalone statikus chunk; az új licencközponti CSS a buildelt CSS chunkokban ténylegesen jelen van.

## Jelenlegi blokkolók

1. A 3100-as runtime cseréje öt működő DEV domainra hatna, ez túlterjeszkedik a kizárólag a Licencközpontra adott telepítési engedélyen.
2. Az 1,1 GiB szabad hely nem biztosít biztonságos kibontási + rollback + működési tartalékot a 968 MiB-os korábbi release érintetlen megőrzése mellett.
3. A canonical munkafájában korábbi idegen módosítások vannak; nem használható overwrite/reset/clean vagy helyben történő rebase/upgrade.
4. Meglévő ügyféllicencek, Send-kódok, AUTH/Drop adatbázisok és PROD tilosak.

## Biztonságos következő lépés

1. DEV tárhelybővítés (DotRoll) vagy külön Safe Delete engedélyezett tárhelyfelszabadítás. Új preflight: legalább 3 GiB, előnyösen 5 GiB szabad hely, végleges unpack és inodes méret alapján pontosítható.
2. Kizárólag a license.dev.dimpro.hu hostra irányított, ugyanazon BENJADMIN alkalmazás új, visszaállítható DEV runtime-jának előkészítése; nem jelenik meg külön publikus app. A régi 3100-as canonical folyamat és a többi domain nem változhat. A megfelelő runtime port, szerveroldali AUTH, cookie, API, middleware és asset szabályok elkülönítetten ellenőrizendők.
3. Artifact SHA, port és forrás; health/smoke tesztek az új kiadásról írás nélkül. Az admin jogosultságot, Send entitlementet, moduljogokat, CSS betöltést, terméklista szűrést és lapozást is ellenőrizni kell.
4. A license.dev host külön Nginx upstreamre váltása csak teljes előzetes próba és nginx -t PASS mellett engedélyezhető. Más host nem vált.
5. Rollback az eredeti 3100-as upstream visszaállításával, régi PM2 érintetlenül hagyásával, teljes HTTP/API smoke és auditnapló mellett.
6. Valódi böngészős vizuális QA a DEV telepítést követően szükséges 1366x768, 1920x1080, világos/sötét témákon.

A dokumentum egy technikai preflight és nem jogosít az előző blokkolók megkerülésére.

## Végrehajtás

Csak SSH read-only vizsgálat, PM2 és Nginx olvasás, tárhely és artifact meta ellenőrzése; sem szervermódosítás, sem PM2 restart, sem deploy, sem AUTH migráció, sem fájltörlés nem történt.
