# DIMPRO Drop biztonság és adatkezelés

**Verzió:** DROP 0.2.0

## Kötelező hozzáférési szabályok

- új csomagot csak hitelesített belső DIMPRO felhasználó hozhat létre;
- a nyilvános host nem listázhat csomagokat és nem kezelhet adminműveleteket;
- külön token készül feltöltéshez, megtekintéshez, letöltéshez és riporthoz;
- nyers token nem tárolható adatbázisban;
- PIN nem kerülhet URL-be;
- PIN-próbálkozást csomag-, token- és IP-szinten korlátozni kell;
- a tiltott feature flaget az API-nak is el kell utasítania.

## Fájlbiztonsági kapu

A későbbi feltöltési motor aktiválásának feltétele:

- kiterjesztés-, MIME- és magic-byte ellenőrzés;
- fájlnév tisztítása és path traversal tiltása;
- végrehajtható és veszélyes fájltípusok tiltása;
- kettős kiterjesztés felismerése;
- ZIP bomb, symlink és kibontott méret limit;
- makrós Office-fájlok kezelési szabálya;
- vírusellenőrzés és karantén;
- kizárólag `ready` státuszú fájl tölthető le.

## Adatminimalizálás

- objektumkulcsban nem szerepelhet név, e-mail vagy indokolatlan személyes adat;
- GPS EXIF alapértelmezetten eltávolítandó;
- készítési idő külön beállítás szerint megtartható;
- IP-adat kizárólag biztonsági/audit célra, rövid távon titkosítva, hosszabb távon maszkolva vagy hash-elve kezelhető;
- a nyilvános shell jelenleg nem fogad és nem tárol adatot.

## Megőrzés

Tervezett alapértékek:

- ideiglenes csomagfájlok: 7 nap;
- hibakezelési türelmi idő: 72 óra;
- eseménynapló: 90 nap;
- hibás PIN-események: 30 nap;
- e-mail napló: 1 év;
- PDF-riport: külön adminbeállítás szerint.

## Lejárati törlési szabály

Törlés csak akkor indítható, ha:

1. a csomag lezárult;
2. a végleges riport sikeresen elkészült;
3. a riport objektumtárba került;
4. a címzettek kiküldési feladata sikeresen lezárult;
5. nincs futó vagy retry állapotú kapcsolódó job.

Hiba esetén a csomag normál felhasználói hozzáférése lezárható, de az objektumok nem törölhetők a türelmi időn belüli helyreállítás előtt.

## DROP 0.1.0 biztonsági állapot

- upload feature flagek: kikapcsolva;
- release gate: alapértelmezetten kikapcsolva;
- Drop host belső útvonalai: tiltva;
- nyilvános API: csak health és feature állapot;
- tárhelytitok: nincs frontendben;
- valós ügyféladat-feltöltés: nem lehetséges.

## DROP 0.2.0 hozzáférési védelem

- PIN: hat számjegy, egyedi salt és scrypt hash;
- capability-token: 32 bájtos véletlen érték, célhoz kötött prefix, HMAC-SHA256 adatbázishash;
- publikus PIN-kapu: csak `view` grantot adhat;
- upload/download/report jog: csak külön capability-linkből származhat;
- rate limit: 15 perces ablakban IP-szinten 20, csomag+IP PIN-szinten 5, token+IP szinten 10 sikertelen próbálkozás;
- hálózati metaadat: HMAC fingerprint, nem nyers IP;
- tokenes útvonal hibája nem fedheti fel, hogy a csomag vagy a token melyik része volt hibás;
- lezárt, lejárt vagy nem aktív csomag minden tokentípusnál elutasítandó.

A HMAC- és session titkok 2026. augusztus 1-jén létrejöttek a szerver védett `.env.local` fájljában. Értékük dokumentációban nem szerepel.

## DROP 0.2.0 tranzakciós és adminbiztonság

- a nyers PIN és a nyers capability-token csak a szerver memóriájában, egyszeri válaszban létezhet;
- az atomi csomaglétrehozó SQL elutasít minden `pin`, `rawPin`, `rawToken`, `raw_token`, `rawTokens` vagy teljes link mezőt;
- az adatbázis kizárólag scrypt PIN-hash/só és HMAC-SHA256 tokenhash értékeket tárol;
- a purpose-specifikus link újrakiadása ugyanabban a tranzakcióban visszavonja az előző aktív tokent;
- tokenhasználat, token-visszavonás és csomagállapot-váltás sorzárolással és audit eseménnyel történik;
- minden adatbázis RPC `SECURITY DEFINER`, rögzített `search_path` és kizárólag `service_role` végrehajtási jog mellett működik;
- `public`, `anon` és `authenticated` szerep nem kap RPC-végrehajtási jogot;
- a bootstrap nem hoz létre anonim vagy kliens RLS policyt;
- a teljes bootstrap explicit `BEGIN` / `COMMIT` tranzakcióban fut;
- a `drop_schema_meta` pontos verziójelölő nélkül a package engine nem minősül késznek;
- a nyilvános Drop host az admin API-kat és belső alkalmazásútvonalakat 404 válasszal blokkolja;
- tokenes URL-eknél az Nginx access log ki van kapcsolva, a proxy nem naplózza a teljes pathname-t;
- admin állapotváltás, új link kiadása és token-visszavonás megerősítést kér;
- az új teljes link csak egyszer jelenik meg, később kizárólag tokenhint látható.

Az aktiválás utáni integrációs teszt csak pontos, kézi engedélyező környezeti értékkel indulhat, zárt release gate-et követel, nem hoz létre fájlt, és a tesztcsomagot `finally` ágban automatikusan törli és visszaellenőrzi.

