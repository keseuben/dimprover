# DIMPRO – központi termék- és licencarchitektúra

Dátum: 2026-10-11. Verzió 1.0.
Állapot: elfogadott ötszintű termékkoncepció, részben előkészített forrásimplementáció.
PROD DENY. Nincs tényleges adatbázismigráció vagy éles aktiválás.

## Az öt fő termékszint

| Szint | Termék | AUTH kód | Licenc scope | Cél |
| --- | --- | --- | --- | --- |
| 1 | DIMPROONE | DIMPRO_ONE | USER | Személyes munkatér, egyéni dokumentumok |
| 2 | DIMPRO WORK | DIMPRO_WORK | ORGANIZATION | Céges munkatér, feladatok, belső folyamatok |
| 3 | DIMPRO Projektkapu | PROJECT_GATE | PROJECT | Projektalapú együttműködés |
| 4 | DIMPRO BUILD | DIMPRO_BUILD | PROJECT, ORGANIZATION | Kivitelezés és terepi munkafolyamatok |
| 5 | DIMPROVER | DIMPROVER | ORGANIZATION, PROJECT | Teljes műszaki projektirányítás és enterprise |

A **DIMPRO Drive a közös, önállóan is előfizethető fájlkezelő szolgáltatás**, nem hatodik szint. Kódja DRIVE, scope-ja USER vagy PROJECT. A termékeknek közös lehet a dokumentuma, stabil dokumentumazonosítóval és azonos fizikai assetre mutató logikai hivatkozásokkal. Nincs automatikus új fizikai másolat vagy kettős tárhelyelszámolás.

Az ötszintű sorrend nem fizetési vagy jogosultság-öröklési lánc: nem kell minden megelőző szintet megvásárolni, ha a jogosult ügyfél közvetlenül egy magasabb terméket vesz igénybe. Modulonként és licenc-scope-onként külön döntések szükségesek.

## Közös adat- és jogosultságrétegek

1. Central AUTH (saját PostgreSQL): felhasználó, aktív session, szervezet, projekt, terméktörzs, központi authentikáció.
2. Project Core: stabil projektazonosító, projekt szerepkör, meghívások, mappa- és dokumentum ACL.
3. Commercial subscription: USER / ORGANIZATION / PROJECT scope-ban fizetős licencek, csomag, fizető, státusz, jóváhagyás, lejárat. Egy ACTIVE kereskedelmi rekord önmagában NEM jogosít a termékhez.
4. Entitlement: külön engedélyezett termékművelet és feature flag; kizárólag AUTH és tényleges ACL után lehet hatályos. Release-gate védi.
5. Drive/File Asset: változatlan azonosító, immutábilis verzió, tárhely és mentés elkülönítése, deduplikált logikai hivatkozások lehetősége.
6. DIMPRO Grid Orchestrator: közös modulok és háttérmunkafolyamatok; nem helyettesíti az adathozzáférési ellenőrzést.
7. Billing/Audit: számlázás, kifizetés, termékcsomag, jóváhagyás és teljes változástörténet szétválasztva.

## Három licenc-tulajdonosi szint

| Scope | Példa | Kapcsolat |
| --- | --- | --- |
| USER | Saját Drive, DIMPROONE | hiteles központi személy; nem fiktív projekt |
| ORGANIZATION | DIMPRO WORK, DIMPROVER | hiteles központi szervezet |
| PROJECT | Projekt Drive, Projektkapu, BUILD | Project Core external_project_id alapján |

A licenc fizetője (magánszemély / vállalkozás) külön adat a licenc tulajdonosi scope-jától. Egy projekthez több fizetős termék tartozhat, de az ACL soha nem kerülhető meg. Külső mérnök, tervező vagy kivitelező az adott projekt licencével dolgozhat, ha a projektmeghívás és az adathozzáférés ezt engedi. Nem szükséges automatikusan külön fizetős személyes Drive licenc.

## Implementációs helyek, V0.9.43 forrásjelölt

