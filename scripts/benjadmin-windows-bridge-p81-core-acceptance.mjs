import assert from "node:assert/strict";
import {
  WINDOWS_BRIDGE_PAIRING_ATTEMPT_LIMIT,
  createWindowsBridgePairingCode,
  createWindowsBridgeToken,
  hashWindowsBridgePairingCode,
  hashWindowsBridgeToken,
  normalizeWindowsBridgePairingCode,
  safeWindowsBridgeHashEqual,
} from "../app/lib/dev-center/terminal-hub/windows-bridge-pairing-core.ts";
import {
  canWindowsBridgeDeviceTransition,
  canWindowsBridgePairingTransition,
} from "../app/lib/dev-center/terminal-hub/windows-bridge-pairing-state.ts";

let pass = 0;
function check(name, fn) {
  fn(); pass += 1; console.log(`PASS ${name}`);
}

check("Pairing attempt limit 5", () => assert.equal(WINDOWS_BRIDGE_PAIRING_ATTEMPT_LIMIT, 5));
check("Pairing normalize tagolásfüggetlen", () => assert.equal(normalizeWindowsBridgePairingCode("ab23c-de45f"), "AB23CDE45F"));
check("Pairing code 5-5 formátum", () => assert.match(createWindowsBridgePairingCode(), /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/));
check("Pairing code nem használ félreérthető karaktereket", () => { for (let i = 0; i < 500; i += 1) assert.doesNotMatch(createWindowsBridgePairingCode(), /[01ILO]/); });
check("Pairing code nem ismétlődik kis mintában", () => { const set = new Set(Array.from({ length: 500 }, () => createWindowsBridgePairingCode())); assert.equal(set.size, 500); });
check("Token base64url", () => assert.match(createWindowsBridgeToken(), /^[A-Za-z0-9_-]{43}$/));
check("Token hash SHA-256", () => assert.match(hashWindowsBridgeToken("device-token"), /^[0-9a-f]{64}$/));
check("Token hash determinisztikus", () => assert.equal(hashWindowsBridgeToken("x"), hashWindowsBridgeToken("x")));
check("Pairing HMAC 64 hex", () => assert.match(hashWindowsBridgePairingCode("s".repeat(32), "pair-1", "ABCDE-FG234"), /^[0-9a-f]{64}$/));
check("Pairing HMAC kódtagolást normalizál", () => assert.equal(hashWindowsBridgePairingCode("s".repeat(32), "pair-1", "ABCDE-FG234"), hashWindowsBridgePairingCode("s".repeat(32), "pair-1", "abcdefg234")));
check("Pairing HMAC pairing ID-hez kötött", () => assert.notEqual(hashWindowsBridgePairingCode("s".repeat(32), "pair-1", "ABCDE-FG234"), hashWindowsBridgePairingCode("s".repeat(32), "pair-2", "ABCDE-FG234")));
check("Pairing HMAC secrethez kötött", () => assert.notEqual(hashWindowsBridgePairingCode("a".repeat(32), "pair-1", "ABCDE-FG234"), hashWindowsBridgePairingCode("b".repeat(32), "pair-1", "ABCDE-FG234")));
check("Safe hash equal true", () => { const h = hashWindowsBridgeToken("x"); assert.equal(safeWindowsBridgeHashEqual(h, h), true); });
check("Safe hash equal false", () => assert.equal(safeWindowsBridgeHashEqual(hashWindowsBridgeToken("x"), hashWindowsBridgeToken("y")), false));
check("Safe hash malformed false", () => assert.equal(safeWindowsBridgeHashEqual("bad", "bad"), false));
check("Pairing pending → claimed", () => assert.equal(canWindowsBridgePairingTransition("pending", "claimed"), true));
check("Pairing pending → locked", () => assert.equal(canWindowsBridgePairingTransition("pending", "locked"), true));
check("Pairing claimed → completed", () => assert.equal(canWindowsBridgePairingTransition("claimed", "completed"), true));
check("Pairing completed terminális", () => assert.equal(canWindowsBridgePairingTransition("completed", "pending"), false));
check("Pairing locked terminális", () => assert.equal(canWindowsBridgePairingTransition("locked", "claimed"), false));
check("Device pending → approved", () => assert.equal(canWindowsBridgeDeviceTransition("pending", "approved"), true));
check("Device approved → active", () => assert.equal(canWindowsBridgeDeviceTransition("approved", "active"), true));
check("Device active → revoked", () => assert.equal(canWindowsBridgeDeviceTransition("active", "revoked"), true));
check("Device active → pending tiltott", () => assert.equal(canWindowsBridgeDeviceTransition("active", "pending"), false));
check("Device revoked → pending reparing megengedett", () => assert.equal(canWindowsBridgeDeviceTransition("revoked", "pending"), true));

console.log(`SUMMARY ${pass}/${pass} PASS`);
