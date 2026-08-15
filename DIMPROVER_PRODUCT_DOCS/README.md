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

- `206_benjadmin_terminalhub_p2_candidate_20260814.md` – P2 DEV candidate: session/reconnect/XTerm/output security/Managed Commands, 64/64 contract, execution továbbra is fail-closed.

- `207_benjadmin_terminalhub_p2_dev_activation_20260814.md` – P2 candidate UI/session protokoll DEV-en aktív, 64/64 PASS, execution továbbra is OFF/fail-closed.

- `208_benjadmin_terminal_command_library_p3_candidate_20260814.md` – Terminál Parancstár P3 pre-DB candidate: deduplikált sanitizált command catalog + events, 108/108 contract, source-DB preflight PASS; DB még nem módosult.

- `209_benjadmin_terminal_command_library_p3_db_activation_20260814.md` – P3 DEV DB aktiválás: source preflight, lokális + Restic backup, rollback-próba, migration apply és deduplikációs DB acceptance PASS.

- `210_benjadmin_terminal_command_library_p3_dev_activation_20260814.md` – Terminál Parancstár P3 DEV-en aktív: DB+UI/API, 108/108 PASS, Command Library flag ON; execution/Live Workspace/PROD továbbra is OFF.

- `211_benjadmin_live_workspace_p4_candidate_20260814.md` – Live Workspace P4 read-only candidate: allowlistelt worktree/fájlfa/text-preview, 24/24 contract és synthetic-key API acceptance PASS; feature flag még OFF.

- `212_benjadmin_live_workspace_p4_dev_activation_20260814.md` – Live Workspace P4 read-only DEV aktiválva: 132/132 contract PASS, HTTPS/API smoke PASS, watcher/write/execution/PROD továbbra is OFF.

- `213_benjadmin_live_workspace_p5_candidate_20260814.md` – Live Workspace P5 candidate: worker/session/task activity + sanitizált AUDIT/COMMIT/FILE_STATE feed, 161/161 contract és synthetic-key runtime acceptance PASS; live P5 flag még OFF.

- `214_benjadmin_live_workspace_p5_dev_activation_20260814.md` – Live Workspace P5 DEV-en aktív: worker/session/task activity + sanitizált AUDIT/COMMIT/FILE_STATE feed, 161/161 PASS; watcher/write/execution/PROD továbbra is OFF.

- `215_benjadmin_live_workspace_p6_candidate_20260814.md` – Live Workspace P6 candidate: local Monaco Live/Diff/History, read-only Git context, local editor+JSON workers, 205/205 contract és headless browser acceptance 0 error; live P6 flag még OFF.

- `216_benjadmin_live_workspace_p6_dev_activation_20260814.md` – Live Workspace P6 DEV aktiválás: Monaco Live/Diff/History aktív, 205/205 PASS, browser 0 error; execution/PROD/P7 továbbra is OFF.

- `217_benjadmin_live_workspace_p7_candidate_20260814.md` – Live Workspace P7 candidate: 1/2/4 read-only Monaco panel, detached multi-monitor state sync, 248/248 PASS, browser 0 error; live P7 flag még OFF.

- `218_benjadmin_live_workspace_p7_dev_activation_20260814.md` – Live Workspace P7 DEV aktiválás: 1/2/4 panel + detached multi-monitor aktív, 248/248 PASS; P8 Windows Bridge továbbra is OFF.

- `219_benjadmin_windows_bridge_p8_foundation_candidate_20260814.md` – P8 Windows Desktop Bridge foundation: outbound-only agent/readiness security contract, 285/285 PASS; live Bridge/pairing/execution OFF.

- `220_benjadmin_windows_bridge_p8_foundation_dev_activation_20260814.md` – P8 Windows Desktop Bridge foundation DEV aktiválás: 285/285 PASS; Bridge/pairing/execution továbbra is OFF.

- `221_benjadmin_windows_bridge_p81_candidate_20260814.md` – P8.1 secure pairing candidate: agent identity, one-time pairing, approval/revoke/heartbeat, 329/329 PASS; DB migration pending, Bridge/Pairing/Execution OFF.

- `222_benjadmin_windows_bridge_p81_dev_activation_20260814.md` – P8.1 secure pairing kódréteg DEV aktiválás: 329/329 PASS; DB migration pending, Bridge/Pairing/Execution OFF.

- `223_benjadmin_windows_bridge_p81_migration_gate_20260814.md` – P8.1 DB migration gate: explicit DEV approval + target preflight + backup/listing/SHA + schema verify, 352/352 PASS; valós preflight credential hiány miatt fail-closed.

- `224_benjadmin_windows_bridge_p81_hardening_candidate_20260815.md` – P8.1 hardening: pairing crypto core/state machine, DB migration readiness UI, Windows agent manager; 407/407 PASS, Bridge/Pairing/Execution OFF.

- `225_benjadmin_windows_bridge_p81_hardening_dev_activation_20260815.md` – P8.1 hardening DEV aktiválás: 407/407 PASS, build XR4JDXq1W-fVQA68otcGI; DB migration pending, Bridge/Pairing/Execution OFF.

- `226_benjadmin_windows_bridge_p81_windows_e2e_package_20260815.md` – P8.1 Windows E2E package builder: SHA-ellenőrzött installer/self-check/pair/heartbeat/uninstall csomag, execution és autostart OFF.

- `227_benjadmin_windows_bridge_p81_db_and_server_e2e_20260815.md` – P8.1 DEV DB migration + server-side Pair/Approve/Heartbeat/Revoke E2E PASS; pairing secret provisioned, live Bridge/Pairing/Execution OFF.

