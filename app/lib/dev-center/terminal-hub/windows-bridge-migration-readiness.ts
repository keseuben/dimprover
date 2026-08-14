import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getTerminalHubFeatureFlags } from "./config";

const MIGRATION_REL = "supabase/migrations/20260814230000_benjadmin_windows_bridge_p81.sql";
const SIDECAR_REL = `${MIGRATION_REL}.sha256`;

export type WindowsBridgeMigrationReadiness = {
  phase: "P8_1_DB_MIGRATION_GATE";
  readyForPreflight: boolean;
  readyForApplyAttempt: boolean;
  blockers: string[];
  configuration: {
    expectedDevTargetConfigured: boolean;
    databaseUrlConfigured: boolean;
    databasePasswordConfigured: boolean;
    productionTargetConfigured: boolean;
    pairingSecretConfigured: boolean;
  };
  safety: {
    bridgeOff: boolean;
    pairingOff: boolean;
    executionOff: boolean;
    terminalExecutionOff: boolean;
    prodTerminalOff: boolean;
  };
  artifact: {
    migration: string;
    migrationPresent: boolean;
    sha256SidecarPresent: boolean;
    sha256Valid: boolean;
  };
  note: string;
  generatedAt: string;
};

function configured(name: string) { return Boolean(process.env[name]?.trim()); }
function sha256(buffer: Buffer) { return createHash("sha256").update(buffer).digest("hex"); }

export function getWindowsBridgeMigrationReadiness(cwd = process.cwd()): WindowsBridgeMigrationReadiness {
  const flags = getTerminalHubFeatureFlags();
  const migrationPath = path.join(cwd, MIGRATION_REL);
  const sidecarPath = path.join(cwd, SIDECAR_REL);
  const migrationPresent = existsSync(migrationPath);
  const sha256SidecarPresent = existsSync(sidecarPath);
  let sha256Valid = false;
  if (migrationPresent && sha256SidecarPresent) {
    const expected = readFileSync(sidecarPath, "utf8").trim().split(/\s+/)[0];
    sha256Valid = /^[0-9a-f]{64}$/.test(expected) && expected === sha256(readFileSync(migrationPath));
  }

  const configuration = {
    expectedDevTargetConfigured: configured("BENJADMIN_EXPECTED_SUPABASE_URL") || configured("NEXT_PUBLIC_SUPABASE_URL"),
    databaseUrlConfigured: configured("SUPABASE_DB_URL"),
    databasePasswordConfigured: configured("SUPABASE_DB_PASSWORD"),
    productionTargetConfigured: configured("BENJADMIN_PROD_SUPABASE_URL"),
    pairingSecretConfigured: Boolean(process.env.BENJADMIN_WINDOWS_BRIDGE_PAIRING_SECRET?.trim() && process.env.BENJADMIN_WINDOWS_BRIDGE_PAIRING_SECRET!.trim().length >= 32),
  };
  const safety = {
    bridgeOff: !flags.windowsBridgeEnabled,
    pairingOff: !flags.windowsBridgePairingEnabled,
    executionOff: !flags.windowsBridgeExecutionEnabled,
    terminalExecutionOff: !flags.terminalExecutionEnabled,
    prodTerminalOff: !flags.prodTerminalEnabled,
  };
  const blockers: string[] = [];
  if (!configuration.expectedDevTargetConfigured) blockers.push("DEV Supabase target nincs azonosítva.");
  if (!configuration.databaseUrlConfigured) blockers.push("DEV PostgreSQL URL nincs secure env-ben.");
  if (!configuration.databasePasswordConfigured) blockers.push("DEV PostgreSQL jelszó nincs secure env-ben.");
  if (!configuration.productionTargetConfigured) blockers.push("PROD Supabase target nincs megadva az elkülönítés bizonyításához.");
  if (!migrationPresent) blockers.push("P8.1 migration fájl hiányzik.");
  if (!sha256SidecarPresent || !sha256Valid) blockers.push("P8.1 migration SHA-256 ellenőrzés nem kész.");
  if (!safety.bridgeOff || !safety.pairingOff || !safety.executionOff || !safety.terminalExecutionOff || !safety.prodTerminalOff) blockers.push("A migráció előtt minden Bridge/Execution/PROD kapcsolónak OFF állapotban kell lennie.");

  const readyForPreflight = configuration.expectedDevTargetConfigured && configuration.databaseUrlConfigured && configuration.databasePasswordConfigured && configuration.productionTargetConfigured && migrationPresent && sha256Valid;
  const readyForApplyAttempt = readyForPreflight && Object.values(safety).every(Boolean);
  return {
    phase: "P8_1_DB_MIGRATION_GATE",
    readyForPreflight,
    readyForApplyAttempt,
    blockers,
    configuration,
    safety,
    artifact: { migration: MIGRATION_REL, migrationPresent, sha256SidecarPresent, sha256Valid },
    note: "Ez csak readiness. SQL apply kizárólag a külön migration-gate runner explicit DEV approvalja után történhet.",
    generatedAt: new Date().toISOString(),
  };
}
