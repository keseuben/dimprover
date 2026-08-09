# DIMPRO Felmérő v0.8.4.3.2 – Valós PDF helyiségfelismerés javítása

Dátum: 2026-07-30

## Probléma

A valós CAD/PDF alaprajzon a rendszer a korábbi szigorítás után nem hozott létre automatikus helyiségjavaslatokat. A terven látható helyiségnevek és területek ellenére csak a korábban kézzel rajzolt javaslat maradt meg.

A fő okok:

- a magyar tizedesvesszős `13,06 m²` formátum felismerése nem volt elég robusztus;
- a felső indexű `²` karakter PDF.js szövegkinyeréskor `2` karakterré normalizálódhat;
- egyes CAD PDF-ek a `m` és a felső indexű `2` karaktert külön szövegelemként tárolják;
- a helyiségnév, burkolat és terület több külön sorban vagy részben összefűzött szövegelemként jelenhet meg;
- a korábbi zajszűrés a valós feliratpárosítást túlzottan leszűkítette.

## Elkészült

- Magyar tizedesvesszős területformátumok támogatása:
  - `13,06 m²`;
  - `13,06m²`;
  - `13.06 m2`;
  - `13,06 m` + külön felső indexű `2` PDF-szövegelem.
- Unicode NFKC normalizálás a PDF.js eltérő karakterkódolásaihoz.
- Betűközökkel szétszedett helyiségnevek összefűzése.
- Egymás melletti, egy sorba tartozó PDF-szövegelemek automatikus csoportosítása.
- A helyiségnév és terület ugyanazon PDF-szövegelemben is párosítható.
- A helyiségnév, burkolat és terület külön sorban is párosítható.
- A magyar helyiségnevek és gyakori rövidítések bővített felismerése.
- Erős helyiségnév esetén zárt vektorkontúr hiányában is készül ellenőrizendő közelítő javaslat.
- Közeli, azonos nevű duplikált javaslatok kiszűrése.
- A tervpecsét-, anyag-, burkolat-, méret- és rétegrendfeliratok szűrése megmaradt.
- A korábbi 50–400%-os nézeti nagyítás és helyiségfókusz változatlanul működik.

## Adatmodell

A `.dimpro` séma változatlan:

`dimpro.property-survey.v0.8.4.3`

Migráció nem szükséges. Az új felismerés parancsra újraépíti az automatikus javaslatokat, miközben a kézi és már jóváhagyott elemeket megtartja.

## Buildbiztonság

A Next.js standalone output fájlkövetésből kizárásra kerültek a futáshoz nem szükséges nagy fejlesztési és backup mappák. Ez megakadályozza, hogy a candidate build a teljes backup- és munkakönyvtárat bemásolja. A futáshoz szükséges szerver- és statikus fájlok változatlanul bekerülnek.

## Tesztek

- domain és integráció: 484/484;
- PDF tervlap E2E: 14/14;
- 10 referencia-PDF;
- magyar tizedesvesszős és felső indexű m² teszt;
- külön PDF-szövelemként tárolt felső indexű 2 teszt;
- burkolat- és műszaki feliratzaj teszt;
- történeti energetikai E2E: 40/40 és 42/42;
- responsive munkatér: 15/15;
- alap Felmérő-, PDF- és DXF-regresszió: sikeres;
- tablet álló és fekvő érintésteszt: sikeres;
- candidate assetaudit: 15/15;
- konzol- és oldalhiba: 0;
- screenshot-regresszió: 1920×1080, 1366×768, 1194×834 és 834×1194.

## Candidate

Build: `R_zehmEnPNOmvXqhq9Icc`

Forrásbackup: `backups/property_survey_v08432_real_plan_recognition_20260730_125027`

## Élesítés

- éles build: `R_zehmEnPNOmvXqhq9Icc`;
- rollback: `.next_before_property_survey_v08432_20260730_134518`;
- HTTP: 200;
- éles PDF tervlap E2E: 14/14;
- éles történeti energetikai E2E: 40/40 és 42/42;
- éles responsive regresszió: 15/15;
- éles tablet álló és fekvő teszt: sikeres;
- éles assetaudit: 15/15;
- konzol- és oldalhiba: 0.
