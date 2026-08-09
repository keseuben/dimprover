const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = process.cwd();
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      resolveJsonModule: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

process.env.DIMPRO_SEND_CODE_PEPPER = "test-only-send-code-pepper-0123456789abcdef";
process.env.DIMPRO_ACCESS_HASH_PEPPER = "test-only-access-hash-pepper-0123456789abcdef";
process.env.DIMPRO_SEND_SESSION_SECRET = "test-only-session-secret-0123456789abcdef";
process.env.DIMPRO_SEND_SESSION_TTL_SECONDS = "900";

const security = require(path.join(root, "app/lib/identity-core/security.ts"));

assert.equal(security.normalizeDimproSendCode("abcd 123 456"), "ABCD-123-456");
assert.equal(security.normalizeDimproSendCode("ABCD-123-45"), "");
assert.equal(security.normalizeDimproProjectCode("prj-26-k7m-4q9"), "PRJ-26-K7M-4Q9");
assert.equal(security.normalizeDimproProjectCode("PRJ-26-I7M-4Q9"), "");

const sendHashA = security.hashDimproSendCode("ABCD-123-456");
const sendHashB = security.hashDimproSendCode("abcd123456");
assert.equal(sendHashA, sendHashB);
assert.match(sendHashA, /^[a-f0-9]{64}$/);
assert.ok(!sendHashA.includes("ABCD"));

const ipHash = security.hashDimproRequestIp("192.0.2.10");
assert.match(ipHash, /^[a-f0-9]{64}$/);
assert.notEqual(ipHash, "192.0.2.10");

const entitlementId = "4f3f4da4-36c9-4ee5-8cc3-d0d353616b7f";
const session = security.createDimproSendSession(entitlementId);
assert.ok(session.token.startsWith("dss1."));
assert.ok(Date.parse(session.expiresAt) > Date.now());
const claims = security.verifyDimproSendSession(session.token);
assert.equal(claims.entitlementId, entitlementId);
assert.equal(claims.audience, "dimpro-send");

const tampered = `${session.token.slice(0, -1)}${session.token.endsWith("A") ? "B" : "A"}`;
assert.throws(() => security.verifyDimproSendSession(tampered), /lejárt vagy nem érvényes/);
assert.throws(() => security.verifyDimproSendSession("dss1.invalid.invalid"), /lejárt vagy nem érvényes/);

const bearerHeaders = new Headers({ Authorization: `Bearer ${session.token}` });
assert.equal(security.readBearerToken(bearerHeaders), session.token);

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Identity Core V010 security",
  checks: 16,
  sendCodeFormat: "ABCD-123-456",
  projectCodeFormat: "PRJ-YY-XXX-XXX",
  sessionPrefix: "dss1",
  rawSecretsPersisted: false,
}, null, 2));
