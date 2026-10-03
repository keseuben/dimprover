param(
  [string]$ScriptPath = (Join-Path $PSScriptRoot 'dimpro-drive-desktop-manual-sync-v016.ps1'),
  [switch]$RunProbe,
  [ValidateSet('Bridge','DevToken')][string]$AuthMode = 'Bridge',
  [string]$ServerUrl = 'https://drive.dev.dimpro.hu'
)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) { throw ('Missing Drive Desktop script: ' + $ScriptPath) }
Write-Host 'DIMPRO Drive Desktop V0.1.6 Windows acceptance'; Write-Host 'DEV ONLY - PROD DENY'; Write-Host ('PowerShell: ' + $PSVersionTable.PSVersion)
$tokens=$null; $errors=$null
[void][System.Management.Automation.Language.Parser]::ParseFile($ScriptPath,[ref]$tokens,[ref]$errors)
if($errors.Count -gt 0){foreach($e in $errors){Write-Host ('PARSE_ERROR: '+$e.Message)};throw ('POWERSHELL_PARSE_FAIL count='+$errors.Count)}
Write-Host 'POWERSHELL_PARSE_PASS'
$sha=(Get-FileHash -LiteralPath $ScriptPath -Algorithm SHA256).Hash.ToLowerInvariant(); Write-Host ('SCRIPT_SHA256='+$sha)
$content=Get-Content -LiteralPath $ScriptPath -Raw
$forbidden=@('Invoke-Expression','Start-Process','cmd.exe','powershell.exe -Command')
foreach($needle in $forbidden){if($content.IndexOf($needle,[StringComparison]::OrdinalIgnoreCase)-ge 0){throw ('STATIC_GUARD_FAIL forbidden='+$needle)}}
$required=@('Invoke-DesktopUpload','Invoke-DesktopDownload','Save-DesktopCursor','V016_APPLY_ENABLE_SWITCH_REQUIRED','V016_SERVER_MUTATION_APPROVAL_REQUIRED','V016_LOCAL_MUTATION_APPROVAL_REQUIRED','V016_APPLY_PLAN_FILE_REQUIRED','DRIVE_OBJECT_WRITE_NOT_READY','DRIVE_OBJECT_DOWNLOAD_NOT_READY','UPLOAD_COMPLETE_SHA256_MISMATCH','DOWNLOAD_SIZE_MISMATCH','Add-Type -AssemblyName System.Security','System.Security.Cryptography.ProtectedData]::Unprotect','System.Security.Cryptography.DataProtectionScope]::CurrentUser','/api/drive/desktop-access/token','ConvertTo-Utf8JsonBytes','application/json; charset=utf-8','System.Collections.IDictionary','LOCAL_APP_DATA_NOT_AVAILABLE')
foreach($needle in $required){if($content.IndexOf($needle,[StringComparison]::Ordinal)-lt 0){throw ('STATIC_GUARD_FAIL missing='+$needle)}}
if ($content -match '/delete' -or $content -match 'kind.{0,8}DELETE') { throw 'STATIC_GUARD_FAIL destructive delete operation' }
if ($content -match '\[Security\.Cryptography\.ProtectedData\]') { throw 'STATIC_GUARD_FAIL short DPAPI type' }
if ($content -match '(?m)^\s*exit\b') { throw 'STATIC_GUARD_FAIL top-level exit' }
if ($content.IndexOf(('$LAST' + 'EXITCODE'),[StringComparison]::Ordinal)-ge 0) { throw ('STATIC_GUARD_FAIL ' + 'LAST' + 'EXITCODE') }
Write-Host 'STATIC_GUARD_PASS'; Write-Host 'EXACT_APPLY_CONTRACT_PASS'; Write-Host 'DELETE_OPERATION_DENY_PASS'
if($RunProbe){& $ScriptPath -Mode Probe -AuthMode $AuthMode -ServerUrl $ServerUrl; $probeSucceeded=$?; if(-not $probeSucceeded){throw 'PROBE_FAIL'}; Write-Host 'PROBE_PASS'}else{Write-Host 'PROBE_SKIPPED'}
Write-Host 'DIMPRO_DRIVE_DESKTOP_V016_WINDOWS_ACCEPTANCE_PASS'
