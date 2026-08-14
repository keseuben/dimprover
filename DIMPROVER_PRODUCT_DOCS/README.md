# DIMPROVER termékdokumentáció

Ez a mappa a DIMPROVER modulok, architektúra, UX szabályok és fejlesztési döntések termékoldali dokumentációját tartalmazza.

## Dokumentumok

- `01_termek_attekintes.md`
- `02_modulok_es_funkciok.md`
- `03_architektura.md`
- `04_adatmodellek.md`
- `05_verziotortenet.md`
- `06_ui_ux_szabalyok.md`
- `07_hexpin_tervi_hibajeloles_es_pdf_export.md`
- `08_teszteles_es_ellenorzes.md`
- `09_uzemeltetes.md`
- `10_kovetkezo_fejlesztesek.md`

- `49_dimpro_felmero_v072_assembly_u_value.md` – rétegrend- és U-érték motor, korrekciók, követelményvizsgálat, vastagságkereső és exportok.

- `50_dimpro_felmero_v073_energy_zones.md` – energetikai zónák, fűtetlen terek, kapcsolatok, audit és exportok.

- `51_dimpro_felmero_v074_openings_thermal_bridges.md` – részletes Uw, beépítési perem, lineáris és pontszerű hőhidak.

- `52_dimpro_felmero_v075_zone_load_systems.md` – zónánkénti méretezési fűtési terhelés és gépészeti rendszerkapcsolatok.

- `53_dimpro_felmero_v080_field_workflow_winwatt_transfer.md` – terepi energetikai workflow, felújítási változatok, WinWatt-előkészítés és megújuló/villamos előméretezés.

- `54_dimpro_felmero_v081_field_ux.md` – helyszíni gyorsfelvétel, terepi útmutató, progresszív energetikai mezők és egyszerűsített felújítási kártyák.

- `55_dimpro_felmero_v082_scenario_comparison.md` – M0–T változat-összehasonlítás, H- és teljesítményváltozás, kapacitás- és exportmodell.

- `56_dimpro_felmero_v083_winwatt_field_map.md` – WinWatt mezőszintű átadási szerződés, 18 lapos Excel, készültségvizsgálat és diagnosztikai/próbaátadási ZIP.

- `57_dimpro_felmero_v084_winwatt_trial_feedback.md` – WinWatt próbamunkamenetek, mezőnkénti célpontosítás, beviteli idő, eredményeltérés, 20 lapos Excel és 10 fájlos visszacsatolási ZIP.

- `58_dimpro_felmero_v0841_responsive_workspace_timer.md` – központi Rajz/Adatok/Osztott szakértői munkatér, kompakt jobb board, tablet- és mobil szabályok, vizuális tesztek és felmérésalapú munkaidőmérő.

- `59_dimpro_felmero_v0842_guided_winwatt_trial.md` – vezetett WinWatt-próba, vágólapmásolás, automatikus mezőidő, gyors státuszok, blokkolt mezők és próbanapló-időbélyegek.

- `67_dimpro_felmero_v08442_plan_energy_transfer.md` – jóváhagyott PDF falak és nyílászárók idempotens átadása, katalógussablonok, Uw/g/árnyékolás és hőhídkapcsolatok.

- `68_dimpro_felmero_v08443_transfer_registry_conflicts.md` – több tervlapos átadási nyilvántartás, tartalmi változásjelzés, konfliktusvédelem, auditnapló és megerősített eltávolítás.

- `69_dimpro_felmero_v08444_plan_version_diff.md` – dokumentum-revíziók, oldal- és elempárosítás, vizuális/táblázatos diff, részleges elfogadás és döntésmegőrzés.

- `70_dimpro_felmero_v08445_version_model_application.md` – elfogadott tervverzió-változások részleges központi modellmigrációja, stabil ID-k, törlési megerősítés, audit és rollback.

- `71_dimpro_felmero_v08446_version_graph_history.md` – több tervverziós gráf, alkalmazási előzmények, deduplikált snapshot-tár és történeti rollback.

## DIMPRO Drop kiadási és átadási dokumentumok

- `100_dimpro_drop_operations_heic_delivery_v096.md` – üzemeltetési monitor, HEIC/JPG előnézet, összesített e-mail-kézbesítés és azonnali ClamAV scanner.
- `101_dimpro_drop_postgres_workflow_store_v095.md` – központi PostgreSQL workflow-tár, migráció, atomi RPC-k és fail-closed működés.
- `102_dimpro_drop_mobile_dock_wake_lock_v097.md` – lebegő mobil dokk, hexagon gyorsfeltöltő, safe-area, billentyűzet/modal érzékelés és Screen Wake Lock.
- `103_dimpro_drop_new_chat_handoff_after_v097.md` – teljes új csevegés átadás, hiányzó fejlesztési fejezetek és DROP 0.9.8 indító specifikáció.
- `104_dimpro_drop_offline_mobile_v098.md` – tokenmentes IndexedDB feltöltési sor, hálózatvesztési retry, multipart folytatás, PWA-frissítés, helyi értesítés és fizikai mobiltesztmátrix.
- `105_dimpro_drop_email_validation_zip_pwa_icons_v099.md` – e-mail kliensvalidációs adminpanel, streamelt ZIP-tömeges letöltés és a webes faviconnal egységes PWA ikoncsomag.
- `106_dimpro_drop_new_chat_handoff_after_v099.md` – teljes DROP 0.9.9 átadás és DROP 1.0.0 private-pilot validációs fejlesztési terv.
- `107_dimpro_drop_v100_private_pilot_quick_image_code_hardening.md` – DROP 1.0.0 candidate: validációs központ, Gyors KépSend, Nagy/Közepes/Kicsi képméret, GPS/EXIF szabály, automatikus kódbelépés, tesztek és nyitott release gate.
- `108_dimpro_drop_new_chat_handoff_after_v100_candidate.md` – új csevegés átadási dokumentum a fizikai private-pilot és végleges release folytatásához.

