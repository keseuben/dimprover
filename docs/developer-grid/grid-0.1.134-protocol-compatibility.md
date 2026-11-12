# Grid 0.1.134 – helyreállító üzenet gépi mezőnevei

A Fresh source proof mezőcímet a kézi send-draft azonosságellenőrzése feldolgozza, ezért a gépi mezőnév változatlan. A magyarázó szöveg magyar.

A context-editor-runtime regressziós teszt a generált helyreállító üzenetet a tényleges runManualControl függvény send-draft ágán ellenőrzi. A helyes üzenet elfogadható, az eltérő forrásigazolás nem küldhető el. A teszt izolált fixture, nincs élő csevegőüzenet.

A kiadás tartalmazza a grid-0.1.133-resource-retry.md elfogadási feltételeit és erőforrás-újrapróbálási javítását. A 0.1.133 nem átadott kiadás; az élő memória miatti folytatás, FILE EXECUTION és DEV DELIVERY elfogadása továbbra is külön igazolandó.