- app/lib/license/dimproProductArchitecture.ts: ötszintű terméktörzs és Drive közös szolgáltatás, scope-kontraktus.
- db/auth/migrations/018_auth_v055_dimpro_product_topology.sql: új, source-only topológiai törzs, inaktív (DISABLED) későbbi termékek, a meglévő aktív AUTH products megőrzése. A catalog entitlement_enabled mindig false. Nem hoz létre SSO klienst, szerepet, licencet vagy jogosultságot.
- app/lib/license/projectCommercialReadinessCore.ts és projectCommercialReadiness.ts: a Drive/Projektkapu jelenleg előkészített központi projektlicenc-rekordjai csak olvasható állapotértékeléssel.
- GET /api/projects/[projectId]/licenses/readiness: project.read után, private/no-store válasz. Kizárólag a kiválasztott projekt rekordjai, pénzügyi fizetőazonosítók nélkül. Hiányzó migráció: SOURCE_NOT_CONFIGURED. ACTIVE_RECORD_ONLY nem effektív hozzáférés.
- components/license/ProductArchitectureOverview.tsx: a központi Licencközpont öt fő szintjének és a Drive szolgáltatásnak az admin előnézete.
- components/drive/driveBuildInfo.ts: V0.9.43 csak forrásjelölt, nem élő DEV.

A korábbi, még nem telepített AUTH migrációk 014–017 közül a projektlicenc-adatmodell csak a DRIVE és PROJECT_GATE termékek kereskedelmi rekordjait ismeri. A többi termék fizetős licencforrása NINCS kész. A PRODUCT-topológia nem aktiválja őket automatikusan.

## Kötelező fejlesztési szabályok

- Felhasználói jogosultság és fizetős előfizetés két külön dolog.
- Kereskedelmi állapot és effektív felhasználói hozzáférés külön lekérdezés/eredmény.
- Fájlazonosító és projektazonosító stabil; szervezet és projekt összekapcsolása nem e-mail vagy hasonló név alapján.
- Licencváltás, lejárat, terhelési keret nem töröl dokumentumot és nem ír felül visszaállíthatatlanul fájlt.
- Projektkapu, BUILD, DIMPROVER saját modulcsomagjai nem hoznak létre automatikusan második Drive tárhelycsomagot.
- Hiányzó, hibás, nem induló vagy lejárt paid license ne legyen automatikus ACTIVE.
- Magasabb termék nem adhat hozzáférést idegen projekthez.
- Új termék tényleges jogosultsági gate-et csak audit, DBA review, izolált tesztek, üzleti jóváhagyás és release után kaphat.

## Következő fejlesztési mérföldkövek

1. Személyes USER-scope licencforrás és Saját Drive összerendelés, központi auth user_id-val.
2. ORGANIZATION-scope licenc alap a WORK és DIMPROVER számára.
3. BUILD és DIMPROVER PROJECT-scope szerepek/licencek, részletes moduljogok.
4. AUTH migrációk 014–018 DBA review / valós DEV sémaellenőrzés / biztonsági mentés / regressziós E2E.
5. Biling, számlázás, audit, termékjogosultsági policy és valós Drive quota engedélyezés külön release-gate alatt.
6. Modul és Projektkapu / Drive Desktop integráció közös Project Core és File Asset motorral.

## Korábbi átadók

- DIMPROVER_PRODUCT_DOCS/DIMPRO_PROJECT_PRODUCT_LICENSE_CORE_V052_V053_20261011.md
- DIMPROVER_PRODUCT_DOCS/DIMPRO_LICENSE_PLAN_CATALOG_V054_V0939_20261011.md
- DIMPROVER_PRODUCT_DOCS/DIMPRO_LICENSE_PRICING_AND_SEATS_V1_V0941_20261011.md
- DIMPROVER_PRODUCT_DOCS/DIMPRO_DRIVE_V0942_SUBSCRIPTION_LIFECYCLE_SAFE_PREVIEW_20261011.md

A terméktopológia elfogadott stratégiai irány, de az öt szint együttes megvalósulását vagy a központi licencrendszer éles működését ez a dokumentum nem állítja.
