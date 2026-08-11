# BENJADMIN B3 / B3.1 / B3.2 – normatív fejlesztési crosswalk

Dátum: 2026-08-11

## Cél

A BENJADMIN további fejlesztésekor három egymásra épülő átadási anyagot kell együttesen kezelni:

1. `01_DIMPRO_BENJADMIN_B3_teljes_fejlesztoi_es_kodolasi_atadas_2026-08-09`
2. `02_DIMPRO_BENJADMIN_B3_1_kiegeszito_control_plane_realtime_naplo_monitoring_2026-08-10`
3. `03_DIMPRO_BENJADMIN_B3_2_partner_development_plane_outminai_kulso_termekek_2026-08-11`

A jelen fájl a már elkészült B3/B3.1/B3.2 implementációs checkpointokkal együtt rögzíti a további kódolás kötelező irányát.

## 01 – B3 alaparchitektúra

A B3 továbbra is a BENJADMIN alapszerződése.

Kötelezően megőrzendő elvek:

- elkülönített DEV fejlesztés;
- PROD nem fejlesztési célpont;
- stabil funkciót nem szabad indokolatlanul törölni vagy megkerülni;
- backup/checkpoint nagyobb fejlesztési módosítás előtt;
- task / worker / session / worktree / scope-lock alapú Development Center;
- párhuzamos worker működés konfliktusvédelemmel;
- build, migration, restart és deploy koordináció;
- DEV / STAGING / PRODUCTION explicit környezeti modell;
- auditálható fejlesztési munkamenetek;
- Operator UI a tényleges engine adatokból dolgozik;
- responsive desktop/tablet/mobil működés;
- TypeScript, lint, build, smoke és böngészős acceptance minden lezárási körben.

A B3 UI cél nem egyszerű adminlista, hanem valódi fejlesztési és üzemeltetési vezérlőpult.

## 02 – B3.1 Control Plane / realtime napló / monitoring

A B3.1 nem helyettesíti a B3 engine-t, hanem külön vezérlőréteget ad fölé.

Kötelező irányok:

- külön Control Plane fogalom;
- `START`, `DEV START`, `PROD START` explicit kontextus;
- `PROD START` önmagában nem ad write/migration/restart/deploy jogot;
- production módosító parancs approval-gated;
- parancsok allowlistelt műveleti szerződésből érkeznek, nyers shell payload nem engedett;
- DEV write/build/test/migration/restart/deploy továbbra is a Development Center session/scope/worktree jogosultságot használja;
- élő fejlesztési munkanapló;
- command queue és approval audit;
- monitoring minták és storage/infrastruktúra telemetry;
- fail-closed működés hiányzó séma vagy jogosultság esetén;
- hosszabb távon SSE / realtime frissítés;
- dedikált BENJADMIN Control VPS a célarchitektúra;
- a Control VPS könnyű vezérlőtorony, nem build/runtime gép.

UI szinten a Control menünek ezért külön kell mutatnia:

- START context;
- queue / approval állapot;
- élő napló;
- monitor / telemetry trendeket;
- infrastruktúra és storage állapotot;
- PROD approval gate-et.

## 03 – B3.2 Partner Development Plane / OutminAI

A B3.2 külön fejlesztési síkot hoz létre külső/partner termékekhez.

Kötelező határ:

- `INTERNAL`: DIMPRO belső fejlesztés, ÁrminAI/JázminAI;
- `PARTNER`: külső/partner fejlesztés, OutminAI;
- OutminAI internal DIMPRO projekthez alapból DENY;
- külön Linux/service identity;
- külön Git/repository/worktree terület;
- külön MCP/worker credential;
- külön secret reference kezelés;
- külön DB/storage erőforrás-scope;
- raw secret nem kerül partner registrybe;
- partner project code immutable `PART-XXXX`;
- delivery model: `DIMPRO_HOSTED | PARTNER_HOSTED | HANDOFF`;
- data classification: `NORMAL | CONFIDENTIAL | RESTRICTED`;
- internal engine access: `NONE | ALLOWLIST`;
- provisioning lifecycle: `DRAFT -> VALIDATING -> PROVISIONING -> BASELINE_TEST -> READY`;
- P4 release/handoff életciklus;
- P5 UI + acceptance;
- Control VPS-re partner build/runtime nem kerülhet.

