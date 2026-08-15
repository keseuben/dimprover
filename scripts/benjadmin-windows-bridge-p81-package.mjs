import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const root=process.cwd();
const out=join(root,"dist","benjadmin-windows-bridge-p81");
const files=[
  "scripts/benjadmin-windows-bridge-agent-p81.ps1",
  "scripts/benjadmin-windows-bridge-agent-manager-p81.ps1",
];
rmSync(out,{recursive:true,force:true}); mkdirSync(out,{recursive:true});
for(const file of files) cpSync(join(root,file),join(out,basename(file)));
const sha=(file)=>createHash("sha256").update(readFileSync(file)).digest("hex");
const manifest={package:"BENJADMIN Windows Bridge P8.1",protocolVersion:1,executionEnabled:false,autoStart:false,serverDefault:"https://admin.dev.dimpro.hu",createdAt:new Date().toISOString(),files:files.map(f=>({name:basename(f),sha256:sha(join(root,f))}))};
writeFileSync(join(out,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
writeFileSync(join(out,"VERIFY-AND-INSTALL.ps1"),`$ErrorActionPreference='Stop'\n$Root=$PSScriptRoot\n$Manifest=Get-Content (Join-Path $Root 'manifest.json') -Raw | ConvertFrom-Json\nforeach($f in $Manifest.files){$p=Join-Path $Root $f.name;if(-not(Test-Path $p)){throw \"Hiányzó csomagfájl: $($f.name)\"};$h=(Get-FileHash -Algorithm SHA256 $p).Hash.ToLowerInvariant();if($h -ne $f.sha256){throw \"SHA-256 eltérés: $($f.name)\"}}\nif($Manifest.executionEnabled -ne $false){throw 'Biztonsági sértés: executionEnabled nem false.'}\n& (Join-Path $Root 'benjadmin-windows-bridge-agent-manager-p81.ps1') -Mode Install -SourceAgent (Join-Path $Root 'benjadmin-windows-bridge-agent-p81.ps1')\n`);
writeFileSync(join(out,"SELF-CHECK.ps1"),`$ErrorActionPreference='Stop'\n& (Join-Path $PSScriptRoot 'benjadmin-windows-bridge-agent-manager-p81.ps1') -Mode SelfCheck\n`);
writeFileSync(join(out,"PAIR.ps1"),`param([Parameter(Mandatory=$true)][string]$PairingId,[Parameter(Mandatory=$true)][string]$PairingCode,[string]$ServerUrl='https://admin.dev.dimpro.hu')\n$ErrorActionPreference='Stop'\n$Agent=Join-Path $env:LOCALAPPDATA 'DIMPRO\\BenjAdminBridge\\agent.ps1'\nif(-not(Test-Path $Agent)){throw 'A BENJADMIN Windows Bridge agent nincs telepítve.'}\n& $Agent -Mode Pair -ServerUrl $ServerUrl -PairingId $PairingId -PairingCode $PairingCode\n`);
writeFileSync(join(out,"HEARTBEAT-ONCE.ps1"),`$ErrorActionPreference='Stop'\n$Agent=Join-Path $env:LOCALAPPDATA 'DIMPRO\\BenjAdminBridge\\agent.ps1'\nif(-not(Test-Path $Agent)){throw 'A BENJADMIN Windows Bridge agent nincs telepítve.'}\n& $Agent -Mode Once\n`);
writeFileSync(join(out,"UNINSTALL.ps1"),`param([switch]$PurgeIdentity)\n$ErrorActionPreference='Stop'\n& (Join-Path $PSScriptRoot 'benjadmin-windows-bridge-agent-manager-p81.ps1') -Mode Uninstall -PurgeIdentity:$PurgeIdentity\n`);
writeFileSync(join(out,"README.txt"),`BENJADMIN Windows Bridge P8.1\r\n\r\n1. VERIFY-AND-INSTALL.ps1\r\n2. SELF-CHECK.ps1\r\n3. A BENJADMIN Konzolban hozz létre pairing kódot.\r\n4. PAIR.ps1 -PairingId <id> -PairingCode <code>\r\n5. Jóváhagyás után HEARTBEAT-ONCE.ps1\r\n\r\nP8.1: nincs parancsvégrehajtás, nincs autostart, nincs inbound port.\r\n`);
console.log(JSON.stringify({ok:true,out,files:[...manifest.files.map(x=>x.name),"manifest.json","VERIFY-AND-INSTALL.ps1","SELF-CHECK.ps1","PAIR.ps1","HEARTBEAT-ONCE.ps1","UNINSTALL.ps1","README.txt"]},null,2));
