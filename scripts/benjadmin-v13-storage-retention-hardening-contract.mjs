#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const root=process.cwd();
const helper=fs.readFileSync(path.join(root,"scripts/dimpro-create-dev-worktree.sh"),"utf8");
const retention=fs.readFileSync(path.join(root,"scripts/dimpro-dev-storage-retention.mjs"),"utf8");
const agents=fs.readFileSync(path.join(root,"AGENTS.md"),"utf8");
let passed=0;
function check(name,fn){fn();passed++;console.log(`PASS ${name}`)}
check("Worktree name is allowlist validated",()=>assert.ok(helper.includes("^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")));
check("Worktree root is canonicalized",()=>assert.ok(helper.includes('WORKTREES_ROOT="$(realpath -m "$WORKTREES_ROOT")"')));
check("Worktree target is canonicalized",()=>assert.ok(helper.includes('TARGET="$(realpath -m "$WORKTREES_ROOT/$NAME")"')));
check("Worktree direct-parent guard exists",()=>assert.ok(helper.includes('"$(dirname "$TARGET")" != "$WORKTREES_ROOT"')));
check("Lockfile hash extracts hash only",()=>assert.ok(helper.includes("cut -d' ' -f1")&&!helper.includes("awk {print }")));
check("Existing node_modules is not overwritten",()=>assert.ok(helper.includes('[[ ! -e "$TARGET/node_modules" && ! -L "$TARGET/node_modules" ]]')));
check("Matching lockfile uses Turbopack-safe hardlink tree",()=>assert.ok(helper.includes('cp -al "$OPERATOR_ROOT/node_modules" "$TARGET/node_modules"')&&!helper.includes('ln -s "$OPERATOR_ROOT/node_modules"')));
check("Agent rule forbids external node_modules symlink",()=>assert.ok(agents.includes("Külső `node_modules` symlink tiltott")));
check("Worktree runtime acceptance is branch-agnostic",()=>assert.ok(fs.readFileSync(path.join(root,"scripts/benjadmin-v13-worktree-helper-runtime-acceptance.mjs"),"utf8").includes("BENJADMIN_WORKTREE_HELPER_BASE_REF")&&!fs.readFileSync(path.join(root,"scripts/benjadmin-v13-worktree-helper-runtime-acceptance.mjs"),"utf8").includes("feature/armin-benjadmin-v13-storage-retention-hardening-20260816")));
check("Retention keeps newest builds per worktree",()=>assert.ok(retention.includes("keepNewestPerWorktree")));
check("Retention protects PM2 NEXT_DIST_DIR",()=>assert.ok(retention.includes("NEXT_DIST_DIR")&&retention.includes("protectedPaths")));
check("Retention protects shared hardlinks",()=>assert.ok(retention.includes("shared-hardlinks")));
check("Retention never auto deletes backups",()=>assert.ok(retention.includes("Backup és artifact könyvtárak V1-ben soha nem törlődnek automatikusan")));
console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