## Központi platformmag

- `109_dimpro_identity_license_send_project_core_v010.md` – központi DIMPRO/DIMPROVER felhasználó-, szervezet-, licenc-, Send-jogosultság- és projektkód-adatmodell; live Supabase-ben telepített háromlépcsős migráció, security hardening és 24/24 acceptance PASS.
- `110_dimpro_identity_core_v010_live_handoff.md` – lezárt live Identity Core V0.1.0 átadás: admin DB-kapcsolat, migráció, 24/24 acceptance, bridge állapot és a Drop/Projektkapu következő integrációs lépései.

- `113_dimpro_drop_v123_central_user_send_release.md` – központi Send-felhasználó létrehozás/aktiválás, aktív licencszűrés, saját Send-kód és valós `/send` belépési release.
- `114_dimpro_drop_v124_quick_send_ux_release.md` – Gyors KépSend UX, `F0001` rendezett fotónév, címzett/üzenet logika, queue műveletek, letöltőoldali összefoglaló, S3 album-preview és megszakítható ZIP release.
- `115_dimpro_drop_v125_send_groups_reports_release.md` – Send-címjegyzék, logikai képcsoportok, első három használatos szabályelfogadás, PDF/TXT riport és ZIP-integráció.
- `116_dimpro_drop_v126_send_safety_pdf_voice_release.md` – biztonságos kétlépcsős feltöltés/küldés, 1/2/4/6 képes optimalizált PDF, javított PDF/TXT letöltés, ZIP-opciók és licencelt 60 mp-es Gyors KépSend diktálás.
- `117_dimpro_drop_v127_voice_session_comment_fix_release.md` – hangátírás állapotgép, levélüzenet-diktálás, karantén utáni megjegyzésmódosítás és Send session/package mismatch javítás.
- `118_dimpro_terepi_kontroll_handoff_after_drop_v127.md` – DIMPRO Terepi Kontroll következő csevegés átadás: almodulok, szerveres/offline speech, AI, képjelölés, projekt- és dokumentumintegráció.
- `119_dimpro_drop_v128_microphone_group_move_hotfix.md` – explicit webes mikrofonengedély, `microphone=(self)`, azonnali képkártya-diktálás, feltöltött képek csoportáthelyezése és `Csoport nélkül` bulk csoportképzés.

## BENJADMIN B3

- `123_dimpro_benjadmin_b3_m0_prod_dev_migration_20260809.md` – PROD → DEV migráció, tiszta baseline és elkülönített infrastruktúra.
- `124_dimpro_benjadmin_b3_m0_release_gate_status_20260809.md` – M0 13/13 release-gate lezárás, auth és storage acceptance.
- `125_dimpro_benjadmin_b3_m1_shell_login_navigation_20260810.md` – M1 protective screen, rejtett admin login, BENJADMIN shell és reszponzív navigáció.
- `197_benjadmin_terminalhub_normative_checkpoint_20260814.md` – 01–06 BENJADMIN normatív forráslánc, aktuális 666a651 baseline és Terminal Hub / Live Workspace P0+P1 indulási checkpoint.
- `198_benjadmin_terminalhub_p0p1_20260814.md` – Terminal Hub P0 security foundation + P1 UI shell, execution nélkül, 21/21 contract és koordinált build checkpoint.
- `199_benjadmin_terminalhub_p0p1_dev_activation_20260814.md` – P0/P1 DEV aktiválás, 21/21 security contract, feature flag állapot, smoke és P2 előtti rollback checkpoint.
- `200_benjadmin_terminalhub_p2_foundation_20260814.md` – Terminal Hub P2 DEV Terminal Core foundation: nem-root identity gate, readiness API, session protocol és 12/12 contract; valódi PTY még nem aktív.

- 130_dimpro_benjadmin_operator_ui_v2_20260810.md – Operator UI 2.0: egyképernyős, lapozható táblázatos BENJADMIN, dokkolható Explorer, light/dark mód és öt tagos B3 csapat.

- `201_benjadmin_terminalhub_p2_session_protocol_20260814.md` – P2 session registry, create/list/close/input/resize API és sequence-alapú SSE reconnect; process adapter fail-closed.

- `202_benjadmin_developer_console_module_naming_20260814.md` – Normatív BENJADMIN Fejlesztői Konzol névstruktúra: AI Fejlesztői Tér, Terminal Hub, Live Workspace, Terminál Parancstár, Fejlesztési Tár, ChatGPT Parancstár, Git / Diff / History.

- `203_benjadmin_terminalhub_p2_xterm_client_20260814.md` – Terminal Hub P2 XTerm/FitAddon kliens, admin-autholt SSE reconnect és resize UI; process adapter továbbra is fail-closed.

- `204_benjadmin_terminalhub_p2_output_security_20260814.md` – P2 output security: 30 perc idle, 4 óra max lifetime, külön RAW/SANITIZED/AUDIT adatút és 11/11 contract.

- `205_benjadmin_terminalhub_p2_managed_commands_20260814.md` – P2 Managed Commands a meglévő B3.1 Control Plane queue-val, READY session gate-tel; nincs nyers shell vagy saját build motor.
