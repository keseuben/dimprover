# DIMPRO DROP 0.9.2 – Élő kezdőoldal és megbízható PIN-helyreállítás

**Kiadás dátuma:** 2026. augusztus 5.  
**Állapot:** éles private-pilot kiadás  
**Éles build:** `aFb7RffMl_D2YAX6xnu5x`  
**Aktív release:** `.next-v092-release-final`  
**Közvetlen rollback:** `.next-v091-release-final`  

## Cél

A DROP 0.9.2 két, felhasználó által jelzett eltérést javít:

1. a Drop kezdőoldal korábbi statikus bemutatóállapota tévesen azt írta, hogy a kép- és fájlfeltöltés tiltva van;
2. a Csomagkód és PIN hozzáférési kapu PIN-helyreállítása nem adott diagnosztikai azonosítót, és az elutasított kéréseket nem auditálta.

## Élő Drop kezdőoldal

A `drop.dimpro.hu` kezdőoldal most szerveroldalon a tényleges feature flag és tárhely-készültség alapján jeleníti meg:

- hozzáférési kapu;
- mobil KépDrop;
- privát Object Storage;
- ClamAV vírusellenőrzés;
- KépDrop, FájlDrop, ZIP és vegyes csomag állapota.

Eltávolított félrevezető szövegek:

- „Feltöltés még tiltva”;
- „INAKTÍV”;
- „látványelőnézet”;
- aktív funkciónál „Még nem aktiválható”.

Az anonim, azonosítatlan feltöltés továbbra is tiltott. Feltöltéshez csomagkód + PIN, meghívólink vagy aktív Drop térmunkamenet szükséges.

## PIN-helyreállítás

A nyilvános válasz továbbra sem árulja el, hogy egy csomagkód vagy e-mail szerepel-e a rendszerben. Ez védi a címzetteket és a csomagokat a jogosultság-felderítéstől.

Új működés:

- minden kérés egyedi `pinrec_...` kérésazonosítót kap;
- a felület megjeleníti a kérésazonosítót;
- a felület nem állítja biztosan, hogy az e-mail kiment;
- a felület jelzi a Spam/Levélszemét mappa ellenőrzését;
- aktív, lejárt, jogosulatlan és rate-limitált csomagszintű próbálkozások auditálódnak;
- a PM2 naplóban belső eredménykód jelenik meg, de a kliensnek nem kerül ki;
- a 10 perces rate limit csak sikeresen elküldött PIN-helyreállítási levelet vesz figyelembe;
- sikertelen SMTP-küldés után azonnal újra lehet próbálni;
- a régi PIN csak SMTP-küldési hiba esetén áll vissza;
- sikeres e-mail-küldés utáni napló- vagy audithiba nem érvénytelenítheti a már kiküldött új PIN-t.

## Valós e-mail teszt

Ideiglenes csomaggal és a beállított Drive SMTP tesztcímzettel:

- Drive SMTP profil: PASS;
- jogosulatlan e-mail elutasítás: PASS;
- elutasítási audit: PASS;
- jogosult PIN-helyreállítási e-mail: PASS;
- provider message ID: létrejött;
- PIN-hash változás sikeres küldés után: PASS;
- második kérés 10 perces rate limitje: PASS;
- rate-limit audit: PASS;
- tesztcsomag törlése: PASS;
- megmaradt tesztcsomag: 0.

## Forrásszintű ellenőrzés

- DROP 0.9.2 szerződés: 23/23 PASS;
- célzott ESLint: PASS;
- TypeScript: PASS;
- új adatbázis-migráció: nem szükséges.

## Mentés

- forrásmentés: `/root/dimprover/backups/drop_v092_access_landing_pin_20260804_224619`;
- aktiválási mentés: `/root/dimprover/backups/drop_v092_release_20260805_055525`;
- publikus route hotfix mentés: `/root/dimprover/backups/drop_v092_pinroute_hotfix_20260805_062713`;
- release manifest: `/root/dimprover/.dimprover/releases/drop-v092-release.json`;
- rollback script: `/root/dimprover/scripts/rollback-drop-v092-release.sh`.

## Production build és éles ellenőrzés

- végleges build: `aFb7RffMl_D2YAX6xnu5x`;
- Next.js 16.2.6 production build: PASS;
- 88 oldal generálása: PASS;
- 67 standalone chunk: PASS;
- publikus PIN-helyreállítási route: HTTP 202;
- publikus worker API: HTTP 404;
- publikus admin API: HTTP 404;
- éles SMTP PIN-kézbesítés: PASS;
- PIN-hash változás csak sikeres küldés után: PASS;
- jogosulatlan cím és rate limit audit: PASS;
- desktop/tablet/mobil felület: PASS;
- mobil vízszintes túlcsordulás: 0;
- konzolhiba, oldalhiba, sikertelen kérés: 0 / 0 / 0;
- tesztcsomag-maradvány: 0.

A publikus route kezdetben kimaradt a Drop hostvédelmi allowlistből, ezért a böngésző 404-et kapott. A végleges hotfix kizárólag az `/api/drop/access/pin-recovery` útvonalat engedélyezi; az admin- és worker API-k továbbra is rejtettek.
