# 06 UI / UX szabályok

## Általános elvek

- terepi használatra is alkalmas nagy érintési felületek
- erős státuszjelzések
- modulon belüli gyors visszajelzések
- export előtt kritikus hiányosságok jelzése

## HexPin marker UX

- a marker szakági színnel jelenik meg
- kijelöléskor szerkesztőpanel használható
- exportkeret vizuálisan látszik
- hiányzó tervrészlet-kép esetén borostyán figyelmeztetés jelenik meg
- kész állapot esetén cián / pozitív státusz jelenik meg

## Jobb oldali board és gyorsindító sáv szabályai – 2026-07-10

- A jobb oldali fix board a globális váltók és kontextusadatok helye: főmodulváltó, projektválasztó, naptár, éves heti áttekintő, kapcsolatok, határidők és feladatok.
- Összecsukott állapotban a jobb oldali sáv keskeny quick railként működik, nem csak díszítő ikoncsíkként.
- Minden quick rail ikon kattintható legyen, egyértelmű aktív állapottal, hover visszajelzéssel és tooltip címmel.
- A havi és éves naptár külön gomb legyen, külön ikonlogikával. A havi naptár nap/hét bontást, az éves naptár heti áttekintést mutasson.
- A naptár lapozó gombjai nagyobb, önálló kattintási felületet kapjanak, hogy ne vesszenek el a kis widgetben.
- A quick rail flyout kártyák húzhatók és rögzíthetők lehetnek, de mindig legyen külön bezárás és fix panel megnyitás gomb.
- A főmodulváltó elsődleges globális helye továbbra is a jobb oldali board teteje, nem az oldalspecifikus modulfejléc.

## Projekt-naptár

A közös projekt-naptár a DOCK munkatér tetején jelenik meg. Desktopon heti hétoszlopos nézetet és jobb oldali közelgő listát használ. Tablet/mobil nézetben a heti rács vízszintesen görgethető, a közelgő lista alá kerül. A naptár minden megjelenő szövege legalább 12 px, az általános leíró szövegek 13–14 px méretűek.

### Naptári hét kiemelése

A heti projekt-naptár fejlécében az ISO 8601 szerinti naptári hét sorszáma nagy méretben, halvány türkiz háttérjellegű kártyán jelenik meg. A szám mellett kisebb `NAPTÁRI HÉT` és hét-év felirat látható. A jelölés legyen könnyen észlelhető, de ne legyen erősebb vizuális fókuszú az eseményeknél. Mobilon is legalább 34 px-es hét-szám használatos.

## DIALOG munkatér

Desktopon a DIALOG bal oldali témakártya-listát és jobb oldali részlet-/hozzászóláspanelt használ. Tablet és mobil nézetben a két panel egymás alá kerül. Minden szöveg legalább 12 px. A témakártya kódja, típusa, címe, szakága, felelőse, státusza és prioritása a lista megnyitása nélkül felismerhető.

## Heti naptár egységes időszakfejléc

A hét száma és a kezdő–záró dátum egyetlen keretezett elemben jelenik meg: `31. hét | 2026. július 27. – augusztus 02.`. A hétfelirat hangsúlyosabb, de nem lehet aránytalanul nagy; desktopon/tableten 23 px, mobilon 20 px. Külön `NAPTÁRI HÉT` segédfelirat nem használható.

## DECIDE munkatér

Desktopon a DECIDE bal oldali döntésilistát és jobb oldali részletes workflow-panelt használ. A hatáskártyákon a költség, határidő, felelős, dokumentum és DIALOG kapcsolat azonnal látható. A jóváhagyási szakaszok számozott, elkülönített kártyák; az aktuális szakasz finom türkiz kiemelést kap. Tablet és mobil nézetben a lista és a részletek egymás alá kerülnek. Minden megjelenő szöveg legalább 12 px.

## DIARY munkatér

Desktopon bal oldali napi naplólista és jobb oldali részletes napló-/eseménypanel jelenik meg. A fejléc alatt állandóan látható, hogy a DIARY nem helyettesíti a hivatalos e-építési naplót. Az időjárás, létszám, akadály, munkavédelem, ellenőrzés és események elkülönített kártyákat kapnak. Tablet és mobil nézetben a panelek egymás alá rendeződnek. Minden megjelenő szöveg legalább 12 px.
