# BENJADMIN – AI `strict` átállási készenlét

Dátum: 2026-08-12
Környezet: DEV

## Cél

A HAGE AI Identity Core runtime híd `prefer` → `strict` átállása előtt a BENJADMIN ne csak a futási módot, hanem a biztonságos migráció tényleges készenlétét is mutassa. A készenléti jelzés csak diagnosztika; önmagában nem kapcsolja át a runtime módot.

## Készenléti feltételek

AI-licencenként ellenőrzésre kerül:

- van-e pontos `legacy_license_ref` → legacy licencrekord kapcsolat;
- a központi `AI_ASSISTANT` licenc-policy modern, `policyVersion >= 1` és `managedBy = identity-license-center` állapotú-e;
- van-e aktív legacy gépkötés a végponttól végpontig DEV ellenőrzéshez;
- van-e névre szóló, aktív legacy AI-felhasználó a migráció bizonyításához;
- szervezeti licencnél az aktív legacy AI-felhasználók egyértelműen feloldhatók-e aktív központi tagságra;
- az érintett tagsághoz van-e engedélyezett, menedzselt központi AI-policy.

A `strict` módra váltás akkor sem történik automatikusan, ha a diagnosztika minden feltételt teljesültnek jelez. A jelzés neve ezért `ELLENŐRZÉSRE KÉSZ`, nem `AUTOMATIKUSAN ÁTÁLLÍTHATÓ`.

## BENJADMIN API összesítő

A fejlesztési entitlement összesítő új mezői:

- `aiRuntimeStrictReady`;
- `aiRuntimeStrictReadyLicenses`;
- `aiRuntimeStrictBlockedLicenses`;
- `aiRuntimeStrictBlockers`.

Licencenként külön `strictReadiness` objektum tartalmazza a készenléti állapotot, blokkoló okokat, menedzselt policy állapotot, aktív legacy gépszámot és a felhasználói feloldás összesítőjét.

A diagnosztika nyers licenckulcsot, titkot vagy privát kulcsot nem ad vissza.

## Csapatképernyő

A `Ctrl+Alt+0` / `D` BENJADMIN csapatképernyő AI Finanszírozás és Tokenkeret fejlécében megjelenik:

- `strict: ELLENŐRZÉSRE KÉSZ`, vagy
- `strict: NEM KÉSZ`.

A blokkoló okok a státusz elem magyarázatában elérhetők, így a panel nem növeli jelentősen a 1366×768-as munkaterület magasságát.

## Jelenlegi DEV állapot

A validáció időpontjában a státusz helyesen `NEM KÉSZ`.

Aktuális, valós DEV blokkolók:

- a központi licenc AI-policy még nem menedzselt v1 állapotú;
- nincs aktív legacy gépkötés ebben a DEV worktree licencállományban;
- nincs névre szóló aktív legacy AI-felhasználó ebben a DEV worktree licencállományban.

Ezeket a rendszer nem próbálta mesterséges jogosultság létrehozásával megkerülni.

## Ellenőrzés

- TypeScript: PASS;
- célzott ESLint: PASS;
- `git diff --check`: PASS;
- Next build: PASS;
- BENJADMIN csapatképernyő acceptance: 44/44 PASS;
- aktív DEV build: `nDKwihuwRd7GibLU7PRuZ`.

## PROD

PROD nem módosult. A `strict` runtime mód PROD-on nem került bekapcsolásra.
