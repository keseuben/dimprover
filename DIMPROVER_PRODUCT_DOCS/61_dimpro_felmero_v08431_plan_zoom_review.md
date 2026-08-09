# DIMPRO Felmérő v0.8.4.3.1 – PDF tervlap nagyítás és jóváhagyási UX javítás

Dátum: 2026-07-30

## Cél

A sűrű, sok feliratot tartalmazó tervlapokon a helyiségjavaslatok ellenőrzése ne legyen zsúfolt, és a felhasználó egy javaslatra kattintva azonnal annak rajzi környezetét lássa.

## Elkészült

- külön nézeti nagyítás 50–400% között;
- nagyítás és kicsinyítés gombokkal;
- 100%-os nézet-visszaállítás;
- Ctrl/Cmd + egérgörgő támogatás;
- görgethető nagyított tervlap;
- a jóváhagyási lista elemére kattintva automatikus rajzi fókusz és nagyítás;
- `Rajzon mutat és nagyít` művelet;
- kattintható helyiségkontúrok a rajzon;
- alapállapotban csak a kijelölt helyiség felirata jelenik meg;
- opcionális `Minden felirat` kapcsoló;
- kijelölt helyiség neve és területe külön rajzi jelvényen látható;
- Mind / Ellenőrzendő / Jóváhagyott / Kihagyott listasűrők;
- műszaki feliratok, tervpecsét-adatok, méretszövegek és anyagmegnevezések szigorúbb kiszűrése;
- a kivágott tervrész határán kívüli szövegek nem vesznek részt a helyiségfelismerésben;
- a helyiségfelirat nélküli kontúrjavaslat csak erős, ismert helyiségmegnevezés esetén készül.

## Adatmodell

A projekt- és `.dimpro` séma változatlan:

`dimpro.property-survey.v0.8.4.3`

A javítás nézeti és felismerési szűrési hotfix, ezért nem igényel migrációt.

## Tesztek

- domain és integráció: 484/484;
- PDF tervlap E2E: 14/14;
- tíz referencia-PDF, kiegészített műszaki felirat-zajjal;
- történeti energetikai E2E: 40/40 és 42/42;
- responsive munkatér: 15/15;
- alap Felmérő-, PDF- és DXF-regresszió: sikeres;
- tablet álló és fekvő érintésteszt: sikeres;
- candidate assetaudit: 15/15;
- konzol- és oldalhiba: 0;
- screenshot-regresszió: 1920×1080, 1366×768, 1194×834, 834×1194.

## Candidate

Build: `k9IjeJjsQgeR1okyGFUog`

Forrásbackup: `backups/property_survey_v08431_zoom_review_20260730_120415`

## Élesítés

- éles build: `k9IjeJjsQgeR1okyGFUog`;
- rollback: `.next_before_property_survey_v08431_20260730_123350`;
- HTTP: 200;
- éles PDF tervlap E2E: 14/14;
- éles történeti energetikai E2E: 40/40 és 42/42;
- éles responsive regresszió: 15/15;
- éles tablet álló és fekvő teszt: sikeres;
- éles assetaudit: 15/15;
- konzol- és oldalhiba: 0.
