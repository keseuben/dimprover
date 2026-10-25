# v0.1.105 – kézi vezérlés javítás

Az engedélyre váró, még el nem indított kérés nem zárja el a kézi helyreállítást és az új utasítást. A ténylegesen folyamatban lévő, megőrzött eredményű és bizonytalan kimenetelű műveletek továbbra is blokkolnak.

Az üres szerkesztő látható szövegének leolvasása nem esik vissza a rejtett textContent helykitöltőjére. A valódi felhasználói piszkozat változatlanul védett.

A folytatási előnézet a csevegés későbbi felhasználói tiltásait is megőrzi; régebbi protokollú előnézet újrakészítés nélkül nem küldhető.

A Drive task hibás Git-forrásalapja külön javításra vár.
