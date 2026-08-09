# DIMPRO Felmérő v0.8.4.3.3 – Kézi helyiség és tervlapi interakció

Dátum: 2026-07-30

## Cél

A PDF tervlap alapú helyiségfelismerés használhatósági javítása olyan alaprajzokon, ahol:

- nagyon kicsi helyiségeket eltakarna a helyiségcímke;
- az automatikus felismerés nem talál meg minden helyiséget;
- a felismert helyiség vagy címke helyzete kézi korrekciót igényel;
- az egyszeres kattintás nem válthat automatikusan nagyított nézetre.

## Elkészült funkciók

### Kis helyiségek címkézése

- A helyiségcímke mérete a nézeti nagyítástól függetlenül olvasható marad.
- Kis helyiségnél a címke automatikusan a helyiségen kívül jelenhet meg.
- A helyiség és a címke között szaggatott callout-vonal mutatja a kapcsolatot.
- A címke külön húzható és a kézi pozíció a tervdokumentációs projektadatban mentődik.

### Hiányzó helyiség kézi felvétele

- Külön `Nem felismert helyiség kézi felvétele` és `Hiányzó helyiség kézi rajza` művelet készült.
- A helyiség sarkai kattintással vehetők fel.
- A poligon az Enter billentyűvel vagy a `Poligon lezárása` gombbal menthető.
- Backspace: utolsó pont visszavonása.
- Escape: kézi rajzolás megszakítása.
- A létrehozott helyiség `manualDrawing` adatforrással és ellenőrzendő státusszal készül.

### Helyiség és címke mozgatása

- A kijelölt helyiség közepén külön mozgatófogantyú jelenik meg.
- A helyiség teljes poligonja húzással mozgatható.
- A címke külön mozgatható.
- A címke a helyiséggel együtt mozog, ha már kézzel elhelyezték.
- A kézi korrekció adatforrása `userCorrected`.
- A mozgatás közben előnézeti geometria jelenik meg, majd a pointer felengedésekor egyetlen mentési művelet történik.

### Kattintási logika

- Egyszeres kattintás: csak kijelölés.
- Dupla kattintás: a kiválasztott helyiségre nagyítás és középre igazítás.
- Ugyanarra a helyiségre ismételt dupla kattintás: az előző nagyítás és görgetési pozíció visszaállítása.
- A jobb oldali `Rajzon mutat és nagyít` gomb ugyanazt a fókusz-visszaállítás logikát használja.

## Adatmodell

A `SurveyPlanSuggestion` opcionális mezővel bővült:

- `labelPosition?: SurveyNormalizedPoint | null`

A meglévő projektek automatikusan `null` címkepozícióval migrálódnak. A `.dimpro` projekt séma változatlanul:

- `dimpro.property-survey.v0.8.4.3`

## Tesztek

- TypeScript: hibamentes.
- Célzott ESLint: hibamentes.
- Domain- és integrációs teszt: 484/484.
- PDF tervlap E2E: 15/15.
- Történeti energetikai E2E: 40/40 és 42/42.
- Responsive regresszió: 15/15.
- Alap Felmérő-, PDF- és DXF-regresszió: sikeres.
- Tablet álló és fekvő nézet: sikeres.
- Candidate assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.

## Build és mentés

- Candidate build: `GMumGBwPigeq4v7IGbVbh`.
- Forrásbackup: `backups/property_survey_v08433_manual_room_label_interaction_20260730_140038`.

## Következő fejlesztési szint

`v0.8.4.4`:

- poligon csúcspontok egyenkénti mozgatása;
- helyiségek összevonása és kettévágása;
- külső határoló falak automatikus javaslata a jóváhagyott helyiségek, PDF falvonalak és fűtöttségi topológia alapján;
- falszakasz végpontmozgatás, meghosszabbítás, kettévágás, összekötés és kézi pótlás;
- külső levegő / talaj / fűtetlen tér / szomszédos tér határolási besorolás;
- részletes nyílászáró-javaslatok.

A `v0.8.5` továbbra is kizárólag a valós WinWatt-próbához van fenntartva.

## Élesítés

- Éles build: `GMumGBwPigeq4v7IGbVbh`.
- Rollback: `.next_before_property_survey_v08433_20260730_175540`.
- HTTPS: 200.
- Éles PDF tervlap E2E: 15/15.
- Éles történeti energetikai E2E: 40/40 és 42/42.
- Éles responsive regresszió: 15/15.
- Éles tablet álló és fekvő teszt: sikeres.
- Éles assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.
- A PM2 hibanapló az élesítés után nem kapott új bejegyzést.
