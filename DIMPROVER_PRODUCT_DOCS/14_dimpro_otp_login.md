# DIMPRO központi OTP belépés – elsődleges bejelentkezési mód

Eredeti élesítés: 2026-07-18
Tartalmi és UI-frissítés: 2026-07-20
Állapot: élesítve az `https://app.dimpro.hu/login` útvonalon.

## 1. Döntés

A DIMPRO központi belépési felület e-mail + hatjegyű egyszer használatos kódos bejelentkezést használ. Kötelező jelszó nincs.

A belépési folyamat:

1. A felhasználó megadja az e-mail-címét.
2. A szerver ellenőrzi, hogy az e-mail-cím rendelkezik-e engedélyezett DIMPRO-hozzáféréssel.
3. Engedélyezett cím esetén a rendszer hatjegyű egyszer használatos kódot küld.
4. A kód beírása után a rendszer Supabase sessiont hoz létre.
5. A proxy a session e-mail-címét is ellenőrzi.
6. A DIMPRO felhasználó a `/account/modules` központi modulválasztóra kerül.

A Supabase Auth felhasználó technikailag szükség esetén létrejöhet az első engedélyezett OTP-folyamat során, de ez nem jelent automatikus DIMPRO-jogosultságot. A hozzáférést mindig a szerveroldali engedélyezési lista, később pedig a felhasználói és licencadatbázis szabályozza.

## 2. Tartalmi és arculati irány

A login oldal a `dimpro.hu` nyilvános oldal jelenlegi termékpozicionálását követi:

- DIMPRO megnevezés;
- „Digitális munkafolyamat-rendszerek vállalkozásoknak” alcím;
- kisebb digitális appok napi üzleti, műszaki és vállalati munkafolyamatokra;
- közös, jogosultságkezelt DIMPRO-fiók;
- türkiz–zöld DIMPRO arculat;
- sötét márkapanel és világos belépési munkafelület;
- reszponzív mobil- és asztali elrendezés;
- visszalépési lehetőség a `https://dimpro.hu` nyilvános oldalra.

A korábbi „Digitális műszaki projektvezérlő rendszer” megnevezés ezen a DIMPRO belépési oldalon már nem használható, mert az a DIMPRO jelenlegi, többféle vállalkozási és műszaki appot összefogó termékirányát nem írja le pontosan.

## 3. Funkciók

- E-mail-cím megjegyzése a böngészőben.
- Hatjegyű numerikus kódmező.
- Automatikus belépés a hatodik számjegy beírásakor.
- Manuális Belépés gomb.
- Kód újraküldése 60 másodperces várakozással.
- Barátságos hibaüzenetek hibás, lejárt vagy túl gyakori kódkérés esetén.
- Külön hálózati hibaüzenet, ha a szerver nem érhető el.
- A Beérkezett, Promóciók és Spam mappák ellenőrzésére figyelmeztetés.
- Jogosultsági tájékoztatás már a login panel fejlécében és az űrlap alatt.
- A DIMPROVER kék OTP felülete változatlan marad.

## 4. Jelszókezelési döntés

A jelszó technikailag később másodlagos belépési módként hozzáadható, de nem szükséges az alap DIMPRO használathoz. Az elsődleges rendszer jelszómentes marad, mert:

- nincs elfelejtett vagy újrahasznált jelszó;
- nincs külön kötelező jelszó-visszaállítási folyamat;
- az egyszer használatos kód az engedélyezett e-mail-címhez kötődik;
- megegyezik a DIMPROVER jelenlegi OTP munkamódszerével.

Későbbi opcionális funkció lehet a „Jelszó beállítása” az account beállításokban azoknak, akik másodlagos belépési módot kérnek. Ez nem válthatja le az OTP-t és nem lehet kötelező.

## 5. Érintett fájlok

- `app/page.tsx` – a `dimpro.hu` nyilvános kezdőlap belépési gombja;
- `app/login/page.tsx` – domain alapján a DIMPRO vagy DIMPROVER login kiválasztása;
- `app/login/DimproAppOtpLogin.tsx` – aktuális DIMPRO login tartalom és OTP kliens;
- `app/login/DimproOtpLogin.tsx` – korábbi DIMPRO login változat, visszaállítási forrásként megőrizve;
- `app/login/DimproverOtpLogin.tsx` – változatlan DIMPROVER login.

## 6. Biztonsági kapcsolat

A login kliens nem közvetlenül hívja a Supabase OTP-küldést. A szerveroldali végpontok:

- `POST /api/dimpro-auth/request-otp`
- `POST /api/dimpro-auth/verify-otp`

Az engedélyezési és auditlogika részletes leírása:

- `DIMPROVER_PRODUCT_DOCS/15_dimpro_login_allowlist_es_audit.md`

## 7. Ellenőrzés – 2026-07-20

- `npx tsc --noEmit`: sikeres.
- Az érintett fájlok célzott ESLint-ellenőrzése: hibamentes.
- Teljes `npm run lint`: 0 hiba; a repository más, korábbi fájljaiban 112 figyelmeztetés maradt.
- Next.js production build elkészült, a standalone csomag létrejött.
- Az elkészült szerveroldali build tartalmazza az új DIMPRO login szövegeket.

## 8. Backup és rollback

Backup fájlok:

- `backups/app-page-before-dimpro-login-button-20260720.tsx`
- `backups/login-page-before-dimpro-content-sync-20260720.tsx`
- a korábbi `app/login/DimproOtpLogin.tsx` komponens változatlanul megmaradt.

Rollback:

1. Az `app/page.tsx` és `app/login/page.tsx` visszaállítása a backup fájlokból.
2. Az aktuális DIMPRO komponens importjának visszaállítása `DimproOtpLogin` értékre.
3. `npx tsc --noEmit`.
4. `npm run build`.
5. PM2 `dimprover` újraindítás.
