import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type DropPrivatePilotStatus = "pending" | "passed" | "failed" | "blocked" | "not_applicable";
export type DropPrivatePilotCategoryId = "mobile" | "email" | "zip" | "accessibility" | "operations" | "release";

export type DropPrivatePilotCaseDefinition = {
  id: string;
  categoryId: DropPrivatePilotCategoryId;
  title: string;
  description: string;
  critical: boolean;
  manualOnly: boolean;
};

export type DropPrivatePilotRecord = {
  id: string;
  status: DropPrivatePilotStatus;
  notes: string;
  evidence: string;
  environment: string;
  device: string;
  reviewedAt?: string;
  updatedAt: string;
};

type DropPrivatePilotStateFile = {
  version: 1;
  productVersion: "DROP 1.0.0";
  updatedAt: string;
  records: DropPrivatePilotRecord[];
};

export type DropPrivatePilotAutomatedCheck = {
  id: string;
  title: string;
  status: "passed" | "warning" | "failed";
  detail: string;
  durationMs?: number;
};

export type DropPrivatePilotAutomatedReport = {
  version: 1;
  targetVersion: "DROP 1.0.0";
  generatedAt: string;
  overallStatus: "passed" | "warning" | "failed";
  summary: { passed: number; warning: number; failed: number; total: number };
  checks: DropPrivatePilotAutomatedCheck[];
};

export const DROP_PRIVATE_PILOT_CATEGORIES = [
  { id: "mobile", label: "Fizikai mobil és PWA" },
  { id: "email", label: "Valódi levelezőkliensek" },
  { id: "zip", label: "PIN-védett többfájlos ZIP" },
  { id: "accessibility", label: "Hozzáférhetőség és UX" },
  { id: "operations", label: "Üzemeltetés és teljesítmény" },
  { id: "release", label: "Végleges release gate" },
] as const satisfies ReadonlyArray<{ id: DropPrivatePilotCategoryId; label: string }>;

