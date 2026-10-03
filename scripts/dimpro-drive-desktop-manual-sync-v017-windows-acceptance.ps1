param(
  [string]$ScriptPath = (Join-Path $PSScriptRoot 'dimpro-drive-desktop-manual-sync-v017.ps1'),
  [switch]$RunProbe,
  [ValidateSet('Bridge','DevToken')][string]$AuthMode = 'Bridge',
  [string]$ServerUrl = 'https://drive.dev.dimpro.hu'
)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) { throw ('Missing Drive Desktop script: ' + $ScriptPath) }
Write-Host 'DIMPRO Drive Desktop V0.1.7 FIX1 Windows acceptance'; Write-Host 'DEV ONLY - PROD DENY'; Write-Host ('PowerShell: ' + $PSVersionTable.PSVersion)
$tokens=$null; $errors=$null
[void][System.Management.Automation.Language.Parser]::ParseFile($ScriptPath,[ref]$tokens,[ref]$errors)
if($errors.Count -gt 0){foreach($e in $errors){Write-Host ('PARSE_ERROR: '+$e.Message)};throw ('POWERSHELL_PARSE_FAIL count='+$errors.Count)}
Write-Host 'POWERSHELL_PARSE_PASS'
$sha=(Get-FileHash -LiteralPath $ScriptPath -Algorithm SHA256).Hash.ToLowerInvariant(); Write-Host ('SCRIPT_SHA256='+$sha)
$content=Get-Content -LiteralPath $ScriptPath -Raw
$forbidden=@('Invoke-Expression','Start-Process','cmd.exe','powershell.exe -Command')
foreach($needle in $forbidden){if($content.IndexOf($needle,[StringComparison]::OrdinalIgnoreCase)-ge 0){throw ('STATIC_GUARD_FAIL forbidden='+$needle)}}
$required=@('Invoke-DesktopUpload','Invoke-DesktopDownload','Save-DesktopCursor','V017_APPLY_ENABLE_SWITCH_REQUIRED','V017_SERVER_MUTATION_APPROVAL_REQUIRED','V017_LOCAL_MUTATION_APPROVAL_REQUIRED','V017_APPLY_PLAN_FILE_REQUIRED','DRIVE_OBJECT_WRITE_NOT_READY','DRIVE_OBJECT_DOWNLOAD_NOT_READY','UPLOAD_COMPLETE_SHA256_MISMATCH','DOWNLOAD_SIZE_MISMATCH','Add-Type -AssemblyName System.Security','System.Security.Cryptography.ProtectedData]::Unprotect','System.Security.Cryptography.DataProtectionScope]::CurrentUser','/api/drive/desktop-access/token','application/json; charset=utf-8','System.Collections.IDictionary','LOCAL_APP_DATA_NOT_AVAILABLE','Get-HttpErrorSummary','Invoke-DriveUtf8JsonRequest','ConvertFrom-DriveUtf8JsonResponse','RawContentStream','System.Text.UTF8Encoding($false, $true)','DRIVE_HTTP_RESPONSE_UTF8_INVALID','DRIVE_HTTP_RESPONSE_JSON_INVALID','DRIVE_HTTP_REQUEST_FAILED','New-ManualSyncPlan','PreparedApplyPlanPath','ReviewedPlanSha256','V017_REVIEWED_PLAN_SHA256_REQUIRED','V017_APPLY_PLAN_CONFLICTS_PRESENT','REMOTE_FOLDER_NOT_FOUND','CONTENT_MISMATCH_NO_BASELINE','allowCreateParent','changes = $all.ToArray()','operations = $operations.ToArray()','conflicts = $conflicts.ToArray()','unchanged = $unchanged.ToArray()')
foreach($needle in $required){if($content.IndexOf($needle,[StringComparison]::Ordinal)-lt 0){throw ('STATIC_GUARD_FAIL missing='+$needle)}}
if ($content -match '/delete' -or $content -match 'kind.{0,8}DELETE') { throw 'STATIC_GUARD_FAIL destructive delete operation' }
if ($content -match '\[Security\.Cryptography\.ProtectedData\]') { throw 'STATIC_GUARD_FAIL short DPAPI type' }
if ($content -match 'function\s+ConvertTo-Utf8JsonBytes') { throw 'STATIC_GUARD_FAIL enumerating byte helper' }
if ($content -notmatch '\[byte\[\]\]\$bodyBytes\s*=\s*\[Text\.Encoding\]::UTF8\.GetBytes') { throw 'STATIC_GUARD_FAIL direct UTF8 byte body missing' }
if ($content -match 'Invoke-RestMethod') { throw 'STATIC_GUARD_FAIL Invoke-RestMethod JSON decoding forbidden' }
if ($content -notmatch 'RawContentStream') { throw 'STATIC_GUARD_FAIL raw response stream missing' }
if ($content -match '(?m)^\s*exit\b') { throw 'STATIC_GUARD_FAIL top-level exit' }
if ($content.IndexOf(('$LAST' + 'EXITCODE'),[StringComparison]::Ordinal)-ge 0) { throw ('STATIC_GUARD_FAIL ' + 'LAST' + 'EXITCODE') }
Write-Host 'STATIC_GUARD_PASS'; Write-Host 'EXACT_APPLY_CONTRACT_PASS'; Write-Host 'DELETE_OPERATION_DENY_PASS'
if($RunProbe){& $ScriptPath -Mode Probe -AuthMode $AuthMode -ServerUrl $ServerUrl; $probeSucceeded=$?; if(-not $probeSucceeded){throw 'PROBE_FAIL'}; Write-Host 'PROBE_PASS'}else{Write-Host 'PROBE_SKIPPED'}
Write-Host 'DIMPRO_DRIVE_DESKTOP_V017_FIX1_WINDOWS_ACCEPTANCE_PASS'; Write-Host 'DIMPRO_DRIVE_DESKTOP_V017_WINDOWS_ACCEPTANCE_PASS'
