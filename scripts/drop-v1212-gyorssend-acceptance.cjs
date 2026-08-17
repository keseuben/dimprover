const fs = require('fs');
const ui = fs.readFileSync('components/drop/DropPublicHexUploader.tsx','utf8');
const transfer = fs.readFileSync('components/drop/DropPublicTransferClient.tsx','utf8');
const postgresRepo = fs.readFileSync('app/lib/drop/public/dropPublicPostgresRepository.ts','utf8');
const api = fs.readFileSync('app/api/drop/public/packages/[packageId]/finalize/route.ts','utf8');
const service = fs.readFileSync('app/lib/drop/public/dropPublicFinalizeService.ts','utf8');
const workflowService = fs.readFileSync('app/lib/drop/public/dropPublicWorkflowService.ts','utf8');
const worker = fs.readFileSync('app/lib/drop/worker/dropWorkerService.ts','utf8');
const tests = [
 ['6 lépéses sticky stepper', ui.includes('aria-label="GyorsSend lépések"') && ['Beállítások','Képek','Ellenőrzés','Mentés','Riport','Lezárás'].every(x=>ui.includes(`"${x}"`))],
 ['Stepper már a Gyors KépSend alapadatoknál látható', transfer.includes('data-drop-quick-send-precreate-stepper') && transfer.includes('sendMode === "quick_image"') && transfer.includes('DROP_QUICK_SEND_WORKFLOW_STEPS.map')],
 ['Gyors KépSend a 2. Képek lépésen folytatódik', transfer.includes('initialWorkflowStep={created.workflow.quickImageSend ? 1 : 0}') && ui.includes('initialWorkflowStep = 0') && ui.includes('Math.min(DROP_QUICK_SEND_WORKFLOW_STEPS.length - 1, initialWorkflowStep)')],
 ['Régebbi DEV workflow séma kompatibilis', postgresRepo.includes('OPTIONAL_WORKFLOW_COLUMNS') && postgresRepo.includes('isOptionalWorkflowSchemaError') && postgresRepo.includes('workflowRowForLegacySchema') && postgresRepo.includes('PGRST204')],
 ['Mentett Send-kód balra húzással törölhető', transfer.includes('SwipeDeleteSendCodeControl') && transfer.includes('Húzza balra a mentett kód törléséhez') && transfer.includes('offset <= threshold') && transfer.includes('bg-rose-100')],
 ['Mentett Send-kód desktop alternatíva', transfer.includes('Kód törlése') && transfer.includes('onClick={onConfirm}')],
 ['Mobil stepper mind a 6 pontot egyszerre mutatja', ui.includes('grid grid-cols-6 gap-1') && ui.includes('hidden sm:inline') && !ui.includes('overflow-x-auto rounded-2xl border border-cyan-200 bg-white/95')],
 ['Egyszerre egy egyszerű lépés látható', ui.includes('workflowStep === 0 ? <div>') && ui.includes('className={workflowStep === 1 ? "block" : "hidden"}') && [2,3,4,5].every(x=>ui.includes(`workflowStep === ${x} ? "block" : "hidden"`))],
 ['Haladó beállítások alapból összecsukva', ui.includes('<details className="mt-3 rounded-2xl') && ui.includes('További beállítások') && ui.includes('· opcionális')],
 ['Egyszerű előre-vissza navigáció', ['Tovább a képekhez','Tovább az ellenőrzéshez','Tovább a mentéshez','Tovább a riporthoz','Tovább a lezáráshoz'].every(x=>ui.includes(x))],
 ['Stepper visszalépés state-törlés nélkül', ui.includes('onClick={() => goToStep(index)}') && ui.includes('setWorkflowStep(safeStep)') && !ui.includes('function goToStep(step: number) {\n    setQueue([])')],
 ['Feltöltés normál kattintás', ui.includes('? "Feltöltés folytatása" : "Fájlok feltöltése"') && !ui.includes('Fájlok feltöltése · 2 mp')],
 ['Véglegesítés slide-to-confirm', ui.includes('SlideConfirm') && ui.includes('Húzza jobbra a küldemény véglegesítéséhez')],
 ['Slide 85% küszöb', ui.includes('progress >= 85')],
 ['Slide reszponzív sínpozíció', ui.includes('left: `calc(${progress}% - ${progress * 0.56}px)`')],
 ['Billentyűzetes alternatíva', ui.includes('event.key === "Enter"') && ui.includes('event.key === " "')],
 ['Riport alapállapot nem küld', ui.includes('useState<DropReportMode>("none")') && ui.includes('Riportküldés nélkül')],
 ['Három riportmód', ['none','generate_only','generate_send'].every(x=>ui.includes(`"${x}"`))],
 ['Riportmód API átadás', ui.includes('JSON.stringify({ reportMode })') && api.includes('reportMode')],
 ['Riport e-mail csak explicit generate_send', service.includes('input.reportMode === "generate_send"') && service.includes('automaticReportEmailEnabled')],
 ['Riportpreferencia auditált', service.includes('public.report.preference')],
 ['Retention riport külön marad', worker.includes('ensureFinalReportJob') && worker.includes('send_final_report_to_uploader !== false')],
 ['Bal swipe törlés küszöb', ui.includes('offset <= -72') && ui.includes('softDelete(item.id)')],
 ['Bal swipe piros háttér', (ui.includes('bg-rose-100') || ui.includes('bg-rose-50')) && ui.includes('Törlés')],
 ['Törlés Undo 6 mp', ui.includes('undoSwipeDelete') && ui.includes('Visszavonás') && ui.includes('6000')],
 ['Desktop törlés is Undo útvonal', ui.includes('aria-label={`${item.displayName} eltávolítása`}') && ui.includes('onClick={() => softDelete(item.id)}')],
 ['Jobb swipe feltöltésre kész', ui.includes('offset >= 72') && ui.includes('Feltöltésre kész')],
 ['Jobb swipe zöld háttér', ui.includes('bg-emerald-100')],
 ['Swipe függőleges scroll-védelem', ui.includes('Math.abs(rawY) > Math.abs(rawX)') && ui.includes('Math.abs(rawX) < 8')],
 ['Telefonra mentés opció', ui.includes('saveToDevice') && ui.includes('Mentés a telefonra is')],
 ['Telefonra mentés nem nyit Web Share menüt', !ui.includes('nav.canShare') && !ui.includes('nav.share') && !ui.includes('navigator.share')],
 ['Telefonra mentés közvetlen download', ui.includes('anchor.download = file.name')],
 ['Upload nem küld emailt', ui.includes('A fájlok feltöltése önmagában nem küld e-mailt')],
 ['Worker nem véglegesít not_requested csomagot', service.includes('.eq("notification_status", "pending")') && !service.includes('.in("notification_status", ["not_requested", "pending"])')],
 ['Explicit véglegesítés scan-várakozásnál pending retry', service.includes('notificationStatus: "pending"') && service.includes('A puszta fájlfeltöltés nem indíthat automatikus kézbesítést')],
 ['Stale 2 mp véglegesítés szöveg eltávolítva', !ui.includes('2 másodperces véglegesítés után')],
 ['Gyors KépSend 200 képes limit', workflowService.includes('maxFileCount: quickImageSend ? 200 : defaults.limits.maxFileCount')],
 ['14 és 30 napos retention támogatás', workflowService.includes('[1, 3, 5, 7, 14, 30].includes(parsed)') && transfer.includes('[5, 7, 14, 30].map')],
 ['DEV PWA külön név', fs.readFileSync('app/drop/layout.tsx','utf8').includes('DIMPRO Drop DEV') && fs.readFileSync('public/drop-dev.webmanifest','utf8').includes('Drop DEV')],
];
let failed=0;
tests.forEach(([name,ok],i)=>{if(!ok) failed++; console.log(`${String(i+1).padStart(2,'0')}. ${ok?'PASS':'FAIL'} - ${name}`)});
console.log(`SUMMARY: ${tests.length-failed}/${tests.length} PASS`);
process.exit(failed?1:0);
