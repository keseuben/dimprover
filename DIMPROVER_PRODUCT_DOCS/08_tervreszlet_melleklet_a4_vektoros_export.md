# Tervreszlet melleklet A4 export

Cel: a fo terepi hibafelveteli PDF rovid maradjon, a tervreszletek kulon A4 melleklet PDF-be keruljenek.

Szabalyok:
- 2 db tervreszlet / A4 oldal.
- Allo kivagas fektetve keruljon be.
- Fekvo kivagas normal elhelyezessel keruljon be.
- A fo jegyzokonyv ne tartalmazzon teljes tervlap kepes mellekletet.
- A vegleges cel: eredeti PDF reszlet + vektoros HexPin overlay.
- Minden HJ es FHJ sajat kulon tervreszlet-kivagast kap.
- Egy HJ kivagasra nem kerulnek ra automatikusan a kozel eso FHJ markerek.
- Egy FHJ kivagasra nem kerulnek ra automatikusan a kozel eso HJ markerek.
- A fotohely marker PDF-ben nem HJ HexPin forma, hanem kek fotokartya-jelolo also mutato tuskevel.
- Az FHJ fotohely marker ugyanazokat a sulyossag es statusz vizualis jeloleseket kapja, mint a HJ marker.
- A fotohely markerek tovabbra sem szamitanak bele a HJ darabszamba, de a tervreszlet mellekletben kulon FHJ tetelkent szerepelnek.

Aktualis exportverzio:
- `fhj-parity-separate-crops-v1`

Ellenorzesi elv:
- A tervreszlet melleklet fejlécében latszania kell a `HexPin export: fhj-parity-separate-crops-v1` feliratnak.
- A HJ es FHJ jelolesek kulon-kulon oldali kartyakent jelennek meg.
- Az FHJ kartyan csak a kijelolt FHJ fotóhely marker legyen rajarzolva a kivagott PDF tervreszletre.
