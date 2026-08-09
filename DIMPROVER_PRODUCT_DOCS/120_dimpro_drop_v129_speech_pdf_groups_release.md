# DROP 1.2.9 – beszédduplikáció, PDF képrács és csoportos kimenetek

**Fejlesztés:** 2026-08-09  
**Állapot:** éles private-pilot release, GA=false  
**Fejlesztési Központ:** `version_99708ea1-aca`  
**Kiinduló release:** `.next-v128-release-final`  
**Kiinduló BUILD_ID:** `9UEmGZhWCN3pgyR6BFvs7`  
**Éles release:** `.next-v129-release-final`  
**BUILD_ID:** `OdrfWvJQdkRbCvUrznF_9`  
**Közvetlen rollback:** `.next-v128-release-final`  
**Futási szint:** private-pilot, GA=false

## Fizikai tesztből származó javítások

### 1. Közös SpeechRecognition átiratmotor

A Samsung/Chrome fizikai teszt igazolta, hogy a Web Speech API ugyanazon recognition eredménypozícióhoz többször adhat vissza folyamatosan módosuló részmondatot. A korábbi klienslogika ezeket appendelte, ezért például `ez ez egy ez egy próba` vagy `helyszín helyszín ...` típusú duplikáció keletkezhetett már a mentett szövegben.

A DROP 1.2.9 új közös `DropSpeechTranscriptAccumulator` motort használ:

- `resultIndex` és recognition eredménypozíció alapján tárolja a blokkokat;
- ugyanazon eredménypozíció új változata felülírja a korábbit, nem hozzáfűzi;
- a szomszédos recognition blokkok prefix/suffix átfedését kiszűri;
- egyetlen recognition blokkon belüli valódi szóismétlést nem módosítja;
- ugyanaz a motor működik a levélüzenet és a képenkénti megjegyzés diktálásánál;
- az explicit mikrofonengedély és a `Permissions-Policy: microphone=(self)` megmarad;
- a Gyors KépSend továbbra sem tárol hangfájlt és nem használ AI szövegjavítást.

Új közös komponens/helper:

- `components/drop/dropSpeechTranscript.ts`

### 2. PDF 1/2/4/6 képes elrendezés

A 4 képes mód fix 2×2, a 6 képes mód fix 3×2 rácsot kapott. A többképes nézetek a kiválasztott kapacitás szerint darabolják a képeket, és csoporton belül készítik az oldalakat.

A sűrű 4/6 képes nézetben a nagyon hosszú megjegyzés csak a PDF-kártyán rövidül, hogy ne növelje meg indokolatlanul a kártyamagasságot és ne törje szét a képrácsot. A teljes megjegyzésszöveg a TXT exportban változatlanul megmarad.

A PDF képmellékletben:

- minden csoport világos cyan/szürkéskék fejlécet kap;
- sötét navy csoportnév és külön képszám badge jelenik meg;
- a csoportfejléc `break-after: avoid` szabállyal nem marad szándékosan egyedül az oldal alján;
- névvel rendelkező csoportok jelennek meg először;
- `Csoport nélkül` mindig a végére kerül.

### 3. Csoportstruktúra az e-mailben

A végleges kézbesítési e-mail fájladatai most a `group_id`, csoportnév és csoportsorrend információt is megkapják.

Az e-mail tetején új `Csoportok összesítője` blokk jelenik meg. A csoportnevek egyszerű HTML-anchor hivatkozással a levél alsó csoportblokkjaira mutatnak, ahol ezt a levelezőkliens támogatja.

A tényleges e-mail tartalom minden esetben látható, JavaScript és összecsukás nélkül. A csoportblokkok egyszerű table-alapú HTML-t használnak a levelezőkliens-kompatibilitás miatt.

### 4. Biztonságos webes letöltőalbum

A `Fájlok megnyitása` biztonságos letöltőfelület csoportos csomagnézetet kapott.

Fő működés:

