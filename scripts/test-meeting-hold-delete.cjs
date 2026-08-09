const fs = require('fs');
const source = fs.readFileSync('components/meeting-assistant/MeetingDeleteConfirmModal.tsx', 'utf8');
let checks = 0;
function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks += 1;
  console.log(`OK ${String(checks).padStart(2, '0')} ${label}`);
}
ok(source.includes('const HOLD_DURATION_MS = 3000'), 'hold duration is exactly three seconds');
ok(source.includes('requestAnimationFrame(tick)'), 'visible progress uses animation frames');
ok(source.includes('onPointerDown') && source.includes('onPointerUp={cancelHold}') && source.includes('onPointerLeave={cancelHold}') && source.includes('onPointerCancel={cancelHold}'), 'mouse and touch release or leave cancels hold');
ok(source.includes('event.key === "Enter"') && source.includes('event.key === " "') && source.includes('onKeyUp'), 'Enter and Space keyboard hold are supported');
ok(source.includes('style={{ width: `${Math.round(progress * 100)}%` }}'), 'delete button contains visible progress fill');
ok(source.includes('Tartsd még nyomva: ${remainingSeconds.toFixed(1)} mp'), 'button shows live countdown');
ok(source.includes('void onConfirm(name)') && !source.includes('<input'), 'successful hold submits stored target name without text entry');
ok(source.includes('touch-none'), 'touch scrolling is disabled while holding');
ok(source.includes('Biztosan törölni szeretnéd?') && source.includes('A művelet nem vonható vissza.'), 'warning remains visible before deletion');
console.log(`Hold-to-delete component checks completed successfully: ${checks} checks.`);
