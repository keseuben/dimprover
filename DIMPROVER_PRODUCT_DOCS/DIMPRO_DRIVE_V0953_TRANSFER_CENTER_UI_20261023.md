# DIMPRO Drive V0.9.53 – Transfer Center UI, DEV forrás

**Dátum:** 2026-10-23
**Fejlesztési környezet:** DEV ONLY; PROD DENY.
**V0.9.53 állapot:** SOURCE / ellenőrzés alatt, NEM aktív a publikus DEV felületen.
**Publikus Drive:** V0.9.52 (BUILD01 1402cd6e5, 3413), 2026-10-23-án bekötve.

## V0.9.52 DEV böngészős aktiválás

- Az ellenőrzött BUILD01 b2 artifact: run `benjadmin-transfer-v0952-1402cd6e5-20261022-manual-build01-b2`, SHA-256 `43cf36ceaa96c9d0292082e29b0f0a679ba772dd9874f85e62a43e4a52573cfb`; build ID `gcR71rHsVAwbC8B1rk6vz`.
- A build csak új, elkülönített könyvtárba került: `/srv/dimpro-dev/candidates/drive-pilot/releases/1402cd6e5b74`.
- PM2: `dimpro-drive-v0952-multipart-1402cd6e5-p3413`, új, localhost-only 3413-as port; `DIMPRO_PRODUCTION_ACCESS=DENY`.
- Átállítás előtt: a régi V0.9.33 `c74326afd` a 3412-es porton online; az új candidate 3413-on 307 SSO, 401 védett Drive health, statikus JS 200; AUTH readiness 200, errorlog üres.
- Publikus Nginx: a drive.dev.dimpro.hu virtual host célportja 3412 → 3413, verziófejléce V0.9.52-re változott. `nginx -t` és reload PASS.
- Átállítás után: publikus `/drive` 307 SSO redirect, verziófejléc `1402cd6e5 DRIVE V0.9.52 TRANSFER MULTIPART OPT-IN DEV`, `X-DIMPRO-Production-Access: DENY`; új JS statikus 200; védett Drive health 401 bejelentkezés nélkül, központi AUTH ready 200. Új és korábbi PM2: online, 0 restart.
- Nginx előző konfigurációjának mentése: `/srv/dimpro-dev/config-backups/drive-v0933-before-v0952-20261023.conf`. A régi V0.9.33 3412-n továbbra is visszaállítható. Éles visszaállítási próba nem történt.
- A `NEXT_PUBLIC_SUPABASE_URL` megfelel a DEV hoston őrzött authoritative `/root/.dimpro-secrets/supabase-dev/project-url` jelölőnek, a Drive S3-bucket `-dev` végződésű. A PROD adatforrás független provenance-a továbbra sem teljesen igazolt; PROD-hoz nem nyúltunk.
- NINCS migráció, nincs új ClamAV limit; a Drive alap 100 MiB/fájl scan-gate megmarad. Multipart továbbra is opt-in, az eddigi webes kliens single PUT maradt.
- **Hitelesített felhasználóval teljes böngészős fájlfeltöltési E2E még szükséges.** Ez a read-only/unauthenticated smoke nem igazolja a teljes Drive workflow-t.

## V0.9.53 UI fejlesztések

1. A Transfer Center fejlécében az aktuális projekt neve látható a generikus Projekt Drive felirat helyett.
2. Négy vezérlő a lista szűrésére: Minden / Folyamatban / Jóváhagyásra vár / Figyelmet igényel. Darabszám és `aria-pressed` jelölés; az aktuális szűrésre vonatkozik a max. 60-as részlista is.
3. A vírusellenőrzés **legutóbb ismert** eredménye fájlonként elkülönítve: clean, szerverfeldolgozás, pending, infected, scan-failed, bizonytalan, még nem értékelt. Nincs kitalált vírusvizsgálati százalék, a hálózati byte%-tól külön.
4. Az átviteli sorok sebességet és feladatra becsült hátralévő időt mutatnak csak hiteles mért sebesség mellett. A már kész hálózati átvitelt nem mutatjuk 1 másodperc hátralévőként.
5. Kisegítő technológia: szűrőcsoport / állapotjelölés / üres találati nézet. Keskeny képernyőn a szűrők tördelődnek.
6. A fájlfeltöltés, jóváhagyás, scanner, auth, ACL és S3 multipart szerverfolyamat változatlan marad. Saját Drive közvetlen feltöltés továbbra sem része ennek a körnek.

## Ellenőrzés és kiadás

- Új `scripts/tests/dimpro-transfer-v0953-center-ui-contract.mjs`: fájlonkénti státuszösszesítés invariánsok és felületi struktúra.
- A V0.9.50 / 51 / 52 regressziós tesztek verzió-monoton kompatibilitási bővítést kaptak; a biztonsági követelmények változatlanok.
- TypeScript és ESLint, forrás-tesztek, `git diff --check` szükséges a végleges commit előtt.
- Kiadáshoz: ellenőrzött BUILD01 artifact, külön localhost candidate, hitelesített E2E, versioned Nginx cutover/rollback.
- **Központi Developer Grid változatlan**, az eltérő provenance nyilvántartása külön későbbi feladat. PROD DENY.