- felül kompakt csoport-főösszesítő;
- a csoportgomb az adott lenti blokkhoz görget;
- minden csoport **alapértelmezetten nyitott**;
- a címzett utólag összecsukhat egy csoportot;
- felső navigációból kiválasztott, korábban összecsukott csoport automatikusan újranyílik;
- egyetlen kép sincs alapból elrejtve;
- egységes DIMPRO cyan/szürkéskék + navy vizuális rendszer;
- `Csoport nélkül` utolsó.

### 5. TXT export

A TXT elején csoportösszesítő jelenik meg, utána csoportonként külön blokk, például:

```text
=== BOCSKAI · 4 KÉP/FÁJL ===
```

A fájlnév és a teljes megjegyzésszöveg a csoportblokkon belül jelenik meg. A `Csoport nélkül` blokk a végére kerül.

### 6. ZIP / Drive kompatibilitás

A korábbi opcionális `exportGroupsAsFolders` működés nem változik. A ZIP/Drive fizikai csoportmappa és az e-mail/web/PDF/TXT logikai csoportstruktúra ugyanabból a `group_id` kapcsolatról dolgozik.

## Érintett fő fájlok

- `components/drop/dropSpeechTranscript.ts`
- `components/drop/DropPublicHexUploader.tsx`
- `components/drop/DropPublicTransferClient.tsx`
- `app/lib/drop/public/dropPublicFinalizeService.ts`
- `app/lib/drop/public/dropPublicEmailTemplate.ts`
- `components/drop/DropSecureDownloadPanel.tsx`
- `app/lib/drop/download/dropDownloadService.ts`
- `app/lib/drop/report/dropFinalReportRenderer.ts`
- `app/lib/drop/report/dropPackageTextReport.ts`
- kapcsolódó DROP verziójelző API/runtime fájlok.

## Végleges validáció és élesítés

- forrás/architektúra contract: **28/28 PASS**;
- futásidejű SpeechRecognition + e-mail + TXT regresszió: **13/13 PASS**;
- TypeScript: **PASS**;
- teljes ESLint: **0 error / 108 meglévő warning**;
- koordinált candidate build: **PASS**, BUILD_ID `OdrfWvJQdkRbCvUrznF_9`;
- standalone asset ellenőrzés: **141 chunk PASS**;
- candidate browser E2E: **37/37 PASS**;
- candidate teljes S3 → ClamAV → finalize → SMTP → webalbum → PDF/TXT/ZIP E2E: **75/75 PASS**;
- production browser E2E: **37/37 PASS**;
- production teljes S3 → ClamAV → finalize → SMTP → webalbum → PDF/TXT/ZIP E2E: **75/75 PASS**;
- Identity Core: **12/12 READY**;
- live HTTPS health: **DROP 1.2.9 / coreReady=true / Send=true / Identity=true / Object Storage=true / ClamAV=true**;
- `Permissions-Policy`: `microphone=(self)` **PASS**;
- tesztcsomag- és tesztfelhasználó-maradvány: **0**;
- teljes E2E tesztben a létrehozott 11 Object Storage objektum takarítása: **PASS**.

### Valós csoport- és PDF-rács regresszió

A célzott valós fixture **Bocskai 4 kép / Kossuth 7 kép** csoportstruktúrát használt.

- 4 képes mód képmelléklet-oldalai: **4 + 4 + 3**;
- Bocskai 4 képe egyetlen valódi **2×2** oldalon maradt;
- 6 képes mód képmelléklet-oldalai: **4 + 6 + 1** a csoporthatárok megtartásával;
- a hosszú megjegyzés nem csökkentette 2 képre a választott oldalkapacitást;
- TXT-ben a teljes hosszú megjegyzés megmaradt;
- ZIP-ben `Bocskai/` és `Kossuth/` csoportmappa **PASS**.

### Release

- élesítés: **2026-08-09**;
- release: `.next-v129-release-final`;
- BUILD_ID: `OdrfWvJQdkRbCvUrznF_9`;
- közvetlen rollback: `.next-v128-release-final`;
- aktiválási backup: `backups/drop_v129_release_activation_20260809_083058`;
- central release pointer és PM2 `NEXT_DIST_DIR`: `.next-v129-release-final`;
- private-pilot marad, **GA=false**.
