import fs from "node:fs";import path from "node:path";import {execFileSync} from "node:child_process";
const root=process.cwd();execFileSync(process.execPath,["scripts/benjadmin-windows-bridge-p81-package.mjs"],{cwd:root,stdio:"pipe"});const out=path.join(root,"dist","benjadmin-windows-bridge-p81");const read=n=>fs.readFileSync(path.join(out,n),"utf8");const manifest=JSON.parse(read("manifest.json"));let pass=0,fail=0;function check(n,o){if(o){pass++;console.log(`PASS ${n}`)}else{fail++;console.error(`FAIL ${n}`)}}
check("Manifest protocol v1",manifest.protocolVersion===1);
check("Manifest execution false",manifest.executionEnabled===false);
check("Manifest autostart false",manifest.autoStart===false);
check("Két core script SHA256",manifest.files.length===2&&manifest.files.every(x=>/^[0-9a-f]{64}$/.test(x.sha256)));
check("Installer SHA ellenőrzés",read("VERIFY-AND-INSTALL.ps1").includes("Get-FileHash -Algorithm SHA256"));
check("Installer execution false gate",read("VERIFY-AND-INSTALL.ps1").includes("executionEnabled -ne $false"));
check("Installer manager Install mód",read("VERIFY-AND-INSTALL.ps1").includes("-Mode Install"));
check("Pair wrapper explicit ID+Code",read("PAIR.ps1").includes("Mandatory=$true")&&read("PAIR.ps1").includes("-Mode Pair"));
check("Heartbeat wrapper Once",read("HEARTBEAT-ONCE.ps1").includes("-Mode Once"));
check("Uninstall manageren keresztül",read("UNINSTALL.ps1").includes("-Mode Uninstall"));
check("Nincs Start-Process",![...fs.readdirSync(out)].some(n=>/Start-Process/i.test(read(n))));
check("Nincs Invoke-Expression",![...fs.readdirSync(out)].some(n=>/Invoke-Expression/i.test(read(n))));
check("README execution tiltás",read("README.txt").includes("nincs parancsvégrehajtás"));
console.log(`SUMMARY ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