export const DROP_PRIVATE_PILOT_CASES: readonly DropPrivatePilotCaseDefinition[] = [
  { id: "iphone_safari", categoryId: "mobile", title: "iPhone Safari alapfolyamat", description: "Megnyitás, jogosultság, feltöltés, letöltés és oldalfrissítés fizikai iPhone-on.", critical: true, manualOnly: true },
  { id: "iphone_pwa_icon", categoryId: "mobile", title: "iPhone PWA telepítés és ikon", description: "Régi ikon eltávolítása, újratelepítés, Apple Touch ikon és főképernyős megjelenés.", critical: true, manualOnly: true },
  { id: "iphone_camera_10", categoryId: "mobile", title: "iPhone 5–10 kamerafotó", description: "Egymást követő kameraképek, HEIC/JPEG vegyes sor, bélyegképek és újabb fotó művelet.", critical: true, manualOnly: true },
  { id: "iphone_network_switch", categoryId: "mobile", title: "iPhone Wi‑Fi ↔ mobilinternet", description: "Feltöltés közbeni hálózatváltás, újrakötés és multipart folytatás.", critical: true, manualOnly: true },
  { id: "iphone_low_power_wakelock", categoryId: "mobile", title: "iPhone energiatakarékos mód", description: "Alacsony akkumulátor és energiatakarékos mód melletti Wake Lock fallback és helyreállítás.", critical: true, manualOnly: true },
  { id: "android_chrome", categoryId: "mobile", title: "Android Chrome alapfolyamat", description: "Megnyitás, jogosultság, feltöltés, letöltés és oldalfrissítés fizikai Android készüléken.", critical: true, manualOnly: true },
  { id: "android_maskable_icon", categoryId: "mobile", title: "Android PWA és maskable ikon", description: "Telepítés, launcher-ikon, maskable vágás és gyorsparancsok ellenőrzése.", critical: true, manualOnly: true },
  { id: "android_camera_10", categoryId: "mobile", title: "Android 5–10 kamerafotó", description: "Egymást követő kameraképek, optimalizálás, sor és finalizálás.", critical: true, manualOnly: true },
  { id: "android_network_switch", categoryId: "mobile", title: "Android Wi‑Fi ↔ mobilinternet", description: "Feltöltés közbeni hálózatváltás, automatikus retry és folytatás.", critical: true, manualOnly: true },
  { id: "android_battery_saver_wakelock", categoryId: "mobile", title: "Android akkukímélő és Wake Lock", description: "Akkukímélő mód, alkalmazásváltás, képernyőzár és visszatérés.", critical: true, manualOnly: true },

  { id: "gmail_web_light", categoryId: "email", title: "Gmail web – világos mód", description: "CID-képek, fájlkártyák, alt szöveg, gomb, PIN és ZIP-tájékoztató.", critical: true, manualOnly: true },
  { id: "gmail_web_dark", categoryId: "email", title: "Gmail web – sötét mód", description: "Olvashatóság, automatikus színinverzió és kontraszt.", critical: true, manualOnly: true },
  { id: "gmail_mobile_light", categoryId: "email", title: "Gmail mobil – világos mód", description: "Mobil tördelés, képelőnézetek, fájlnevek és CTA.", critical: true, manualOnly: true },
  { id: "gmail_mobile_dark", categoryId: "email", title: "Gmail mobil – sötét mód", description: "Sötét téma, kártyák, PIN-blokk és olvashatóság.", critical: true, manualOnly: true },
  { id: "thunderbird_light", categoryId: "email", title: "Thunderbird – világos mód", description: "Valós SMTP-küldés és teljes levélsablon ellenőrzése.", critical: true, manualOnly: true },
  { id: "thunderbird_dark", categoryId: "email", title: "Thunderbird – sötét mód", description: "Sötét téma és CID-képek megjelenítése.", critical: true, manualOnly: true },
  { id: "outlook_or_apple_light", categoryId: "email", title: "Outlook vagy Apple Mail – világos", description: "Legalább egy további levelezőkliens valós tesztje.", critical: true, manualOnly: true },
  { id: "outlook_or_apple_dark", categoryId: "email", title: "Outlook vagy Apple Mail – sötét", description: "Ugyanazon kliens sötét módban, kontraszt- és tördelésellenőrzéssel.", critical: true, manualOnly: true },

  { id: "pin_zip_create", categoryId: "zip", title: "Többfájlos link + PIN csomag", description: "Valós, több fájlt tartalmazó PIN-védett tesztcsomag létrehozása.", critical: true, manualOnly: true },
  { id: "pin_proof_cookie", categoryId: "zip", title: "PIN-proof cookie", description: "Sikeres PIN után a védett letöltés működik, más böngészőben vagy lejárat után nem.", critical: true, manualOnly: true },
  { id: "pin_wrong_attempt_limit", categoryId: "zip", title: "Hibás PIN limit", description: "Hibás próbálkozások rate limitje és auditja működik.", critical: true, manualOnly: true },
  { id: "pin_zip_download", categoryId: "zip", title: "Valós ZIP-letöltés", description: "Minden fájl, manifest és megjegyzés szerepel; a böngésző letöltése sikeres.", critical: true, manualOnly: true },
  { id: "pin_zip_hash_audit", categoryId: "zip", title: "SHA-256 és letöltési audit", description: "Fájlonkénti hash, audit és csomagesemény ellenőrzése.", critical: true, manualOnly: true },
  { id: "pin_expiry", categoryId: "zip", title: "Lejárat és jogosultságvesztés", description: "Lejárt link, PIN-proof és token nem biztosít hozzáférést.", critical: true, manualOnly: true },
  { id: "pin_cleanup", categoryId: "zip", title: "Tesztcsomag teljes törlése", description: "Adatbázis-, Object Storage-, audit- és ideiglenes maradvány ellenőrzése.", critical: true, manualOnly: true },

  { id: "keyboard_navigation", categoryId: "accessibility", title: "Billentyűzetes navigáció", description: "Tab-sorrend, fókuszláthatóság, Enter/Space műveletek és modalok.", critical: true, manualOnly: false },
  { id: "screen_reader_labels", categoryId: "accessibility", title: "Képernyőolvasó címkék", description: "Gombok, mezők, állapotok, ikonok és hibák értelmes nevekkel rendelkeznek.", critical: true, manualOnly: false },
  { id: "zoom_200", categoryId: "accessibility", title: "200%-os zoom és reflow", description: "Nincs funkcióvesztés, takarás vagy vízszintes kényszergörgetés a fő folyamatokban.", critical: true, manualOnly: false },
  { id: "contrast_light", categoryId: "accessibility", title: "Világos mód kontraszt", description: "Szöveg, gomb, fókusz és állapotjelzés kontrasztja megfelelő.", critical: true, manualOnly: false },
  { id: "contrast_dark", categoryId: "accessibility", title: "Sötét mód kontraszt", description: "Sötét témában minden lényeges elem olvasható és megkülönböztethető.", critical: true, manualOnly: false },
  { id: "final_error_messages", categoryId: "accessibility", title: "Végleges hibaszövegek", description: "A hibák közérthetők, megoldást javasolnak és nem fednek fel belső adatot.", critical: true, manualOnly: false },

  { id: "large_zip_state", categoryId: "operations", title: "Nagy ZIP állapotjelzés", description: "A felület jelzi a várakozást, az eltelt időt és a nagy csomag várható hosszabb feldolgozását.", critical: true, manualOnly: false },
  { id: "large_zip_performance", categoryId: "operations", title: "Nagy ZIP teljesítmény", description: "Nagy csomag streamelése memória- és időkorlát nélkül, mért eredménnyel.", critical: true, manualOnly: true },
  { id: "scanner_wait_performance", categoryId: "operations", title: "Scanner-várakozás és nagy fájl", description: "ClamAV sor, két párhuzamos vizsgálat és nagy fájl ideje dokumentált.", critical: true, manualOnly: true },
  { id: "smtp_delivery_metrics", categoryId: "operations", title: "SMTP kézbesítési mutatók", description: "Sikeres/hibás küldés, message ID és valós kliensvisszajelzés rögzített.", critical: true, manualOnly: true },
  { id: "backup_restore", categoryId: "operations", title: "Backup és visszaállítási próba", description: "Mentés megléte, integritása és kontrollált helyreállítási lépések ellenőrzése.", critical: true, manualOnly: true },
  { id: "privacy_terms", categoryId: "operations", title: "Adatvédelem és feltételek", description: "Adatkezelési, megőrzési és felhasználási tájékoztatók végleges ellenőrzése.", critical: true, manualOnly: true },

  { id: "release_full_regression", categoryId: "release", title: "Teljes regresszió", description: "Szerződéses, TypeScript, lint, build, API, böngésző és storage tesztek.", critical: true, manualOnly: false },
  { id: "release_physical_matrix", categoryId: "release", title: "Fizikai eszközmátrix kész", description: "Az összes kötelező iPhone és Android tétel lezárt.", critical: true, manualOnly: true },
  { id: "release_email_matrix", categoryId: "release", title: "Levelezőkliens-mátrix kész", description: "Gmail, Thunderbird és Outlook/Apple Mail világos és sötét ellenőrzése lezárt.", critical: true, manualOnly: true },
  { id: "release_pin_zip_e2e", categoryId: "release", title: "PIN-es ZIP E2E kész", description: "Valós csomag, PIN, ZIP, hash, audit, lejárat és takarítás lezárt.", critical: true, manualOnly: true },
  { id: "release_backup_rollback", categoryId: "release", title: "Backup és rollback gate", description: "Aktív backup, közvetlen rollback és visszaállítási próba dokumentált.", critical: true, manualOnly: true },
  { id: "release_documentation", categoryId: "release", title: "Dokumentáció és release manifest", description: "Állapot, részletes dokumentum, README, manifest és Fejlesztési Központ naprakész.", critical: true, manualOnly: false },
  { id: "release_private_pilot_feedback", categoryId: "release", title: "Private-pilot visszajelzések", description: "Visszajelzések súlyosság szerint besorolva, blokkoló hiba nélkül.", critical: true, manualOnly: true },
];

