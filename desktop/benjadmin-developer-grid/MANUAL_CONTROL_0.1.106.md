# BENJADMIN Developer Grid 0.1.106 – új fejlesztési kör

A **FOLYTATÁS** ugyanazt a feladatot folytatja, a korábbi korlátozásaival.
Egy csak állapotellenőrzésre létrehozott feladat ettől nem válik fejlesztési megbízássá.

1. A **KÉZI VEZÉRLÉS** lapon válaszd ki a kódmérnököt és a régi feladatát.
2. Nyisd le az **ÚJ FEJLESZTÉSI FELADAT KÉZI INDÍTÁSA** részt. Írd le a valódi új munkát és a korlátait; ellenőrizd a projektet és a modult.
3. Közös szolgáltatásfájl módosításához a külön mezőben add meg a jóváhagyandó pontos relatív fájlútvonalakat. Más modul és védett fájl nem engedélyezhető.
4. Kattints a **RÉGI TASK LEVÁLTÁSÁNAK ELŐNÉZETE** gombra. Ellenőrizd az új forrást, a feladat szövegét és a fájlokat.
5. Az új kör előkészítése a tiszta, első fázisú régi feladatot sikertelenként lezárja. A régi forrás és napló megmarad. Külön új task/session készül, új BOOT ACK szükséges. Üzenet még nem megy ki.
6. A kézi lap ellenőrzött gépi piszkozatküldésével küldd el az új Launch Packetet kizárólag a kijelölt cellának. A validált BOOT ACK után külön engedélyezd a szükséges DEV végrehajtást.
7. Ha az átállítás eredménye bizonytalan vagy a worker foglalt, a megőrzött átállítás folytatása gombot használd. Újraindítás után is ugyanaz a kérés folytatódik.

A Drive új munkája a regisztrált Drive-fejlesztési ágból indul. Egy régi, eltérő forrásra adott BOOT ACK nem vihető át.
A program minden kódmérnöknél megőrzi a kézi/automatikus beállítást; az új kör előkészítése kézi módot választ.

**Kiadási határ:** az automatikus fejlesztés–commit–build–átadás teljes folyamatát külön élő próbával kell igazolni. A sikeres üzenetküldés önmagában nem bizonyítja ezt.
