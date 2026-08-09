import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createDropCapabilityToken,
  hashDropPin,
  inferDropTokenPurpose,
  safeTokenReference,
  verifyDropPin,
} from "../app/lib/drop/dropCrypto";
import { parseDropCreatePackageInput } from "../app/lib/drop/dropValidation";
import type { DropAccessPurpose } from "../app/lib/drop/dropTypes";

process.env.DROP_TOKEN_HMAC_SECRET = "test-token-secret-".repeat(4);
process.env.DROP_SESSION_SECRET = "test-session-secret-".repeat(4);

const pin = "684219";
const pinHash = hashDropPin(pin);
assert.equal(pinHash.hash.length, 128, "A PIN scrypt hash 64 bájtos legyen.");
assert.equal(verifyDropPin(pin, pinHash.hash, pinHash.salt), true, "A helyes PIN ellenőrzése sikertelen.");
assert.equal(verifyDropPin("684218", pinHash.hash, pinHash.salt), false, "A hibás PIN nem fogadható el.");

const purposes: DropAccessPurpose[] = ["upload", "view", "download", "report"];
const rawTokens = new Set<string>();
for (const purpose of purposes) {
  const token = createDropCapabilityToken(purpose, new Date(Date.now() + 60_000).toISOString());
  assert.equal(token.tokenHash.length, 64, `${purpose}: a HMAC hash hossza hibás.`);
  assert.equal(inferDropTokenPurpose(token.rawToken), purpose, `${purpose}: a tokentípus nem azonosítható.`);
  assert.equal(token.tokenHash.includes(token.rawToken), false, `${purpose}: a nyers token nem lehet a hash részeként olvasható.`);
  assert.equal(safeTokenReference(token.rawToken).includes(token.rawToken), false, `${purpose}: a biztonságos hivatkozás kiszivárogtatja a tokent.`);
  rawTokens.add(token.rawToken);
}
assert.equal(rawTokens.size, purposes.length, "A capability-tokenek nem egyediek.");

const parsed = parseDropCreatePackageInput({
  mode: "file",
  title: "Teszt csomag",
  description: "Fájl nélküli repository teszt",
  uploaderName: "Teszt Elek",
  uploaderEmail: "teszt@example.hu",
  retentionDays: 7,
  recipients: [{ name: "Címzett", email: "recipient@example.hu" }],
  groups: [{ name: "Tervek" }],
});
assert.equal(parsed.mode, "file");
assert.equal(parsed.recipients.length, 1);
assert.equal(parsed.groups[0]?.code, "tervek");

assert.throws(
  () => parseDropCreatePackageInput({
    mode: "file",
    title: "Duplikált címzett",
    uploaderName: "Teszt Elek",
    uploaderEmail: "teszt@example.hu",
    recipients: [
      { name: "A", email: "same@example.hu" },
      { name: "B", email: "same@example.hu" },
    ],
  }),
  /többször szerepel/,
);

const accessMigration = readFileSync("supabase/migrations/20260801003000_drop_access_engine.sql", "utf8");
assert.match(accessMigration, /create table if not exists public\.drop_access_tokens/i);
assert.match(accessMigration, /create table if not exists public\.drop_access_attempts/i);
assert.match(accessMigration, /enable row level security/i);
assert.doesNotMatch(accessMigration, /create policy/i, "A migráció nem hozhat létre anonim RLS policyt.");
assert.match(accessMigration, /Raw upload\/view\/download\/report tokens must never be persisted/i);

const repository = readFileSync("app/lib/drop/dropRepository.ts", "utf8");
assert.doesNotMatch(repository, /raw_token\s*:/i, "A repository nem menthet raw_token mezőt.");
assert.match(repository, /token_hash:\s*token\.tokenHash/);
assert.match(repository, /pin_hash:\s*pinHash/);

const openRoute = readFileSync("app/api/drop/access/open/route.ts", "utf8");
assert.match(openRoute, /purpose:\s*"view"/, "A nyilvános PIN kapu csak view tokent adhat.");

const proxySource = readFileSync("proxy.ts", "utf8");
assert.doesNotMatch(proxySource, /console\.log\([^\n]*request\.nextUrl\.pathname/, "A proxy nem naplózhat nyers tokenes útvonalat.");
assert.match(proxySource, /pathname === "\/api\/drop\/access\/open"/);
assert.match(proxySource, /pathname\.startsWith\("\/api\/drop\/admin\/"\)/);

console.log("DROP 0.2.0 core security tests: PASS");