function resolveProjectRoot() {
  const configured = process.env.DIMPRO_PROJECT_ROOT?.trim();
  if (configured) return path.resolve(configured);
  const cwd = process.cwd();
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;
  return cwd.endsWith(standaloneSuffix) ? cwd.slice(0, -standaloneSuffix.length) : cwd;
}

const validationDir = path.join(resolveProjectRoot(), ".dimprover", "validation");
const stateFile = path.join(validationDir, "drop-private-pilot-v100.json");
const automatedReportFile = path.join(validationDir, "drop-v100-preflight.json");

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function cleanStatus(value: unknown): DropPrivatePilotStatus | null {
  return value === "pending" || value === "passed" || value === "failed" || value === "blocked" || value === "not_applicable"
    ? value
    : null;
}

function defaultRecord(id: string): DropPrivatePilotRecord {
  return {
    id,
    status: "pending",
    notes: "",
    evidence: "",
    environment: "",
    device: "",
    updatedAt: new Date(0).toISOString(),
  };
}

async function ensureValidationDir() {
  await mkdir(validationDir, { recursive: true, mode: 0o700 });
}

async function loadStateFile(): Promise<DropPrivatePilotStateFile> {
  await ensureValidationDir();
  try {
    const parsed = JSON.parse(await readFile(stateFile, "utf8")) as DropPrivatePilotStateFile;
    if (parsed.version !== 1 || parsed.productVersion !== "DROP 1.0.0" || !Array.isArray(parsed.records)) {
      throw new Error("invalid-state");
    }
    const allowedIds = new Set(DROP_PRIVATE_PILOT_CASES.map((item) => item.id));
    return {
      version: 1,
      productVersion: "DROP 1.0.0",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
      records: parsed.records.filter((record) => record && allowedIds.has(record.id) && cleanStatus(record.status)),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { version: 1, productVersion: "DROP 1.0.0", updatedAt: new Date(0).toISOString(), records: [] };
    }
    throw Object.assign(new Error("A DROP 1.0.0 private-pilot validációs állapot nem olvasható biztonságosan."), {
      code: "DROP_PRIVATE_PILOT_STATE_INVALID",
    });
  }
}

