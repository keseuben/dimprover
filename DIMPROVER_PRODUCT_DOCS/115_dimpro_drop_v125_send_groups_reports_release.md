# DIMPRO Drop 1.2.5 – Send, képcsoport és riport release

Dátum: 2026-08-08
Állapot: RELEASED – private pilot
Éles URL: https://drop.dimpro.hu
Éles release: `.next-v125-release-final`
BUILD_ID: `ivMzYTCL57pVKLlMYYPDJ`
Rollback release: `.next-projectgate-drive-ui-20260808-release-final`
Fejlesztési Központ: `version_48e48048-9be`

## Elkészült funkciók

- e-mailes képelőnézet legfeljebb 30 képig;
- e-mailben teljes címzettlista az adatvédelmi kapcsoló szerint;
- kattintható képelőnézetek biztonságos DIMPRO képmegnyitással;
- mentett Send-kód törlése 2 másodperces nyomva tartással;
- Gyors KépSend: saját e-mail automatikus alapcímzett + legfeljebb 5 további címzett;
- felhasználói DIMPRO Send-címjegyzék létrehozás, módosítás és törlés funkcióval;
- licencenkénti címjegyzék-limit (`max_saved_contacts`), alapérték 10;
- aktuális feltöltési szabályzat kötelező elfogadása az első 3 használatkor;
- logikai képcsoportok külön aktív feltöltési csoporttal és külön megjelenítési szűrővel;
- `Összes`, `Csoport nélkül` és csoportonkénti nézet;
- csoportszámlálók és kamera/galéria célcsoport-váltó;
- rendezett fájlnév: általános megnevezés + opcionális csoportutótag + képenkénti felülírás;
- opcionális fizikai csoportmappák ZIP és DIMPRO Drive exportnál;
- A4-es PDF csomagriport;
- UTF-8 TXT export fájlnevekkel, csoportokkal és megjegyzésekkel;
- PDF és TXT automatikus beemelése a ZIP gyökerébe;
- teljes hozzáférési token helyett kizárólag maszkolt tokenhivatkozás a riportokban.

## Adatbázis

Additív migráció: `supabase/DIMPRO_DROP_125_SEND_UX_REPORTS.sql`.

Új entitlement mezők:
- `max_saved_contacts`
- `upload_rules_acceptance_count`
- `upload_rules_version`
- `upload_rules_last_accepted_at`

Új workflow mezők:
- `export_groups_as_folders`
- `append_group_name_to_filename`

## Ellenőrzések

- TypeScript: PASS
- teljes ESLint: 0 error, 108 meglévő warning
- DROP 1.2.5 contract: 21/21 PASS
- e-mail + ZIP egységteszt: 3/3 PASS
- Identity kontakt + szabály DB E2E: 16/16 PASS
- Identity consumer contract: 55/55 PASS
- UX regresszió: 12/12 PASS
- proxyjavítás utáni teljes böngészős candidate E2E: 28/28 PASS
- immutable release külön portos health: PASS
- éles HTTPS `/`, `/send`, `/open`: 200
- éles Drop health: `DROP 1.2.5`, core/Send/Identity/database READY
- éles Identity health: `0.1.0`, READY
- éles `/api/dimpro-identity/send/contacts` jogosultság nélkül: 401, tehát az útvonal elérhető, de védett
- éles mobil `/send` headless browser smoke: PASS, nincs horizontal overflow és nincs browser/console error.

## Release közbeni észrevétel

Az első PM2 restart során kiderült, hogy a `dimprover` folyamat `NEXT_DIST_DIR` környezeti változója a korábbi közös release-re volt rögzítve. Emiatt a pointerváltás önmagában nem váltotta át a futó buildet. Az aktiválás során a PM2 `NEXT_DIST_DIR` értéke is `.next-v125-release-final` értékre lett frissítve `--update-env` használatával. A végleges live ellenőrzések már az új BUILD_ID-val futottak.

## Rollback

Rollback esetén mindkettőt vissza kell állítani:
1. `.dimprover/active-next-release` → `.next-projectgate-drive-ui-20260808-release-final`
2. PM2 `NEXT_DIST_DIR` → `.next-projectgate-drive-ui-20260808-release-final`
3. koordinált `pm2 restart dimprover --update-env`

Aktiválási backup: `backups/drop_v125_activation_20260808_115600`.

## Release besorolás

A DROP 1.2.5 private-pilot release. A `generalAvailabilityReleased` továbbra is `false`; nem tekintendő végleges GA kiadásnak.
