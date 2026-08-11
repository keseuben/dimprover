# DIMPRO BENJADMIN B3.2 – P4 Partnerátadás és kiadási életciklus – 2026-08-11

## Állapot

A B3.2 P4 partner kiadási és átadási életciklus (partner release / handoff lifecycle) DEV környezetben elkészült és acceptance teszttel igazolt.

PROD módosítás nem történt.

A fejlesztés normatív alapja a három BENJADMIN átadási anyag, valamint a belőlük készült szerveroldali crosswalk:

- `01_DIMPRO_BENJADMIN_B3_teljes_fejlesztoi_es_kodolasi_atadas_2026-08-09`
- `02_DIMPRO_BENJADMIN_B3_1_kiegeszito_control_plane_realtime_naplo_monitoring_2026-08-10`
- `03_DIMPRO_BENJADMIN_B3_2_partner_development_plane_outminai_kulso_termekek_2026-08-11`
- `143_benjadmin_b3_b31_b32_normative_crosswalk_20260811.md`

## Forrásdokumentumokból következő P4 szerződés

A B3/B3.2 specifikáció szerint:

- az általános kiadási mag (release core) a meglévő `dev_center_releases`;
- a partnerátadás bővítése a `dev_center_partner_handoffs`;
- a partnerátadási rekord kapcsolja a partnerprojektet a konkrét kiadáshoz;
- kötelezően tárolható az átadási jegyzék (`manifest_json`) és annak ellenőrzőösszege (`checksum`);
- az átadás és az elfogadás időpontja/személye külön mezőkben követhető;
- a partnerátadási állapotok: `draft`, `prepared`, `handed_over`, `accepted`, `rejected`, `cancelled`.

Ehhez új adatbázis-sémamigráció nem kellett, mert a P1 Partner Development Plane migráció már létrehozta a szükséges adattáblát és állapotkorlátozásokat.

## Elkészült P4 backend

Új modul:

`app/lib/dev-center/partner-handoffs.ts`

Feladatai:

- partnerátadások listázása;
- P4 átadás előkészítése;
- általános kiadási rekord létrehozása;
- átadási jegyzék létrehozása;
- SHA-256 ellenőrzőösszeg képzése;
- állapotváltási szabályok betartatása;
- átadási audit események írása;
- nyers titkok kiszűrése az átadási jegyzékből.

A P4 előkészítés csak akkor engedélyezett, ha:

- P2 futási izoláció (runtime isolation) READY;
- a partner séma READY;
- a partnerprojekt P3 kiépítése (provisioning) READY;
- a projekt átadási modellje `HANDOFF`;
- érvényes Git commit azonosító rendelkezésre áll;
- konkrét build azonosító (build ID) rendelkezésre áll.

## Kiadási mag és átadási állapot összerendelése

A forrásdokumentumok meghatározzák a partnerátadási állapotokat, és előírják a meglévő általános kiadási mag újrahasznosítását.

A következő konkrét összerendelés **P4 implementációs döntés**, amely a két meglévő modellt kapcsolja össze:

- `prepared` → általános kiadás: `candidate`;
- `handed_over` → általános kiadás: `approved`;
- `accepted` → általános kiadás: `released`;
- `rejected` → általános kiadás: `failed`;
- `cancelled` → általános kiadás: `failed`.

Ez az összerendelés nem a három átadási dokumentumban szó szerint meghatározott új állapotmodell, hanem a meglévő B3 release core és a B3.2 partnerátadás közötti implementációs híd.

## Állapotváltási védelem

Engedélyezett fő útvonal:

`Előkészítve (prepared) -> Átadva (handed_over) -> Elfogadva (accepted)`

További lezárások:

- `handed_over -> rejected`;
- `draft/prepared -> cancelled`.

Tiltott például:

- közvetlen `prepared -> accepted` ugrás;
- már `accepted` rekord ismételt elfogadása;
- nem megfelelő kiinduló állapotból történő átadás.

Az átadási rekord módosítása optimista állapotfeltétellel történik, így egy közben megváltozott rekord fail-closed módon 409 konfliktust ad.

## Build once / deploy many

A P4 átadási jegyzékhez kötelező:

- Git commit;
- build azonosító;
- partnerprojekt kód;
- átadási modell;
- adatminősítés;
- előkészítés időpontja és végrehajtója.

A rendszer ezekből fix átadási jegyzéket készít, majd SHA-256 ellenőrzőösszeget tárol.

Az általános kiadási rekord metaadata:

`buildOnceDeployMany: true`

A P4 nem indít új buildet az átadáskor. Ugyanaz a rögzített build/commit páros megy végig az átadási életcikluson.

## Titokkezelés

A P4 átadási jegyzék nem titoktár.

A backend elutasítja többek között a nyilvánvaló nyers:

- privát kulcs;
- service-role jellegű adat;
- jelszó;
- token;
- bearer hitelesítés;
- API-kulcs mintázatok átadási megjegyzésbe vagy artifact referenciába írását.

A partner secret kezelés továbbra is kizárólag referenciaalapú.

## API

