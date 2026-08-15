import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const source=fs.readFileSync(path.join(root,"app/lib/dev-center/developer-console.ts"),"utf8");
const checks=[];
function check(name,ok){checks.push(Boolean(ok));console.log(`${ok?"PASS":"FAIL"} ${name}`);if(!ok)throw new Error(name)}
check("Runtime build ID resolver exists",source.includes("export async function resolveDeveloperConsoleBuildId"));
check("NEXT_DIST_DIR has first precedence",source.indexOf("process.env.NEXT_DIST_DIR")<source.indexOf("active-next-release"));
check("Active release pointer is read",source.includes('path.join(root, ".dimprover", "active-next-release")'));
check("Fallback .next remains",source.includes('candidates.push(".next")'));
check("Dist path is constrained under project root",source.includes('relative.startsWith("..")')&&source.includes("path.isAbsolute(relative)"));
check("Runtime context uses resolver",source.includes("const buildId = await resolveDeveloperConsoleBuildId(root)"));
check("Hardcoded runtime .next/BUILD_ID read removed",!source.includes('readFile(path.join(root, ".next", "BUILD_ID")'));
console.log(`SUMMARY ${checks.filter(Boolean).length}/${checks.length} PASS`);
