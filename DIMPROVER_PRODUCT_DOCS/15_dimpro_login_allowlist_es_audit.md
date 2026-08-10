# DIMPRO OTP engedélyezési lista és belépési audit

Dátum: 2026-07-18
Állapot: éles MVP biztonsági korlátozás

## Cél

Az `app.dimpro.hu` felületre ideiglenesen kizárólag a tulajdonosi e-mail-cím léphessen be. Minden más e-mail-címhez tartozó kódkérés és kódellenőrzés blokkolódjon, és a próbálkozás megjelenjen a licencadmin auditfelületén.

## Engedélyezett e-mail

A lista szerveroldali környezeti változóban található:

```env
DIMPRO_APP_ALLOWED_EMAILS=keseruben90@gmail.com
```

Több cím később vesszővel választható el, de jelenleg csak egy cím engedélyezett.

## Szerveroldali védelem

A login kliens már nem közvetlenül hívja a Supabase OTP-küldést. Az új szerveroldali folyamat:

1. `POST /api/dimpro-auth/request-otp`
2. e-mail normalizálása;
3. engedélyezési lista ellenőrzése;
4. tiltott cím esetén 403 válasz és auditnapló;
5. engedélyezett cím esetén Supabase OTP küldés;
6. eredmény naplózása.

A kódellenőrzés:

1. `POST /api/dimpro-auth/verify-otp`
2. e-mail ismételt engedélyezési ellenőrzése;
3. hatjegyű token ellenőrzése;
4. Supabase OTP hitelesítés;
5. session cookie létrehozása;
6. sikeres vagy sikertelen eredmény naplózása.

A `proxy.ts` az `app.dimpro.hu` védett útvonalain a már létrejött Supabase session e-mail-címét is ellenőrzi. Nem engedélyezett session esetén a felhasználó visszakerül a login oldalra.

## Auditnapló

Fájl:

`.dimprover/data/dimpro-login-attempts.log`

Tárolt mezők:

- időpont;
- e-mail-cím;
- engedélyezett vagy tiltott állapot;
- művelet: OTP-kérés, OTP-ellenőrzés vagy session-blokkolás;
- eredmény;
- IP-cím;
- user agent / böngésző;
- host/domain;
- referer;
- szolgáltatási vagy ellenőrzési hibaüzenet.

## Licencadmin felület

Útvonal:

`https://license.dimpro.hu/admin/dimpro-belepesek`

Elérés:

- Licencadmin dashboard → `DIMPRO belépési napló`
- Fejlesztői kezdőlap → `DIMPRO belépési napló`
- Admin belépési napló oldal → `DIMPRO belépési napló`

Funkciók:

- összes esemény;
- tiltott próbálkozások száma;
- sikeres belépések száma;
- egyedi tiltott e-mail-címek és IP-címek;
- aktuális engedélyezett e-mail-lista;
- szűrés csak tiltott vagy csak sikeres eseményekre;
- keresés e-mail, IP, domain, böngésző és eredmény alapján.

Az API kizárólag érvényes licencadmin kulccsal olvasható:

`GET /api/license/dimpro-login-attempts`

## Biztonsági elv

A frontend korlátozása önmagában nem elegendő. Az engedélyezési ellenőrzés ezért három ponton történik:

1. OTP-kérés előtt;
2. OTP-kód ellenőrzése előtt;
3. védett DIMPRO oldal megnyitásakor a proxyban.

A Supabase anon kulcs közvetlen használatával létrehozott idegen session sem ad hozzáférést az `app.dimpro.hu` védett felületeihez.

## Későbbi fejlesztés

A kézi környezeti változó helyett később adatbázisos felhasználó- és meghíváskezelés készül:

- meghívott felhasználók;
- szerepkörök;
- aktív, felfüggesztett és lejárt állapot;
- projekt- és moduljogosultság;
- meghívási e-mail;
- auditnapló és adminisztrátori jóváhagyás.

## Éles ellenőrzés - 2026-07-18

Sikeres tesztek:

1. tiltott e-mail OTP-kérés: HTTP 403;
2. tiltott e-mail kódellenőrzés: HTTP 403;
3. tiltott esemény bekerült a JSONL auditnaplóba;
4. licencadmin API kulcs nélkül: HTTP 401;
5. licencadmin API érvényes kulccsal: HTTP 200;
6. engedélyezett lista helyesen csak a tulajdonosi címet adja vissza;
7. licencadmin oldal: HTTP 200, szűrők és összesítők megjelentek;
8. engedélyezett e-mail OTP-kérése: HTTP 200;
9. engedélyezett e-mail hibás kódja: HTTP 400, auditnapló készült;
10. védett DIMPRO oldal session nélkül: login redirect;
11. böngészős tiltott e-mail teszt: tiltó üzenet megjelent;
12. TypeScript és production build sikeres.

A teljes repository lintben továbbra is fennáll a korábbi `scripts/load-next-env.cjs` CommonJS import szabályhiba. Az új belépési és auditfájlok célzott lintje hibamentes; két meglévő Hook-figyelmeztetés maradt az admin naplóoldalakon.

## Identity Core 0.2.0 utódmodell – 2026-08-10

A dokumentumban szereplő tulajdonosi allowlist már nem a végleges jogosultsági modell. Az Identity Core 0.2.0-tól fallbackként marad meg. A normál szervezeti felhasználók adatbázisos meghívással, aktív tagsággal és érvényes szervezeti licenccel kapnak OTP-belépési jogot. A részletes utódmodell: `126_dimpro_identity_org_license_v020_hage_invites.md`.