A Partner fejlesztések UI a fő Operator nézet része, de elkülönített plane-ként jelenik meg.

## Jelenlegi implementációs állapot

B3:

- M0 DEV baseline kész;
- M1 protected shell/navigation kész;
- M2 Development Center engine kész;
- M3 parallel orchestration kész;
- Operator UI 2.0 működik.

B3.1:

- Control Plane read model működik;
- command queue / approval safety működik;
- PROD fail-closed szabály megmaradt;
- telemetry/realtime továbbfejlesztés még folytatandó.

B3.2:

- P0 schema audit kész;
- P1 registry kész;
- P2 OutminAI runtime isolation READY;
- P3 HANDOFF provisioning kész;
- P4 partner kiadás / átadás (release / handoff) elkészült;
- P5 végleges UI/biztonsági acceptance következik.

## BENJADMIN UI V3 fejlesztési szabály

A jelenlegi UI V3 fejlesztés a három dokumentumot közösen szolgálja ki.

Minden főnézetben az alábbi hierarchia az alap:

1. gyors KPI / health összkép;
2. releváns grafikon vagy trend;
3. részletes, lapozható és kereshető táblázat;
4. műveleti vagy approval panel, ha az adott nézetben szükséges;
5. auditálható forrásadat, nem dekoratív demo-adat.

A grafikonok csak meglévő source-of-truth / live read model adatból készülhetnek. Ha egy telemetry adat még nem létezik, a UI nem generálhat hamis adatot; `PENDING`, `NINCS ADAT` vagy readiness állapotot kell mutatnia.

## Nyelvi, tipográfiai és responsive szabály

- látható UI elnevezésnél a magyar kifejezés az elsődleges; az angol szakmai kifejezés legfeljebb utána, zárójelben szerepelhet;
- technikai enum/API/azonosító kód maradhat angol, de az emberi címke magyar elsődleges;
- munkafelület törzsszöveg minimum 12 px;
- navigáció lehet kompaktabb csak a korábban elfogadott shell-szabály szerint;
- desktopon a fő Operator munkatér lehetőség szerint egy viewport;
- táblázat saját belső scrollt használjon;
- a teljes oldal ne kapjon indokolatlan vízszintes overflow-t;
- tablet/mobil nézeten a chart grid fokozatosan 2, majd 1 oszlopra vált;
- adat ne vesszen el responsive átrendezéskor.

## Kötelező fejlesztési ciklus

A további BENJADMIN körökben:

1. server/status ellenőrzés;
2. érintett fájlok és kapcsolódó B3/B3.1/B3.2 dokumentáció olvasása;
3. backup/checkpoint;
4. kódmódosítás;
5. kapcsolódó `DIMPROVER_PRODUCT_DOCS` frissítés;
6. `npx tsc --noEmit`;
7. `npm run lint`;
8. célzott acceptance;
9. `npm run build`;
10. DEV restart + smoke;
11. desktop/tablet/mobil böngészős acceptance;
12. Git checkpoint.

PROD változtatás csak külön, explicit jóváhagyással történhet.

## Következő összehangolt fejlesztési sorrend

Az UI V3 analitikai réteg, a B3.1 Vezérlés (Control), a B3.2 Partner fejlesztések, valamint a P4 Partnerátadás elkészült.

Következő sorrend:

1. B3.2 P5: teljes UI / responsive / security acceptance;
2. P4 adatbázis-tranzakciós hardening RPC;
3. B3.1 realtime munkanapló / monitoring további adatgyűjtő rétege;
4. dedikált BENJADMIN Control VPS célarchitektúra előkészítése.

Ez a sorrend megőrzi a B3 alapmotor, a B3.1 Control Plane és a B3.2 Partner Plane közötti architekturális határokat.
