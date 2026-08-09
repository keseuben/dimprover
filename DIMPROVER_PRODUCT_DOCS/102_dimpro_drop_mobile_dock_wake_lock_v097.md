# DIMPRO Drop 0.9.7 – mobil dokk és képernyő-ébrentartás

**Dátum:** 2026. augusztus 6.  
**Modul:** DIMPRO Drop / CsomagDrop / DIMPRO Send / Beküldőkapu  
**Alkalmazásverzió:** DROP 0.9.7  
**PostgreSQL workflow-séma:** DROP 0.9.5 – változatlan  
**Kiinduló release:** DROP 0.9.6, `.next-v096-release-final`, build `EOIQ3qRnfiH1efAwdZT58`  
**Állapot:** éles private-pilot release.  
**Aktív release:** `.next-v097-release-final`  
**Build ID:** `MeShA63db3FLJwzqqCul_`  
**Rollback:** `.next-v096-release-final`

## Cél

A mobilos Drop-felület alkalmazásszerű használata, egy kézzel elérhető globális navigációval és a hosszabb képfeldolgozás/feltöltés alatti automatikus kijelző-ébrentartással.

## Lebegő mobil dokk

A publikus Drop-oldalakon 5 elemes alsó navigáció jelenik meg:

1. Kezdőlap;
2. Csomag megnyitása;
3. középső, kiemelt hexagon Feltöltés gomb;
4. DIMPRO Send;
5. Menü.

Működési szabályok:

- kizárólag mobil- és keskeny tablet nézetben látható;
- figyelembe veszi az iOS/Android `safe-area` alsó, bal és jobb területét;
- görgetés közben fixen elérhető;
- aktív útvonalat kiemeli;
- virtuális billentyűzet megnyitásakor automatikusan eltűnik;
- külső teljes képernyős modal, például kép-előnézet megnyitásakor automatikusan eltűnik;
- a saját mobilmenüjét nem érzékeli külső modalként;
- közvetlen tokenes letöltő-, feltöltő-, jelentés- és meghívóoldalakon rejtve marad;
- az oldal alsó tartalma mobilon külön safe-area térközt kap, ezért a dokk nem takarja el a műveleteket.

## Középső hexagon gyorsfeltöltő

Aktív feltöltőterület esetén közvetlenül elérhető:

- Galéria;
- Kamera;
- fájlrendszer/tallózás.

Ha nincs látható feltöltőterület, a három helyi művelet inaktív, de a felhasználó közvetlenül megnyithatja:

- DIMPRO Send;
- Beküldőkapu.

A globális mobil eseménymotor nem fér hozzá a kiválasztott fájlok tartalmához; kizárólag a látható, meglévő böngészős fájlválasztó inputot nyitja meg.

## Screen Wake Lock

A rendszer a böngésző `Screen Wake Lock` képességét használja, ha az elérhető.

Automatikus ébrentartási okok:

- HEIC/HEIF és egyéb kép-előkészítés;
- kliensoldali képoptimalizálás;
- fájlfeltöltés;
- multipart feltöltés;
- feltöltés véglegesítése;
- publikus Send/Beküldőkapu kézbesítési finalizálása.

Manuális működés:

- a mobil Menüben külön kapcsoló található;
- telepített PWA-ban az első indításkor alapértelmezetten aktív;
- normál böngészőben alapértelmezetten csak a folyamatok kapcsolják be automatikusan;
- a manuális választás a `dimpro_drop_keep_awake_v097` helyi beállításban marad meg;
- háttérből visszatéréskor és rendszeroldali feloldás után a rendszer újrakéri a lockot, ha továbbra is szükséges;
- energiatakarékos vagy böngészőoldali elutasítás esetén látható állapotüzenet jelenik meg;
- nem támogató böngészőn nincs hiba, a feltöltés változatlanul működik.

## PWA-frissítés

- service worker cache: `dimpro-drop-static-v097`;
- telepített PWA gyorsparancsok:
  - DIMPRO Send;
  - Csomag megnyitása;
  - Beküldőkapu;
- a service worker továbbra sem cache-el privát API-választ vagy feltöltött fájlt.

## Biztonsági és adatvédelmi szabályok

- a Wake Lock nem ad új eszközjogosultságot a szervernek;
- nem kerül tárolásra képernyőhasználati vagy akkumulátoradat;
- a mobil gyorsgombok nem olvassák a galériát, csak felhasználói kattintással nyitják meg a natív választót;
- tokenes letöltő és meghívóoldalakon a globális navigáció rejtett;
- a PostgreSQL workflow-séma és a hozzáférési tokenek működése nem változik;
- a privát Drop API-k és fájlok továbbra sem kerülnek PWA cache-be.

## Forrásmentés

`backups/drop_v097_mobile_dock_wakelock_20260806_061004`

## Ellenőrzések

- mobil/PWA/Wake Lock szerződés: 63/63 PASS;
- DROP 0.9.6 üzemeltetési/HEIC/e-mail regresszió: 175/175 PASS;
- scanner regresszió: 27/27 PASS;
- összes szerződés: 265/265 PASS;
- TypeScript: PASS;
- teljes ESLint: 0 hiba, 113 korábbi figyelmeztetés;
- production build: PASS, 88 oldal, 72 statikus chunk;
- candidate és éles mobil Chromium shell: PASS;
- manuális Wake Lock be/ki: PASS;
- automatikus HEIC-előkészítési Wake Lock: PASS;
- PWA első indítási alapértelmezés: PASS;
- nem támogató böngésző fallback: PASS;
- billentyűzet- és modalelrejtés: PASS;
- Galéria/Kamera/Fájl globális eseményátadás: PASS;
- tokenes útvonalon rejtett dokk: PASS;
- desktopon rejtett dokk: PASS;
- valós HEIC regresszió: 1 892 907 B → 553 569 B, 71% megtakarítás;
- éles HTTPS útvonalak és PWA manifest/service worker: PASS;
- tesztmaradvány: 0.


## Éles release és rollback

- aktiválási mentés: `backups/drop_v097_release_20260806_072020`;
- forrásmentés: `backups/drop_v097_mobile_dock_wakelock_20260806_061004`;
- aktív release: `.next-v097-release-final`;
- build: `MeShA63db3FLJwzqqCul_`;
- közvetlen rollback: `.next-v096-release-final`;
- rollback script: `scripts/rollback-drop-v097-release.sh`;
- a két verzióval korábbi `.next-v095-release-final` release a sikeres audit után törölve;
- részletes új csevegés átadás: `103_dimpro_drop_new_chat_handoff_after_v097.md`.
- Fejlesztési Központ: `released`, 77 perc, nyitott időmérő 0.

## Fizikai eszközteszt korlát

A klienslogika Chromium Wake Lock mockkal teljesen tesztelt. Az iPhone Safari/PWA, Android Chrome/PWA, energiatakarékos mód és hosszú mobilhálózatos feltöltés fizikai eszköztesztje a következő mobilos fejlesztési kör része.
