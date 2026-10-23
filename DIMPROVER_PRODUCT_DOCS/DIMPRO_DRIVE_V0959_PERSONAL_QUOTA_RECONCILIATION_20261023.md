# DIMPRO Drive V0.9.59 – Saját Drive kvótafoglalás és helyreállítás

Dátum: 2026-10-23
Állapot: SOURCE ONLY, DEV ONLY, PROD DENY.
Publikus DEV: továbbra is V0.9.52. A 100 MiB-os és az 5 GiB-os új személyes feltöltés továbbra is külön bekapcsolásra vár.

## Miért készült ez a fejlesztés?

A V0.9.57/v0.9.58 multipart USER session-ök tárhelyet foglalnak le, még mielőtt az S3 feltöltés és vírusvizsgálat befejeződne. A korábbi személyes `dimpro_personal_drive_ensure_ref_atomic` SQL RPC és a felületi `getPersonalDriveStorageQuota` nem számolt ezekkel. Ha ezt változatlanul használnánk az 5 GiB feltöltéssel, párhuzamos fájlrögzítések mellett a tárhelykorlát megkerülhető lenne.

A második hiba: `UPLOADING → ABORTED` státusz túl korán felszabadíthatta volna a foglalást, miközben az S3 AbortMultipartUpload még sikertelen vagy bizonytalan kimenetelű.

## Elkészült SOURCE módosítások

1. `supabase/migrations/20261023_personal_drive_multipart_quota_v011.sql`:
   Új, külön, **még NEM alkalmazott** függvénymigráció a V0.9.57 v010 alapra. Az eredeti, authoritative v010 USER-ref RPC testének minimális módosításával megtartottuk a jogosultsági, tulajdonosi és deduplikációs logikát, de a kvótaellenőrzés `used + reserved + incremental` összeget használ.
   A `reserved` érték minden `INITIATED`, `UPLOADING`, `ABORTING`, `COMPLETING`, `QUARANTINED` és `SCANNING` session teljes méretének összege.
   Az aktív/refen megmaradó tartalomobjektumokat deduplikáltan számítjuk, az `ACTIVE` és `REMOVED` refeket együtt, ugyanazzal a személyes `personal-drive-quota:<USER UUID>` transaction advisory lockkal.
   Új szolgáltatói, read-only `dimpro_personal_drive_quota_summary_v011` RPC egységes `usedBytes / reservedBytes / occupiedBytes / remainingBytes` adatot ad egy SQL snapshotból.
   A migráció csak a v010 `schema_version=0.1.0` markerre épülve alkalmazható; sikeresen végrehajtva `0.1.1` lesz az új marker. Nem tartalmaz táblatörlést vagy adatvesztést célzó SQL-műveletet.
2. `app/lib/content-core/repository.ts`:
   Amíg `PERSONAL_MULTIPART_SERVER_RELEASED=false`, a jelenleg működő, régi személyes tárhelymérő változatlan marad. Csak a jövőbeli, auditált aktiválás után kapcsol át az egységes quota-summary RPC-re. Ekkor hiányzó RPC vagy ellentmondásos válasz esetén fail-closed 503, nincs csendes nullafoglalás.
3. `app/lib/content-core/personalQuotaSummary.ts`:
   Tiszta, tesztelt adatnormalizáló. A negatív, NaN, túlcsordult vagy össze nem egyeztethető kvótaértékeket elutasítja.
4. `components/drive/PersonalDriveWorkspace.tsx`:
   A teljes és a kompakt személyes tárhelyjelzőben függő foglalási helyet is mutató egérmutatós leírás. A még inaktív funkció jelenlegi numerikus értékei nem változnak.
5. `app/lib/content-core/personalMultipartPolicy.ts`, `personalMultipartService.ts`, `personalMultipartRepository.ts` és a v010 SQL-tervezet:
   Új `ABORTING` státusz. S3 multipart abort csak `ABORTING` állapotból válthat `ABORTED`-re, miután az S3 abort kérés visszaigazolása megvan. Sikertelen vagy elveszett válasz mellett a foglalás megmarad, és külön ellenőrzött ismétlés szükséges.
6. `app/lib/content-core/personalMultipartReconciliation.ts`:
   Tiszta, **nem destruktív** ellenőrzési döntési motor. Megkülönbözteti az aktív, lejárt, abortálás alatt álló, bizonytalanul befejezett, karanténban tartott, vizsgálat alatt álló, elutasított és tisztának jelölt munkameneteket. Soha nem módosít DB-t, S3-at, CLEAN státuszt vagy quota-reservationt.

## Kiadás előtti kritikus függőségek

- A v010 és v011 SQL még nem lett izolált PostgreSQL példányon szintaktikailag/transactionálisan kipróbálva. A v011 SQL forrás-/contractteszt PASS nem helyettesíti az adatbázistesztet.
- A v011 migráció alkalmazásának feltétele a v010 sikeres telepítése, és mindkettő külön engedélyezett DEV DB migration gate-et igényel.
- Ha később egy teljesen átvizsgált multipart karanténobjektum `USER` Content Core reffé válik, a rezerváció felszabadításának és a ref létrehozásának ugyanabban az advisory lockkal védett tranzakcióban kell történnie. Enélkül nincs CLEAN-re aktiválás, mert dupla kvótafoglalás vagy túllépés lehetséges.
- Lejárt, `COMPLETING` vagy `ABORTING` session automatikus törlése/felszabadítása tilos. Végrehajtó reconciler csak külön audit, dry-run és jóváhagyott workflow után készülhet.
- A ClamAV teljes, 5 GiB-os állományvizsgálati infrastruktúrája nincs kifejlesztve/validálva. Az egyes S3 részek vagy az ETag hash önmagukban nem elegendők a vírusmentesség igazolására.
- A böngészős, megszakítás után folytatható, tartós 5 GiB-os kliens és a valós hitelesített E2E teszt még hiányzik.
- A `PERSONAL_MULTIPART_SERVER_RELEASED=false` kódszintű tiltás és a DEV-only feltételek továbbra is kötelezőek.

## QA (SOURCE)

- TypeScript: PASS.
- Célzott ESLint: PASS.
- Új V0.9.59 kvóta-/ABORTING-/reconciliation-teszt: PASS.
- 15 szerződéses/regressziós teszt: PASS, beleértve V0.9.50–58, személyes mappakezelést, CsomagBOX-ot és folder-drop működést.
- Git diff check: PASS.
- PostgreSQL live/dry-run, S3 végpont E2E, malware worker E2E: NOT TESTED.

## Következő V0.9.60 prioritás

1. Izolált, valós PostgreSQL v010/v011 migration validation – kezdeti séma, FK, RLS, service_role, kvóta-kockázati versenyteszt és rollback.
2. A karanténból CLEAN-be átvezető atomikus kvótatranszfer + teljes 5 GiB-os vírusvizsgálat proof-of-capability (külön erőforrás- és jogosultsági audit).
3. S3 reconciliation olvasási adapter, csak read-only/dry-run az első körben; biztonságos orphan/restart helyzetek dokumentálása.
4. Ezután a tartós browser checkpoint, több-GiB resume, valós CORS és authenticated E2E; csak release gate után aktív DEV.

A PROD környezetben és a futó DEV runtime-ban nem történt változtatás.
