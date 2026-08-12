import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "benjadmin-dev-resources-"));
process.env.DIMPRO_DEV_RESOURCE_ROOT = root;
const mod = await import(`../app/lib/dev-center/development-resources.ts?acceptance=${Date.now()}`);
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

try {
  const file = new File(["BENJADMIN resource acceptance"], "../DIMPRO terv V1.txt", { type: "text/plain" });
  const saved = await mod.saveDevelopmentResource({
    module: "../BENJADMIN / Drive",
    title: "Kódolási segédanyag",
    description: "Acceptance",
    tags: "UI, Kötelező; ui",
    priority: "important",
    source: "ACCEPTANCE",
    version: "V1",
    requiredBeforeDevelopment: true,
    file,
  });
  check("Biztonságos modul normalizálás", () => assert.equal(saved.module, "benjadmin-drive"));
  check("Fájlnév traversal eltávolítva", () => assert.equal(saved.originalName, "DIMPRO terv V1.txt"));
  check("SHA-256 rögzítve", () => assert.match(saved.sha256, /^[0-9a-f]{64}$/));
  check("Kötelező segédanyag jelölés rögzítve", () => assert.equal(saved.requiredBeforeDevelopment, true));
  check("Címkék deduplikálva", () => assert.deepEqual(saved.tags, ["ui", "kötelező"]));
  const list = await mod.listDevelopmentResources();
  check("Index listázza a mentett segédanyagot", () => assert.equal(list.length, 1));
  const content = await mod.getDevelopmentResourceContent(saved.id);
  check("Tartalom hash ellenőrzéssel olvasható", () => assert.equal(content.bytes.toString("utf8"), "BENJADMIN resource acceptance"));
  const health = await mod.developmentResourceHealth();
  check("Tárhely health READY", () => assert.equal(health.ready, true));
  check("Health kötelező darabszám helyes", () => assert.equal(health.requiredBeforeDevelopment, 1));
  const indexRaw = await readFile(path.join(root, "index.json"), "utf8");
  check("Index nem tartalmaz abszolút tárolási útvonalat", () => assert.equal(indexRaw.includes(root), false));
  await mod.updateDevelopmentResource(saved.id, { archived: true });
  const active = await mod.listDevelopmentResources();
  const archived = await mod.listDevelopmentResources({ includeArchived: true });
  check("Archiválás nem destruktív, aktív listából eltűnik", () => assert.equal(active.length, 0));
  check("Archivált rekord visszaolvasható", () => assert.equal(archived.length, 1));
  await assert.rejects(() => mod.saveDevelopmentResource({ module: "test", file: new File(["x"], "malware.exe", { type: "application/octet-stream" }) }), /Nem engedélyezett fájltípus/);
  console.log("PASS Nem engedélyezett kiterjesztés blokkolt"); passed += 1;
  await assert.rejects(() => mod.saveDevelopmentResource({ module: "test", file: new File([], "empty.txt", { type: "text/plain" }) }), /Üres fájl/);
  console.log("PASS Üres fájl blokkolt"); passed += 1;
  console.log(JSON.stringify({ ok: true, passed, failed: 0 }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