- `228_benjadmin_terminalhub_p9_security_candidate_20260815.md` – P9 security candidate: Private Input, session AI visibility, redaction audit, strengthened secret scanner, Secret Vault skeleton; 475/475 PASS.

- `229_benjadmin_terminalhub_p9_security_dev_activation_20260815.md` – P9 security DEV aktiválás: 475/475 PASS, build OUKeDkvfIFbA152AN2VWQ; PM2 cross-worktree cwd incidens feltárva és helyes operator cwd-ra javítva.

- `230_benjadmin_runtime_identity_guard_20260815.md` – BENJADMIN DEV PM2 runtime identity guard + standalone .dimprover self-heal; live/mismatch/fixture acceptance PASS.

- `231_benjadmin_runtime_identity_guard_dev_activation_20260815.md` – runtime identity guard DEV aktiválás: cwd/port/build/P9 auth-gate live PASS; standalone .dimprover self-heal aktív.

- `232_benjadmin_terminalhub_p9_destructive_command_approval_candidate_20260815.md` – P9 DEV destructive Managed Command approval: 5 perces two-step approval, atomikus single-use queue/consume, 540/540 PASS; DEV DB migration applied.

- `233_benjadmin_terminalhub_p9_destructive_command_approval_dev_activation_20260815.md` – P9 destructive Managed Command approval DEV aktiválás: 621/621 PASS, atomikus single-use approval gate aktív; execution/PROD/Vault továbbra is OFF.

- `234_benjadmin_terminalhub_p10_prod_readiness_candidate_20260815.md` – P10 PROD readiness foundation: READ_ONLY + AI BLOCKED + separate connector/default deny policy; 661/661 PASS, valódi PROD kapcsolat nélkül.

- `235_benjadmin_terminalhub_p10_prod_readiness_dev_activation_20260815.md` – P10 PROD readiness foundation DEV aktiválás: READ_ONLY + AI BLOCKED/default deny policy aktív kódban, live connector/execution flagek OFF; PROD érintetlen.

- `236_benjadmin_terminalhub_p101_prod_readonly_connector_candidate_20260815.md` – P10.1 PROD read-only connector foundation: reference-only, no-network/no-shell, AUDIT_ONLY probe allowlist; 338/338 PASS, PROD kapcsolat nélkül.

- `237_benjadmin_terminalhub_p101_prod_readonly_connector_dev_activation_20260815.md` – P10.1 read-only PROD connector foundation DEV aktiválás: reference-only/no-network, 42/42 security contract, live execution flagek OFF; PROD érintetlen.

- `238_benjadmin_terminalhub_p102_probe_plan_compiler_candidate_20260815.md` – P10.2 networkless PROD probe-plan compiler: allowlist probe ID → immutable AUDIT_ONLY plan; 405/405 PASS, no-network E2E.

- `239_benjadmin_terminalhub_p102_probe_plan_compiler_dev_activation_20260815.md` – P10.2 networkless PROD probe-plan compiler DEV aktiválás: 405/405 + Drive 206/206 PASS; live PROD/P10 flagek OFF.


- `240_dimpro_drive_compare_findings_v200_dev_activation_20260815.md` – DIMPRO Drive Compare Findings V2.0 DEV aktiválás: DB migration + valós create/reload/update/409/soft-delete/audit E2E, 30/30 + 206/206 PASS, pointer-alapú 3100 cutover; PROD érintetlen.

- `241_dimpro_drive_compare_findings_v210_issue_conversion_candidate_20260815.md` – Compare Findings V2.1 finding → hibajegy candidate: közös Project Issue Core V0.1, csak emberi JAVÍTANDÓ döntés után, idempotens CREATED_FROM kapcsolat; 45/45 contract PASS, migration/E2E pending.

- `242_dimpro_drive_compare_findings_v210_issue_conversion_dev_activation_20260815.md` – Compare Findings V2.1 DEV aktiválás: Project Issue Core V0.1 + emberi JAVÍTANDÓ gate + idempotens HJ konverzió + valós audit E2E; 45/45 + 206/206 PASS, build UDBbz0Ivi6fM29BN2s_wK.

- `243_dimpro_central_issue_register_v220_dev_activation_20260815.md` – Központi Hibajegyzék V2.2 DEV aktiválás: Project Issue Core V0.2, valós projektlista/HJ kezelés, optimistic update + 409, audit E2E, 46/46 + 16/16 live acceptance; build WmSckw0g-juU3zh5b3tGX.

- `244_dimpro_field_issue_core_v230_dev_activation_20260815.md` – Terepi hibafelvétel → Project Issue Core V0.3 DEV aktiválás: FIELD_CAPTURE HJ sync, explicit mentés, idempotens create, külső felelős, optimistic update, 70/70 + 21/21 live PASS; build Tgp-ODgYRzmIgsfJ8fe7o.

- `245_dimpro_field_issue_attachments_v240_release_candidate_20260815.md` – Terepi HJ mellékletkapcsolatok V0.4 RC: valós DIMPRO Drive document/version, PHOTO/EVIDENCE + PLAN/ATTACHMENT, 102/102 PASS; operator build g6fF6NQq2d03y1OdgKqbU; DB migráció biztonsági kapun blokkolt, nincs cutover.

- `246_benjadmin_ai_developer_space_v1_dev_activation_20260815.md` – BENJADMIN AI Fejlesztői Tér V1 DEV aktiválás: Ármin/Jázmin/Outmin ownership + routing + ETA + session/lifecycle + Kész/Hiba értesítés, immutable release identity, 40/40 + 9/9 + 17/17 + 19/19 PASS; aktív build 0GC_mboRAp_cBl7Yzygha, natív executor továbbra is fail-closed.
