# BENJADMIN – HAGE AI runtime / Identity Core jogosultsági híd

Dátum: 2026-08-12
Környezet: DEV
Állapot: lezárt fejlesztési checkpoint

## Cél

A HAGE AI futási jogosultság ellenőrzését biztonságosan összekapcsolni a központi DIMPRO Identity Core licenc- és tagsági AI-policy rendszerével úgy, hogy a migráció közben a meglévő licenctoken, gépkötés és legacy felhasználói jogosultság ne kerüljön megkerülésre.

## Futási módok

A `DIMPRO_HAGE_AI_IDENTITY_POLICY_MODE` három módot támogat:

- `off`: csak a korábbi legacy AI-policy érvényesül;
- `prefer`: az Identity Core policy elsődlegesen értékelhető, de a legacy jogosultság biztonsági felső korlátként megmarad;
- `strict`: csak egyértelműen feloldott és modern Licencközpont által menedzselt központi AI-policy esetén engedélyezhető a futás; központi policy-hiba vagy hiány esetén fail-closed.

A kód alapértelmezett módja `off`. DEV-en az átmeneti validációhoz `prefer` mód van konfigurálva. PROD konfiguráció nem változott.

## Biztonsági sorrend

A gateway a központi policy olvasása előtt továbbra is ellenőrzi:

1. az aláírt DIMPRO licenctokent;
2. a token licenc-/gép-/alkalmazás egyezését;
3. a legacy licenc aktív állapotát;
4. az `ai_assistant` legacy moduljogosultságot;
5. az aktív gépkötést.

Csak ezután következhet az Identity Core AI-policy kiértékelése.

## Identity Core mapping

A runtime bridge a `dimpro_licenses.legacy_license_ref` értéket a legacy licencrekord biztonságos rekordazonosítójához kapcsolja. A runtime adapter nem használ cégneves fuzzy megfeleltetést.

DEV-ben az egyetlen központi és egyetlen legacy rekord közötti korábbi eltérő hivatkozást a fejlesztés előtt mentett állapot mellett, kontrolláltan az aktuális legacy rekordazonosítóra igazítottuk. Nyers licenckulcs nem került az Identity Core-ba és a dokumentációba.

## Menedzselt központi policy marker

A modern Licencközpont által mentett `AI_ASSISTANT` licenc- és tagsági policy-k `limits` objektuma megkapja:

- `policyVersion: 1`;
- `managedBy: identity-license-center`.

A marker nélküli régi központi policy `prefer` módban fallback marad, `strict` módban nem jogosít futásra. Így nincs csendes jogosultságátvétel.

## `prefer` mód – jogosultságbővítés elleni védelem

Központi policy csak akkor válhat tényleges futási policy-vé, ha a legacy oldalon ugyanaz a felhasználó már névre szóló AI-jogosultsággal rendelkezik.

A hatékony felhasználói policy a központi és legacy korlátok szigorú metszete / alsó korlátja:

- feature lista: metszet;
- scope lista: metszet;
- napi és havi felhasználói kérésszám: a szigorúbb pozitív limit;
- havi felhasználói költségkeret: a szigorúbb pozitív limit;
- AI-hozzáférési lejárat: a korábbi érvényes lejárat;
- licenc havi AI-költségkeret: a szigorúbb központi/legacy pozitív limit;
- egy kérés költségkerete: a szigorúbb központi/legacy pozitív limit.

A központi licenc további önálló szűkítő korlátként érvényesítheti a havi tokenkeretet, valamint a napi és havi szervezeti/licenc kérésszámot.

## Runtime keretek

A gateway futás közben ellenőrzi:

- felhasználói napi kérésszám;
- felhasználói havi kérésszám;
- licenc napi kérésszám;
- licenc havi kérésszám;
- felhasználói havi HUF-költségkeret;
- licenc havi HUF-költségkeret;
- licenc havi tokenkeret;
- egy kérés maximális becsült HUF-költsége.

A havi tokenkeretet az `estimate` és `run` művelet előtt is ellenőrzi a már naplózott havi tokenforgalom + az aktuális kérés becsült input/output tokenje alapján, így a várható túllépés még API-hívás előtt megállítható.

## Fail-closed szabályok

Tiltás történik többek között:

- inaktív vagy lejárt központi licencnél;
- tiltott / lejárt tagságnál;
- tiltott AI-modulnál;
- tiltott scope vagy feature esetén;
- kétértelmű felhasználói feloldásnál;
- hibás tagsági vagy AI-hozzáférési lejárati időnél;
- `strict` módban hiányzó menedzselt központi policy esetén;
- `strict` módban Identity Core elérési hiba esetén.

## Auditálhatóság

A HAGE AI status/usage válasz és az új usage rekordok jelzik a policy forrását:

- `central_identity`;
- `legacy_license_store`.

A status válasz tartalmazza a policy módot és a döntési okot is. A meglévő usage folytonosság érdekében migráció alatt a korábbi legacy AI-user azonosító marad a használati rekord kulcsa, ha rendelkezésre áll.

## BENJADMIN megjelenítés

A `Ctrl+Alt+0` / `D` csapatképernyő AI Finanszírozás és Tokenkeret panelje most megjeleníti a futási policy módját. DEV `prefer` esetén a felirat:

`központi policy + legacy biztonsági korlát`

A Licencközpont tájékoztató szövege is a tényleges DEV átmeneti működést írja le.

## Acceptance és ellenőrzések

- HAGE AI tiszta policy contract: 19/19 PASS;
- HAGE AI runtime bridge contract: 17/17 PASS;
- központi AI-policy böngészős acceptance: 18/18 PASS;
- tagsági AI-policy böngészős acceptance: 16/16 PASS;
- BENJADMIN csapatképernyő: 42/42 PASS;
- Operator UI: 30/30 PASS;
- Vezérlés / Partner V3: 21/21 PASS;
- B3.2 P5 végleges acceptance: 53/53 PASS;
- TypeScript (`npx tsc --noEmit`): PASS;
- lint: 0 hiba / 104 meglévő warning;
- `git diff --check`: PASS;
- Next build: PASS.

Aktív DEV build a végső validációkor: `jUFK2QTxa4EGfuln74Ynf`.

## Korlát / következő migrációs lépés

A jelenlegi worktree legacy licencállományában nincs aktív géprekord és nincs névre szóló legacy AI-user rekord. Emiatt ebben a checkpointban valós végfelhasználói HAGE AI kérésen nem lehetett teljes end-to-end runtime próbát végrehajtani mesterséges jogosultsági adat létrehozása nélkül. Ilyen mesterséges jogosultságbővítést nem végeztünk.

A következő biztonságos lépés a tényleges DEV HAGE felhasználói/gépkötési fixture kontrollált előkészítése vagy a valódi DEV klienssel végzett E2E ellenőrzés, majd minden érintett központi tagsági policy `policyVersion=1` validációja. Csak ezután vizsgálható a `strict` módra váltás.

## PROD

PROD alkalmazás, PROD adatbázis és PROD AI-policy konfiguráció nem módosult.
