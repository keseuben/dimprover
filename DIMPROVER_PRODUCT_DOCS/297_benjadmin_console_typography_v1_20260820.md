# BENJADMIN Fejlesztői Konzol — Typography V1

Dátum: 2026.08.20.
Környezet: DEV-only, PROD DENY.

## Cél

A Fejlesztői Konzol 1920×1080-as asztali használatban túl sok 6–10 px-es operatív szöveget jelenített meg. A Weekly Development Summary, projektportfólió, worker-kártyák, Közös Fejlesztői Csevegés, composer, AI Worker és kapcsolódó drawer/Terminal/Live Workspace felületek egységes, olvasható tipográfiai skálát kapnak.

## Tipográfiai tokenek

- micro: 11 px — kizárólag tömör metaadat, badge, technikai segédcímke;
- small: 12 px — másodlagos információ;
- body: 13 px — normál UI-szöveg és vezérlő;
- strong: 14 px — fő tartalmi szöveg, hangsúlyos érték;
- heading: 15 px — szekció- és fontosabb címszöveg;
- title: 16 px — nagyobb vezetői címekhez fenntartva.

A korábbi explicit 6–10 px-es fontméretek megszűnnek a `DeveloperConsole.module.css` modulban. A betűméret-emelés mellett a Weekly Summary és worker kártyák sűrűsége enyhén lazul, hogy a nagyobb szöveg ne torlódjon össze.

## Elfogadási feltételek

- nincs 6–10 px explicit operatív fontméret a konzol CSS-ben;
- Weekly Summary és portfólió minimum micro tokennel jelenik meg;
- topbar, projekt rail, worker panel, chat és composer hierarchikusan nagyobb méreteket használ;
- 1920×1080 jogosult böngészős smoke-ban nincs vízszintes body overflow vagy kliensoldali hiba;
- a meglévő Common Chat, Weekly Flow és külső worker funkciók nem regresszálnak.
