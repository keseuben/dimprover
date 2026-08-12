# BENJADMIN Licencközpont – Identity Core AI policy és finanszírozási keretek

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A modern `/admin/licenckozpont` kapjon központi, Identity Core alapú AI licencszabályokat úgy, hogy a jelenlegi HAGE AI futási jogosultságkezelés közben ne legyen tévesen központinak feltüntetve.

## Adatmodell

Ehhez a körhöz nem kellett új adatbázis-migráció. A meglévő Identity Core modell már tartalmazza a szükséges JSONB mezőket:

- `dimpro_license_modules.limits`;
- `dimpro_license_modules.feature_flags`.

Az `AI_ASSISTANT` modulban kezelt központi licencszintű mezők:

- `monthlyBudgetHuf` – havi AI-finanszírozási keret;
- `maxSingleRequestHuf` – egy AI-kérés maximális költsége;
- `monthlyTokenBudget` – havi belső tokenkeret;
- `maxRequestsPerDay` – napi kérésszám-limit;
- `maxRequestsPerMonth` – havi kérésszám-limit.

A nulla érték jelentése: az adott központi limit nincs beállítva. A rendszer nem talál ki alapértelmezett költség- vagy tokenkeretet.

## AI funkciókapcsolók

A Licencközpontban az `AI_ASSISTANT.feature_flags` alatt kezelhető:

- Mai feladatok rangsorolása;
- Következő lépés;
- Feladat bontása;
- Visszakérdező levél;
- Értekezleti napirend;
- Heti összefoglaló;
- Döntési összefoglaló;
- Dokumentum-adatkinyerés.

Kompatibilitási szabály: hiányzó feature flag engedélyezettnek számít, így a korábban üres `feature_flags` objektum nem tilt le automatikusan meglévő AI-funkciókat.

## Fontos javítás: modulmetadata megőrzése

A táblázat-első Licencközpont korábbi `ModuleDraft` modellje csak a modul kódját és engedélyezett állapotát tartotta meg. Mentéskor emiatt fennállt annak veszélye, hogy a már meglévő:

- `limits`;
- `feature_flags`;
- `valid_from`;
- `valid_until`

értékek üresre vagy alapértékre íródnak.

A szerkesztő most a teljes modulmetadatát betölti és változatlanul továbbadja. Az érvényességi időpontok teljes ISO időpontként maradnak meg; nem csonkolódnak dátumra.

## BENJADMIN csapatképernyő / AI finanszírozás

A központi entitlement összesítő most kiolvassa az Identity Core `AI_ASSISTANT` policy-t is.

Prioritás:

1. ha van központi Identity Core havi AI-keret, azt mutatja;
2. ha nincs, a jelenlegi legacy licencbridge kerete marad kompatibilitási fallback;
3. ha egyik sincs, `Nincs beállítva` / `not_configured` állapot látszik.

Tokenkeretnél az Identity Core licencszintű tokenkeret elsődleges. Ha nincs ilyen, a BENJADMIN opcionális belső környezeti tokenkerete lehet fallback.

A csapatképernyő kiírja a keret forrását is, ezért nem keveri össze a központi policy-t és a kompatibilitási bridge-et.

A jelenlegi valós DEV állapotban a központi AI- és tokenkeret még nincs konfigurálva; az API ezért 0 / `not_configured` értéket ad. Tesztadatból nem került valós licencbe semmilyen keret.

## Runtime állapot

A HAGE AI futási motor ebben a checkpointban továbbra is a régi licencstore névre szóló AI-jogosultságát és kereteit érvényesíti.

Ez szándékos átmeneti állapot. A Licencközpontban már szerkeszthető a központi policy, de a runtime-enforcement átvezetése még nincs kész. A UI ezt egyértelmű figyelmeztetéssel jelzi.

## Acceptance

Új teszt:

`scripts/benjadmin-central-ai-policy-acceptance.mjs`

Eredmény: 18/18 PASS.

A teszt böngészős API-fixture-t használ. Az Identity Core GET/PATCH kéréseket interceptálja, ezért nem ír valódi DEV licencadatbázisba.

Ellenőrzött:

- központi AI policy panel megjelenése;
- pénzügyi, token- és kérésszám-keretek betöltése;
- nyolc AI feature flag;
- meglévő kikapcsolt flag helyes betöltése;
- runtime bridge figyelmeztetés;
- legalább 12 px működési szöveg;
- módosított policy bekerül a PATCH payloadba;
- ismeretlen `limits` mező megmarad;
- ismeretlen `feature_flags` mező megmarad;
- teljes `validFrom` / `validUntil` ISO időpont megmarad;
- világos mód;
- tablet és mobil no-page-overflow.

Regressziók:

- Licencközpont: 16/16 PASS;
- elsődleges Licencközpont útvonal: 7/7 PASS;
- lejárati értesítések: 8/8 PASS;
- Operator UI: 30/30 PASS;
- BENJADMIN csapatképernyő: 42/42 PASS;
- Vezérlés / Partner V3: 21/21 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

Aktív DEV build a checkpoint tesztelésekor: `hPsHm9QykY4aMResigfgq`.

## Következő fejlesztési pont

Következő lépés a névre szóló / tagsági AI-policy központi átvezetése:

- `dimpro_membership_modules.limits` használata felhasználói AI-keretekhez;
- névre szóló AI-hozzáférés;
- felhasználói napi/havi kérésszám;
- felhasználói havi költségkeret;
- hozzáférési lejárat;
- funkció- és scope-jogosultság;
- ezután a HAGE AI gateway Identity Core alapú runtime-enforcementje, átmeneti legacy fallbackkel.

## Biztonság

PROD nem módosult. A fejlesztés DEV-en történt. Az acceptance nem végzett valós Identity Core PATCH műveletet és nem küldött e-mailt.