Új olvasási/előkészítési végpont:

`GET /api/dev/engine/partner-handoffs`

`GET /api/dev/engine/partner-handoffs?projectId=<projectId>`

`POST /api/dev/engine/partner-handoffs`

Új állapotváltási végpont:

`PATCH /api/dev/engine/partner-handoffs/<handoffId>`

Műveleti kódok:

- `HAND_OVER`;
- `ACCEPT`;
- `REJECT`;
- `CANCEL`.

Olvasás a meglévő admin/reporter szerződés szerint engedélyezhető. Módosítás admin-jogosultságot igényel. Hitelesítés nélküli módosítás 401.

## P4 kezelőfelület

A `Partner fejlesztések` nézet új P4 panelt kapott:

`Partnerátadás · Átadási életciklus (handoff)`

Funkciók:

- átadásra kész HANDOFF partnerprojekt kiválasztása;
- Git commit megadása;
- build azonosító megadása;
- átadási megjegyzés;
- átadás előkészítése;
- legutóbbi átadások listája;
- `Átadás rögzítése`;
- `Elfogadás`;
- `Elutasítás`;
- `Visszavonás`.

A checksum csak rövidített formában jelenik meg a kezelőfelületen.

## Magyar elsődleges UI szabály

A BENJADMIN látható elnevezéseinél új kötelező szabály:

**a magyar megnevezés az elsődleges; az angol szakkifejezés legfeljebb utána, zárójelben jelenhet meg.**

Példák:

- `Vezérlés (Control)`;
- `Feladatok (taskok)`;
- `Fejlesztők (worker-ek)`;
- `Kiadások (release)`;
- `Feladatvárólista (task queue)`;
- `Munkamenet (session)`;
- `Munkafa (worktree)`;
- `Átadási modell (delivery model)`;
- `Kiépítési életciklus (provision lifecycle)`.

A technikai adatbázis-enumok, API műveleti kódok és gépi azonosítók továbbra is angol kóddal maradhatnak, de a felhasználói felület emberi címkéje magyar elsődleges.

## Acceptance

Új célzott acceptance:

`scripts/benjadmin-b32-p4-handoff-acceptance.mjs`

Eredmény:

**36/36 PASS**

A teszt valós DEV fixture-rel ellenőrzi:

- P2 runtime READY előfeltételt;
- hitelesítési kapukat;
- P3 HANDOFF provisioninget;
- elkülönített partner repository/munkafa létrehozását;
- valós Git commitot;
- nyers titok tiltását;
- `prepared` állapotot;
- SHA-256 checksumot;
- build/commit rögzítését;
- általános kiadási `candidate` állapotot;
- build-once/deploy-many metaadatot;
- tiltott állapotugrást;
- `handed_over` és `accepted` életciklust;
- kapcsolódó `approved` és `released` release állapotot;
- audit eseményeket;
- desktop/tablet/mobil P4 UI-t;
- minimum 12 px törzsszöveget;
- teljes oldali vízszintes overflow hiányát;
- desktop 1440×900 one-viewport működést.

A teszt a végén saját fixture projektjét, adatbázisrekordjait és partner fájlrendszeri erőforrásait kontrolláltan törli. A visszaellenőrzés után a partnerprojekt lista ismét 0 rekord.

## Regressziós állapot

A végleges P4 kör után:

- P4 Partnerátadás: 36/36 PASS;
- P1 Partner Registry: 14/14 PASS;
- P2 izolációs policy/runtime: 12/12 PASS, runtime READY;
- B3.1 Vezérlés (Control): 13/13 PASS;
- Operator UI: 30/30 PASS;
- UI V3 Feladatok/Csapat/Fejlesztők/Környezetek: 36/36 PASS;
- UI V3 Vezérlés/Partner: 21/21 PASS;
- UI V3 Kiadások/Napló/Licenc-AI: 28/28 PASS;
- TypeScript: PASS;
- lint: 0 error / 108 meglévő warning;
- DEV smoke: admin 200, engine health 200, partner handoff API 200.

Aktív DEV build:

`y4B1I3AggUagfZ0CFM87b`

## Ismert további hardening

A partnerátadási rekord állapotváltása optimista, feltételes adatbázis-módosítás, de a partnerátadás és a kapcsolódó általános release rekord frissítése jelenleg két külön service-role művelet.

Ezért ez **nem állítható teljes adatbázis-tranzakciós atomikusságnak** a két adattábla között.

Későbbi biztonsági hardeningként indokolt egy adatbázis-oldali tranzakciós RPC, amely egy tranzakcióban végzi:

- partner handoff állapotváltást;
- release állapotváltást;
- audit eseményt.

Ez a jelenlegi P4 működést nem akadályozza, de a végső Enterprise hardening részeként javasolt.

## Következő szint

B3.2 P5:

- végleges Partner Development Plane UI/UX acceptance;
- teljes jogosultsági és negatív security acceptance;
- P4/P5 integrált regresszió;
- Control VPS célarchitektúrához szükséges átadási esemény/read-model előkészítés;
- későbbi adatbázis-tranzakciós P4 hardening.