async function saveStateFile(state: DropPrivatePilotStateFile) {
  await ensureValidationDir();
  const normalized: DropPrivatePilotStateFile = {
    version: 1,
    productVersion: "DROP 1.0.0",
    updatedAt: new Date().toISOString(),
    records: state.records,
  };
  const temporary = `${stateFile}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, stateFile);
}

async function loadAutomatedReport(): Promise<DropPrivatePilotAutomatedReport | null> {
  try {
    const parsed = JSON.parse(await readFile(automatedReportFile, "utf8")) as DropPrivatePilotAutomatedReport;
    if (parsed.version !== 1 || parsed.targetVersion !== "DROP 1.0.0" || !Array.isArray(parsed.checks)) return null;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    return null;
  }
}

function createSummary(records: DropPrivatePilotRecord[]) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const merged = DROP_PRIVATE_PILOT_CASES.map((definition) => ({ definition, record: byId.get(definition.id) || defaultRecord(definition.id) }));
  const applicable = merged.filter((item) => item.record.status !== "not_applicable");
  const counts = {
    total: applicable.length,
    passed: applicable.filter((item) => item.record.status === "passed").length,
    pending: applicable.filter((item) => item.record.status === "pending").length,
    failed: applicable.filter((item) => item.record.status === "failed").length,
    blocked: applicable.filter((item) => item.record.status === "blocked").length,
    notApplicable: merged.filter((item) => item.record.status === "not_applicable").length,
  };
  const critical = merged.filter((item) => item.definition.critical);
  const criticalFailed = critical.filter((item) => item.record.status === "failed" || item.record.status === "blocked");
  const criticalOpen = critical.filter((item) => item.record.status !== "passed");
  const releaseGate = criticalFailed.length > 0 ? "blocked" : criticalOpen.length > 0 ? "pending" : "ready";
  const completionPercent = counts.total > 0 ? Math.round((counts.passed / counts.total) * 100) : 0;
  return {
    counts,
    completionPercent,
    releaseGate,
    criticalOpenIds: criticalOpen.map((item) => item.definition.id),
    criticalFailedIds: criticalFailed.map((item) => item.definition.id),
  };
}

export async function getDropPrivatePilotValidation() {
  const [state, automatedReport] = await Promise.all([loadStateFile(), loadAutomatedReport()]);
  const byId = new Map(state.records.map((record) => [record.id, record]));
  const cases = DROP_PRIVATE_PILOT_CASES.map((definition) => ({
    ...definition,
    record: byId.get(definition.id) || defaultRecord(definition.id),
  }));
  return {
    version: "DROP 1.0.0",
    updatedAt: state.updatedAt,
    categories: DROP_PRIVATE_PILOT_CATEGORIES,
    cases,
    summary: createSummary(state.records),
    automatedReport,
    safety: {
      adminOnly: true,
      manualReleaseRequired: true,
      automatedChecksCannotRelease: true,
      rawTokensStored: false,
      maximumNotesLength: 2000,
      maximumEvidenceLength: 1000,
    },
  };
}

export async function updateDropPrivatePilotValidation(input: {
  id: unknown;
  status: unknown;
  notes?: unknown;
  evidence?: unknown;
  environment?: unknown;
  device?: unknown;
}) {
  const id = cleanText(input.id, 120);
  const status = cleanStatus(input.status);
  const definition = DROP_PRIVATE_PILOT_CASES.find((item) => item.id === id);
  if (!definition || !status) {
    throw Object.assign(new Error("Érvénytelen private-pilot validációs tétel vagy állapot."), {
      code: "DROP_PRIVATE_PILOT_INPUT_INVALID",
    });
  }
  const state = await loadStateFile();
  const now = new Date().toISOString();
  const record: DropPrivatePilotRecord = {
    id,
    status,
    notes: cleanText(input.notes, 2000),
    evidence: cleanText(input.evidence, 1000),
    environment: cleanText(input.environment, 300),
    device: cleanText(input.device, 300),
    reviewedAt: status === "pending" ? undefined : now,
    updatedAt: now,
  };
  const index = state.records.findIndex((item) => item.id === id);
  if (index >= 0) state.records[index] = record;
  else state.records.push(record);
  await saveStateFile(state);
  return { definition, record, summary: createSummary(state.records) };
}
