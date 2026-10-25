"server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import catalog from "@/config/developer-grid-module-sources.json";
import { DEVELOPER_WORKER_REPOSITORY } from "./worker-workspace";

const execFileAsync = promisify(execFile);
const key = (value: unknown) => String(value || "").normalize("NFKC").trim().toLocaleLowerCase("hu-HU").replace(/\s+/g, " ");
type Git = (args: string[]) => Promise<string>;
export type ModuleSourceBinding = { schemaVersion: 1; projectId: string; moduleName: string; branch: string | null; head: string; minimumCommit: string | null; requiredPaths: string[]; authority: "MODULE_CATALOG" | "GRID_FOUNDATION" };
function fail(code: string, message: string): never { throw Object.assign(new Error(message), {code,status:409}); }
const canonicalGit: Git = async args => {
  const result = await execFileAsync("/usr/bin/git", ["--git-dir",DEVELOPER_WORKER_REPOSITORY,...args], {encoding:"utf8",timeout:20000,maxBuffer:1024*1024});
  return result.stdout.trim();
};

export async function resolveDeveloperGridModuleSource(input: {projectId:string;moduleName:string;fallbackHead:string;pinnedHead?:string | null}, git: Git = canonicalGit): Promise<ModuleSourceBinding> {
  const matches = catalog.sources.filter(item=>key(item.projectId)===key(input.projectId)&&item.modules.some(name=>key(name)===key(input.moduleName)));
  if(matches.length>1) fail("MODULE_SOURCE_AMBIGUOUS","A modulhoz több forráskötés tartozik.");
  const source=matches[0];
  const fallback=String(input.pinnedHead || input.fallbackHead || "").toLowerCase();
  if(!source){
    if(!/^[0-9a-f]{40}$/.test(fallback)) fail("MODULE_SOURCE_HEAD_INVALID","Hiányzó teljes modulforrás-commit.");
    return {schemaVersion:1,projectId:input.projectId,moduleName:input.moduleName,branch:null,head:fallback,minimumCommit:null,requiredPaths:[],authority:"GRID_FOUNDATION"};
  }
  if(!/^[0-9a-f]{40}$/.test(source.minimumCommit)||!source.branch||source.branch.startsWith("-")||source.branch.includes("..")) fail("MODULE_SOURCE_CATALOG_INVALID","Érvénytelen modulforrás-katalógus.");
  let branchHead="";
  try {branchHead=await git(["rev-parse","--verify",`refs/heads/${source.branch}^{commit}`]);}
  catch {fail("MODULE_SOURCE_BRANCH_MISSING","A modul kanonikus fejlesztési ága nem érhető el.");}
  if(!/^[0-9a-f]{40}$/.test(branchHead)) fail("MODULE_SOURCE_HEAD_INVALID","A modul ágának commitja érvénytelen.");
  const head=input.pinnedHead?String(input.pinnedHead).toLowerCase():branchHead;
  if(!/^[0-9a-f]{40}$/.test(head)) fail("MODULE_SOURCE_HEAD_INVALID","Érvénytelen rögzített modulforrás.");
  try {
    await git(["merge-base","--is-ancestor",source.minimumCommit,head]);
    await git(["merge-base","--is-ancestor",head,branchHead]);
  }catch{fail("MODULE_SOURCE_BASELINE_MISMATCH","A task forrásából hiányzik a jóváhagyott modulfejlesztés. Új fejlesztési kör szükséges; a régi BOOT ACK nem vihető át.");}
  for(const file of source.requiredPaths){
    if(file.startsWith("/")||file.split("/").includes(".."))fail("MODULE_SOURCE_CATALOG_INVALID","Érvénytelen kötelező modulútvonal.");
    try{if(await git(["cat-file","-t",`${head}:${file}`])!=="blob")fail("MODULE_SOURCE_REQUIRED_FILE_MISSING","Hiányzó modulforrásfájl.");}
    catch{fail("MODULE_SOURCE_REQUIRED_FILE_MISSING",`Hiányzó kötelező modulforrás: ${file}`);}
  }
  return {schemaVersion:1,projectId:input.projectId,moduleName:input.moduleName,branch:source.branch,head,minimumCommit:source.minimumCommit,requiredPaths:[...source.requiredPaths],authority:"MODULE_CATALOG"};
}
