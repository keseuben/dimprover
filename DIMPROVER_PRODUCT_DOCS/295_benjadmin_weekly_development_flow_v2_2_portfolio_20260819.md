# 295 — BENJADMIN Weekly Development Flow V2.2 · projektportfólió heti összevetés

**Dátum:** 2026-08-19
**Környezet:** kizárólag DEV
**Állapot:** source gate zöld · runtime release gate előtt · PROD DENY

## Cél

A heti fejlesztési irányítást projektportfólió-szintre emelni: egy közös vezetői nézetben összehasonlíthatók legyenek az aktív projektek a már meglévő Weekly Summary / Management Score motor alapján.

## Portfólió mutatók

Projektenként:

- rangsor;
- projekt neve és státusza;
-  vezetői státusz;
- 0–100 flow-score;
- heti aktivitás;
- lezárt task;
- blokkolt task;
- várakozás;
- hiba;
- aktív worker;
- worker handoff;
- max handoff gap;
- elsődleges heti kockázat.

Összesítve:

- projektek száma;
- stabil / figyelendő / beavatkozást igénylő projektek;
- átlagos portfólió score;
- aktivitás;
- lezárt / blokkolt task;
- várakozás / hiba;
- egyedi aktív worker szám.

## Rangsorolási szabály

A problémás projektek automatikusan előre kerülnek:

1. ;
2. ;
3. .

Azonos státuszon belül:

1. alacsonyabb score;
2. több hiba;
3. több várakozás;
4. több blokkolt task;
5. projektnév.

## Adatforrás és terhelés

- canonical projektforrás: ;
- csak  projektek;
- szerveroldali maximum 40 projekt;
- heti summary számítás ugyanazzal a  motorral;
- batch méret: 2 projekt;
- új DB tábla / migráció nincs.

A jelenlegi DEV adatbázisban 5 aktív projekt található.

## API

Új endpoint:



Query:

-  opcionális.

Biztonság:

- ;
- ;
- ;
- anonim hozzáférés tiltott.

## UI

Új  panel a heti összesítőben.

A panel:

- öt összesített KPI-kártyát mutat;
- rangsorolt projektlistát jelenít meg;
- státusz alapján vizuálisan jelzi a stabil / figyelendő / kritikus projektet;
- kijelöli az aktuálisan kiválasztott projektet;
- egy projekt sorára kattintva a teljes BENJADMIN projektkiválasztás ugyanarra a projektre vált;
- a projektváltás a meglévő  state / localStorage mechanizmust használja.

Frissítés:

- automatikus portfólió refresh 5 percenként;
- a kézi heti Refresh gomb a summary, 8 hetes trend és portfólió adatot együtt frissíti.

Responsive:

- desktopon egy soros projekt-összevetés;
- tablet nézetben a metrikák külön sorra törnek;
- mobilon 2 oszlopos KPI és projektmetrika rács;
- oldal-szintű horizontális overflow nem megengedett.

## Source fájlok

- ;
- ;
- ;
- ;
- ;
- ;
- ;
- ;
- .

## Jelenlegi kapuk

- V2.2 contract: **26/26 PASS**;
- célzott ESLint: **PASS**;
- : **PASS**;
- : **PASS**;
- PROD access: **DENY**.

## Függő release gate

- feature commit;
- exact candidate build;
- portfólió API + browser runtime acceptance;
- V2.1 trend regresszió;
- V2.0 report regresszió;
- V1.4 Flow / Weekly Summary / Common Chat / Scheduler regresszió;
- canonical integráció;
- teljes lint;
- release artifact;
- DEV PM2 cutover + smoke;
- dokumentációs closeout.
