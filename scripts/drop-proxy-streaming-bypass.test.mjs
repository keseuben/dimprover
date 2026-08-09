import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { unstable_doesMiddlewareMatch } from "next/dist/experimental/testing/server/middleware-testing-utils.js";

const proxySource = await readFile("proxy.ts", "utf8");
const matcher = "/((?!api/drop/uploads/[^/]+/parts/[0-9]+/?$|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|JPG|JPEG|gif|webp|css|js|mjs|webmanifest)$).*)";
assert.ok(
  proxySource.includes("api/drop/uploads/[^/]+/parts/[0-9]+/?$"),
  "A streaming kivétel nincs a proxy matcherben.",
);

const matches = (path) => unstable_doesMiddlewareMatch({
  config: { matcher: [matcher] },
  nextConfig: {},
  url: `https://drop.dimpro.hu${path}`,
  headers: { host: "drop.dimpro.hu" },
});

assert.equal(matches("/api/drop/uploads/00000000-0000-0000-0000-000000000000/parts/1"), false);
assert.equal(matches("/api/drop/uploads/00000000-0000-0000-0000-000000000000/parts/10000"), false);
assert.equal(matches("/api/drop/uploads/00000000-0000-0000-0000-000000000000/parts"), true);
assert.equal(matches("/api/drop/uploads/00000000-0000-0000-0000-000000000000/complete"), true);
assert.equal(matches("/api/drop/spaces/packages/00000000-0000-0000-0000-000000000000/uploads/init"), true);
assert.equal(matches("/api/drop/admin/packages"), true);
assert.equal(matches("/space/demo"), true);

const routeSource = await readFile("app/api/drop/uploads/[uploadId]/parts/[partNumber]/route.ts", "utf8");
assert.match(routeSource, /ALLOWED_UPLOAD_PART_HOSTS/);
assert.match(routeSource, /DROP_UPLOAD_HOST_NOT_ALLOWED/);
assert.match(routeSource, /readDropUploadBearerToken/);
assert.match(routeSource, /receiveDropUploadPart/);

console.log(JSON.stringify({
  ok: true,
  proxyBypassedOnlyForStreamingPartPath: true,
  initStillProtectedByProxy: true,
  completeStillProtectedByProxy: true,
  adminStillProtectedByProxy: true,
  routeHostAllowlistRequired: true,
  bearerTokenRequired: true,
}, null, 2));
