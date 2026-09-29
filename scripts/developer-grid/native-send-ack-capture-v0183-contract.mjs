
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const main = fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/src/main.cjs"), "utf8");
const checks = [];
function check(name, ok) {
  if (!ok) {
    console.error("FAIL", name);
    process.exitCode = 1;
  } else {
    checks.push(name);
    console.log("PASS", String(checks.length).padStart(2, "0"), name);
  }
}
check("native Enter fallback exists", main.includes('sendInputEvent({ type:"keyDown", keyCode:"ENTER" })') && main.includes('sendInputEvent({ type:"keyUp", keyCode:"ENTER" })'));
check("native fallback requires owned marker to remain in composer", main.includes('marker && !String(draft.text || "").includes(marker)'));
check("native send is verified against transcript or empty composer", main.includes('verifyPromptMarkerInTranscript(view, marker, 8000)') && main.includes('native-enter-composer-cleared'));
check("unverified native send fails closed", main.includes('reason:"native-enter-not-observed"'));
check("BOOT ACK raw turn fallback exists", main.includes('candidateSource:"RAW_TURN_FALLBACK"'));
check("raw ACK fallback excludes Launch Packet template by requiring real work-start date", main.includes('MUNKAFELV[ÉE]TEL') && main.includes('\\\d{4}'));
check("raw ACK fallback requires coding decision and source proof", main.includes('Coding') && main.includes('Source') && main.includes('[a-f0-9]{64}'));
check("raw ACK fallback preserves Central Core validator path", main.includes('recordDeveloperGridBootAck({') && main.includes('validateBootAcknowledgement(text, expected)'));
if (process.exitCode) process.exit(process.exitCode);
console.log(`Developer Grid v0.1.94 native send + ACK capture contract PASS · ${checks.length}/${checks.length}`);
