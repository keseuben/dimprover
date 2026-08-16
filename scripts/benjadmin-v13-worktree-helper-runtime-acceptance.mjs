#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const featureRoot=process.cwd();
const operatorRoot=process.env.DIMPRO_OPERATOR_ROOT||"/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2";
const worktreesRoot=process.env.DIMPRO_WORKTREES_ROOT||"/srv/dimpro-dev/worktrees";
const helper=path.join(featureRoot,"scripts/dimpro-create-dev-worktree.sh");
const stamp=Date.now();
const branch=`acceptance/armin-worktree-helper-${stamp}`;
const name=`acceptance-armin-worktree-helper-${stamp}`;
const target=path.join(worktreesRoot,name);
const baseRef=process.env.BENJADMIN_WORKTREE_HELPER_BASE_REF||"HEAD";
let passed=0;
function check(label,ok,detail=""){if(!ok)throw new Error(`${label}${detail?` :: ${detail}`:""}`);passed++;console.log(`PASS ${label}${detail?` :: ${detail}`:""}`)}
function run(args){return spawnSync("bash",[helper,...args],{cwd:featureRoot,env:{...process.env,DIMPRO_OPERATOR_ROOT:operatorRoot,DIMPRO_WORKTREES_ROOT:worktreesRoot},encoding:"utf8"})}
function git(args){return spawnSync("git",["-C",operatorRoot,...args],{encoding:"utf8"})}
try{
  let result=run([`${branch}-bad`,`../escape-${stamp}`,baseRef]);
  check("Traversal worktree name rejected",result.status===64,`status=${result.status} stderr=${result.stderr.trim()}`);
  check("Traversal target was not created",!fs.existsSync(path.resolve(worktreesRoot,"..",`escape-${stamp}`)));
  result=run([branch,name,baseRef]);
  check("Valid worktree creation succeeds",result.status===0,`status=${result.status} stderr=${result.stderr.trim()}`);
  check("Temporary worktree exists",fs.existsSync(target),target);
  const nm=path.join(target,"node_modules");
  const nmStat=fs.lstatSync(nm);
  check("node_modules is a real directory",nmStat.isDirectory()&&!nmStat.isSymbolicLink(),nm);
  const markerRelative="next/package.json";
  const opMarker=fs.statSync(path.join(operatorRoot,"node_modules",markerRelative));
  const wtMarker=fs.statSync(path.join(nm,markerRelative));
  check("node_modules marker is hardlinked to operator",opMarker.dev===wtMarker.dev&&opMarker.ino===wtMarker.ino&&wtMarker.nlink>1,`inode=${wtMarker.ino} nlink=${wtMarker.nlink}`);
  const opHash=spawnSync("sha256sum",[path.join(operatorRoot,"package-lock.json")],{encoding:"utf8"}).stdout.trim().split(/\s+/)[0];
  const wtHash=spawnSync("sha256sum",[path.join(target,"package-lock.json")],{encoding:"utf8"}).stdout.trim().split(/\s+/)[0];
  check("Temporary worktree lockfile matches operator",opHash===wtHash,`${opHash.slice(0,12)}=${wtHash.slice(0,12)}`);
  check("Hardlink strategy is Turbopack filesystem-local",fs.realpathSync(nm)===nm,nm);
  console.log(JSON.stringify({ok:true,passed,failed:0,target,branch},null,2));
} finally {
  if(fs.existsSync(target)) git(["worktree","remove","--force",target]);
  git(["worktree","prune"]);
  git(["branch","-D",branch]);
}
