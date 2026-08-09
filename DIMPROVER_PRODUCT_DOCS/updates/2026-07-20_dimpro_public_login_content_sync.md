# DIMPRO nyilvános kezdőlap és login tartalmi egységesítés

Dátum: 2026-07-20

## Módosítások

- A `dimpro.hu` nyilvános kezdőlap új „Belépés” gombot kapott, amely az `https://app.dimpro.hu/login` oldalra vezet.
- A gomb asztali nézetben a fejléc műveletei mellett, kisebb képernyőn jól elérhető lebegő műveletként jelenik meg.
- Az `app.dimpro.hu/login` DIMPRO tartalma a `dimpro.hu` jelenlegi termékpozicionálásához igazodott.
- A korábbi „Digitális műszaki projektvezérlő rendszer” megnevezés helyett a DIMPRO általános üzleti, műszaki és vállalati munkafolyamatokat támogató appcsaládként jelenik meg.
- A login oldal már nem állítja, hogy az első kódkérés automatikusan jogosult fiókot hoz létre.
- A felület egyértelműen jelzi, hogy a belépéshez engedélyezett DIMPRO-hozzáférés és megfelelő moduljogosultság szükséges.
- A login oldal visszalépési hivatkozást kapott a `dimpro.hu` nyilvános oldalra.
- Az OTP-kérés és OTP-ellenőrzés hálózati hibakezelése felhasználóbarát üzenettel bővült.

## Érintett fájlok

- `app/page.tsx`
- `app/login/page.tsx`
- `app/login/DimproAppOtpLogin.tsx`

## Biztonsági mentések

- `backups/app-page-before-dimpro-login-button-20260720.tsx`
- `backups/login-page-before-dimpro-content-sync-20260720.tsx`

A korábbi `app/login/DimproOtpLogin.tsx` komponens változatlanul megmaradt, így a korábbi DIMPRO login megjelenés is visszaállítható.
