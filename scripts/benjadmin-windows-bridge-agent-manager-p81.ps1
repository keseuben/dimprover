param(
  [ValidateSet('Install','SelfCheck','Uninstall')][string]$Mode = 'SelfCheck',
  [string]$ServerUrl = 'https://admin.dev.dimpro.hu',
  [string]$SourceAgent = '',
  [switch]$PurgeIdentity
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -and $PSVersionTable.PSVersion.Major -ge 6) { throw 'A BENJADMIN Windows Bridge agent manager kizárólag Windows rendszeren használható.' }
if (-not $ServerUrl.StartsWith('https://')) { throw 'A Windows Bridge kizárólag HTTPS szerver URL-lel konfigurálható.' }

$Root = Join-Path $env:LOCALAPPDATA 'DIMPRO\BenjAdminBridge'
$AgentPath = Join-Path $Root 'agent.ps1'
$ConfigPath = Join-Path $Root 'config.json'
$IdentityPath = Join-Path $Root 'identity.json'
$TokenPath = Join-Path $Root 'device-token.dpapi'

function Protect-AgentDirectory {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.SetAccessRuleProtection($true,$false)
  [void]$acl.AddAccessRule($rule)
  [IO.Directory]::SetAccessControl($Root,$acl)
}

function Resolve-SourceAgent {
  if ($SourceAgent) { return (Resolve-Path $SourceAgent).Path }
  $candidate = Join-Path $PSScriptRoot 'benjadmin-windows-bridge-agent-p81.ps1'
  if (-not (Test-Path $candidate)) { throw 'A P8.1 agent forrásfájl nem található. Add meg a -SourceAgent paramétert.' }
  return (Resolve-Path $candidate).Path
}

function Run-SelfCheck {
  $checks = [ordered]@{}
  $checks.windows = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
  $checks.httpsServer = $ServerUrl.StartsWith('https://')
  $checks.powershell = $PSVersionTable.PSVersion.ToString()
  $checks.powershellSupported = $PSVersionTable.PSVersion.Major -ge 5
  $checks.dpapiAvailable = [bool]([type]::GetType('System.Security.Cryptography.ProtectedData, System.Security.Cryptography.ProtectedData', $false) -or ('System.Security.Cryptography.ProtectedData' -as [type]))
  $checks.rootPresent = Test-Path $Root
  $checks.agentInstalled = Test-Path $AgentPath
  $checks.configPresent = Test-Path $ConfigPath
  $checks.identityPresent = Test-Path $IdentityPath
  $checks.tokenPresent = Test-Path $TokenPath
  $checks.autoStartInstalled = $false
  $checks.inboundPortRequired = $false
  $checks.executionEnabled = $false
  $ok = $checks.windows -and $checks.httpsServer -and $checks.powershellSupported -and $checks.dpapiAvailable
  [pscustomobject]@{ ok=$ok; checks=$checks; root=$Root; note='P8.1 self-check: nincs terminal execution és nincs automatikus indulás.' }
}

if ($Mode -eq 'Install') {
  $source = Resolve-SourceAgent
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  Protect-AgentDirectory
  Copy-Item -LiteralPath $source -Destination $AgentPath -Force
  [ordered]@{ protocolVersion=1; serverUrl=$ServerUrl; autoStart=$false; executionEnabled=$false; installedAt=(Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8
  Protect-AgentDirectory
  $result = Run-SelfCheck
  if (-not $result.ok -or -not $result.checks.agentInstalled) { throw 'A Windows Bridge agent telepítés utáni self-check sikertelen.' }
  Write-Host "BENJADMIN Windows Bridge P8.1 agent telepítve: $AgentPath"
  Write-Host 'Automatikus indulás: NINCS. PowerShell execution: OFF.'
  $result | ConvertTo-Json -Depth 5
  exit 0
}

if ($Mode -eq 'Uninstall') {
  if (Test-Path $TokenPath) { Remove-Item -LiteralPath $TokenPath -Force }
  if (Test-Path $AgentPath) { Remove-Item -LiteralPath $AgentPath -Force }
  if (Test-Path $ConfigPath) { Remove-Item -LiteralPath $ConfigPath -Force }
  if ($PurgeIdentity -and (Test-Path $IdentityPath)) { Remove-Item -LiteralPath $IdentityPath -Force }
  Write-Host 'A helyi P8.1 agent és device token eltávolítva. A szerveroldali device-ot külön a BENJADMIN Konzolban is vond vissza.'
  exit 0
}

Run-SelfCheck | ConvertTo-Json -Depth 5
