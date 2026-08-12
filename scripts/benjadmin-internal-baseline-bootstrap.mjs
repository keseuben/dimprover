import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile?.(".env.local"); } catch {}
const apply = process.argv.includes("--apply");
const advance = process.argv.includes("--advance");
const repoPath = "/srv/dimpro-dev/repositories/dimprover.git";
const baselineRef = "refs/heads/integration/benjadmin-dev";
const sourceRef = process.env.BENJADMIN_BASELINE_SOURCE_REF?.trim() || "refs/heads/feat/benjadmin-operator-ui-v2";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
if (!url || !key) throw new Error("DEV Supabase app environment missing");
if (os.hostname() !== "dimpro-dev") throw new Error("Fail-closed: baseline bootstrap csak dimpro-dev hoston futtatható.");
const git = (...args) => execFileSync("/usr/bin/git", ["--git-dir", repoPath, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const optionalRef = (ref) => { try { return git("rev-parse", "--verify", ref); } catch { return ""; } };
const sourceCommit = optionalRef(sourceRef);
if (!sourceCommit) throw new Error("A baseline source ref nem található a DEV bare repositoryban.");
const existingBaseline = optionalRef(baselineRef);
if (existingBaseline && existingBaseline !== sourceCommit && !advance) throw new Error("A trusted baseline már létezik és eltér a source reftől. Frissítéshez explicit --advance szükséges.");

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const repoResult = await db.from("dev_center_repositories").select("id,project_id,status,dev_path,metadata").eq("id", "repo_dimprover").single();
if (repoResult.error) throw repoResult.error;
const repo = repoResult.data;
if (repo.status !== "active" || repo.dev_path !== repoPath || repo.metadata?.sharedInternalMonorepo !== true || repo.metadata?.scopeLockRepositoryId !== "repo_dimprover") throw new Error("Fail-closed: a shared internal monorepo nincs READY állapotban.");
console.log(JSON.stringify({ ok: true, apply, advance, sourceRef, sourceCommit, baselineRef, existingBaseline: existingBaseline || null }, null, 2));
if (!apply) process.exit(0);

const stamp = new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
const backupDir = path.join(process.cwd(), ".dimprover", "backups", `trusted-baseline-${stamp}`);
await mkdir(backupDir, { recursive: true, mode: 0o700 });
await writeFile(path.join(backupDir, "before.json"), `${JSON.stringify({ repository: repo, baselineRef, existingBaseline: existingBaseline || null, sourceRef, sourceCommit }, null, 2)}\n`, { mode: 0o600 });
git("update-ref", baselineRef, sourceCommit, existingBaseline || "0000000000000000000000000000000000000000");
const verifiedCommit = optionalRef(baselineRef);
if (verifiedCommit !== sourceCommit) throw new Error("A baseline ref visszaellenőrzése sikertelen.");
const nextMetadata = { ...(repo.metadata || {}), trustedBaselineRef: baselineRef, trustedBaselineCommit: verifiedCommit, trustedBaselineSourceRef: sourceRef, trustedBaselineUpdatedAt: new Date().toISOString() };
const update = await db.from("dev_center_repositories").update({ metadata: nextMetadata, updated_at: new Date().toISOString() }).eq("id", "repo_dimprover").select("id,metadata").single();
if (update.error) throw update.error;
if (update.data?.metadata?.trustedBaselineCommit !== verifiedCommit) throw new Error("A baseline metadata visszaellenőrzése sikertelen.");
console.log(JSON.stringify({ applied: true, baselineRef, baselineCommit: verifiedCommit, backupDir }, null, 2));
