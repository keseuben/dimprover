# BENJADMIN Licencközpont – névre szóló Identity Core AI-policy

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A szervezeti licencek felhasználóihoz névre szóló AI-jogosultság és AI-keret legyen beállítható a modern Licencközpontból, a már meglévő Identity Core tagsági modulmodell felhasználásával.

## Adatmodell

Új adatbázis-migráció nem szükséges. A meglévő:

`dimpro_membership_modules.limits`

JSONB mező tárolja az `AI_ASSISTANT` felhasználói policy-t.

Kezelt mezők:

- `monthlyBudgetHuf` – felhasználói havi AI-költségkeret;
- `maxRequestsPerDay` – napi AI-kérésszám;
- `maxRequestsPerMonth` – havi AI-kérésszám;
- `accessExpiresAt` – külön AI-hozzáférési lejárat;
- `allowedScopes` – `personal`, `hage`;
- `allowedFeatures` – engedélyezett AI-funkciók.

A `dimpro_membership_modules.enabled` kapcsolja ki/be a névre szóló AI-hozzáférést.

## Licenc → felhasználó öröklési szabály

A felhasználói policy csak szűkítheti a licencszintű AI-jogosultságot.

Ha például a központi licenc `feature_flags` mezőjében a `decision_support` tiltott, a felhasználói szerkesztőben a Döntési összefoglaló kapcsoló letiltva jelenik meg, és a szerveroldali mentés sem engedi azt vissza az `allowedFeatures` listába.

## Új admin API

`PATCH /api/dimpro-identity/admin/membership-ai-policy`

A végpont:

- licencadmin hitelesítést kér;
- ellenőrzi a membership és a szervezeti licenc kapcsolatát;
- elutasítja a visszavont tagságot;
- ellenőrzi, hogy a licencen az `AI_ASSISTANT` aktív;
- csak ismert scope-okat és AI-funkciókat fogad el;
- a licencszinten tiltott feature-t kiszűri;
- a korábban meglévő, ismeretlen `limits` kulcsokat megőrzi;
- audit eseményt ír `membership_ai_policy_updated` típussal.

Hitelesítés nélküli DEV ellenőrzés: HTTP 401, `DIMPRO_AI_MEMBER_POLICY_ADMIN_UNAUTHORIZED`.

## Licencközpont UI

A szervezeti felhasználók táblájában AI-modullal rendelkező licencnél új `AI keret` művelet jelenik meg.

A felhasználói panel tartalmazza:

- névre szóló AI-hozzáférés kapcsoló;
- havi felhasználói AI-keret;
- napi és havi kérésszám;
- AI-hozzáférési lejárat;
- személyes és szervezeti/HAGE scope;
- nyolc AI-funkció;
- licencszintű tiltások vizuális és működési érvényesítése.

A panel világos és sötét témában is működik, működési szövege legalább 12 px.

## Acceptance

Új teszt:

`scripts/benjadmin-member-ai-policy-acceptance.mjs`

Eredmény: 16/16 PASS.

A teszt böngészős fixture-rel interceptálja a központi Identity Core GET és tagsági AI-policy PATCH kéréseket, így valós DEV licencadatot nem ír.

Ellenőrzött:

- névre szóló AI-policy panel;
- felhasználói költség- és request limitek;
- personal + hage scope;
- meglévő feature-lista;
- licencszinten tiltott feature nem kapcsolható vissza;
- minimum 12 px működési tipográfia;
- helyes licenseId + membershipId;
- havi keret módosítása;
- scope szűkítése;
- engedélyezett feature bővítése;
- request limitek megőrzése;
- világos mód;
- tablet és mobil no-page-overflow.

Regressziók:

- központi AI policy: 18/18 PASS;
- Licencközpont: 16/16 PASS;
- elsődleges Licencközpont útvonal: 7/7 PASS;
- Operator UI: 30/30 PASS;
- BENJADMIN csapatképernyő: 42/42 PASS;
- Vezérlés / Partner V3: 21/21 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

Aktív DEV build a checkpoint tesztelésekor: `cOQLAmvSMS32jW9h2BA5H`.

## Következő fejlesztési pont

A következő szint a HAGE AI gateway runtime-jogosultságának Identity Core-ra vezetése. A biztonságos átmenet elve:

1. meglévő licenctoken és gépkötés ellenőrzése megmarad;
2. ha a legacy licenchez egyértelmű Identity Core licenc és névre szóló membership AI-policy tartozik, a központi policy legyen elsődleges;
3. ha a központi kapcsolat még nincs kiépítve, a legacy AI-policy maradjon ideiglenes fallback;
4. a forrás minden esetben auditálható legyen;
5. a migráció alatt ne legyen automatikus jogosultságbővítés.

## Biztonság

PROD nem módosult. A fejlesztés és minden acceptance DEV-en történt. A böngészős teszt nem írt valós Identity Core rekordot.
