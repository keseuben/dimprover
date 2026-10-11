# DIMPRO Drop + Drive – közös integrációs audit, 2026-10-11

Scope: DEV/source-readonly audit; PROD DENY. Git baseline: 4d61f4733. 
No deployment, database change, file transfer, license change or PM2 restart.

## Verified current behavior

- Drop remains independently licensable alongside Drive; new central product registry exists but legacy license migration is not activated. Source: app/lib/license/dimproDropServiceCatalog.ts.
- DEV Drop health: drop.dev.dimpro.hu runs Drop 1.2.13 shell; submissionGateEnabled and driveIncomingEnabled true, sendEnabled false, driveArchiveEnabled false. license.dev.dimpro.hu runs Drop 1.2.13 private-pilot; sendEnabled true, submissionGateEnabled false, driveArchiveEnabled false; identity consumer true. Both report scanner/worker readiness. Drive DEV health requires authentication (401); its live scanner state was not confirmed.
- Drop Send can verify a project code, but the automatic Drive incoming hook is restricted to submission_gate. A Send with project code is not proof of delivery to Drive. Sources: app/lib/drop/public/dropPublicWorkflowService.ts, dropPublicFinalizeService.ts.
- The project Beküldőkapu captures a targetFolder text field, but the Drop→Drive incoming service currently imports into the default provisioned incomingDropFolder, not into the entered real target folder. Requires authoritative Project Core ID, folder UUID and explicit ACL validation. Sources: components/drop/DropPublicWorkflowManager.tsx, app/lib/drop/archive/dropDriveIncomingService.ts.
- Drop incoming files require clean security and virus statuses. Transfer uses idempotent incoming key, S3 verified copy, SHA-256 and document provenance. A DEV pilot from September proved a Drop→Drive incoming journey. However, errors after finalization are caught and recorded; dedicated durable automatic reconciliation, history and explicit user-facing arrival status need verification/implementation.
- Drop Space UI asserts no duplicated file objects while Drop→Drive import/archive does a verified object copy. Storage and retention wording needs reconciliation. Both DEV archive flags currently false.
- Projekt Drive allows multiple files/folders dragged IN from Windows Explorer; uploadFiles processes each sequentially with fetch and a notice string n/N, but no actual byte progress, throughput, ETA, persistent transfer queue, parallel scheduler or upload scanner panel.
- Saját Drive directly disables upload: components/drive/PersonalDriveWorkspace.tsx canUpload=false.
- Drop multipart/XHR client already has real byte progress and resumable checkpoints: DropPublicHexUploader.tsx and dropMultipartClient.ts. Prefer shared Transfer Core adapters over separate upload engines.
- Drive default maxUploadMb 100 (configured up to 5120 MiB), default scanner limit 550 MiB and signed URL TTL default 600 seconds. Must never advertise a max file size beyond authoritative scanner + storage + upload limits.
- Internal Drive drag uses application/x-dimpro-drive-document JSON and text/plain only; it is not a Windows Explorer file. Desktop V0.1.9 handles single-file download/open through dimpro-drive:// but not native multi-file drag-out.

## Priority roadmap

P0-1. Verify Drop project code / Project Core ID / Drive folder UUID mapping; secure destination selector with folder ACL.
P0-2. Add server-side Drop incoming reconciler/automatic retry and per-package status (submitted, scanning, Drive received, pending review, error) with authenticated visibility.
P0-3. Unify file-size preflight with the scanner maximum; no permanently unscannable uploads.
P1-1. DIMPRO Transfer Center, shared status engine and resizable/dockable Drive-style progress panel. Show actual bytes and network-derived ETA; scan and approval as separate truthful states.
P1-2. Project and Personal Drive adapters using shared upload queue; 1–3 concurrency, retry/pause/resume where underlying protocol supports it.
P1-3. Windows multi-file export to local selected folder via Desktop Agent, with progress and security/ACL validation.
P1-4. Audit storage duplication, object lifecycle, Drop/Drive source identity, host feature drift, legacy licenses.
P2. True native drag-out from Drive Web/Windows shell via desktop native bridge OLE file-data transfer; optional chunked large-file engine after security review.

## Regression tests (read-only)

Five of ten older contract scripts PASS. Five FAIL but many assert stale version strings or old source layout; not five proven runtime defects:
- Drop v080 hardcodes DROP 0.8.0 vs current 1.2.13.
- Drive v076 expects old React sort-state literal.
- Drive security v050: 41/47 PASS, six failures in UI text/old component expectations; scanner code checks mostly pass.
- Drive v077 expects schema 0.8.6 vs current 0.9.4.
- Drive core v100: 21/22 PASS, note handler currently requires document.comment rather than test-expected document.write; validate intended narrower ACL rather than roll back.

No new browser/Windows drag-out E2E performed. Before any DEV release: DotRoll capacity increase, authenticated health, product/project/folder ACL negative tests, verified rollback, large-file/ClamAV trial, and no PROD changes.
