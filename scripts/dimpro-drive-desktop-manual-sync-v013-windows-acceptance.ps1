param(
  [string]$ScriptPath = (Join-Path $PSScriptRoot 'dimpro-drive-desktop-manual-sync-v013.ps1'),
  [switch]$RunProbe,
  [ValidateSet('Bridge','DevToken')][string]$AuthMode = 'Bridge',
  [string]$ServerUrl = 'https://drive.dev.dimpro.hu'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) { throw ('Missing Drive Desktop script: ' + $ScriptPath) }
Write-Host 'DIMPRO Drive Desktop V0.1.3 Windows acceptance'
Write-Host 'DEV ONLY - PROD DENY'
Write-Host ('PowerShell: ' + $PSVersionTable.PSVersion)
$tokens = $null; $errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($ScriptPath, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) {
  foreach ($parseError in $errors) { Write-Host ('PARSE_ERROR: ' + $parseError.Message) }
  throw ('POWERSHELL_PARSE_FAIL count=' + $errors.Count)
}
Write-Host 'POWERSHELL_PARSE_PASS'
$sha = (Get-FileHash -LiteralPath $ScriptPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host ('SCRIPT_SHA256=' + $sha)
$content = Get-Content -LiteralPath $ScriptPath -Raw
$forbidden = @('Invoke-Expression','Remove-Item','Start-Process','cmd.exe','powershell.exe -Command')
foreach ($needle in $forbidden) { if ($content.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) { throw ('STATIC_GUARD_FAIL forbidden=' + $needle) } }
if ($content -notmatch 'serverMutation = \$false') { throw 'STATIC_GUARD_FAIL serverMutation' }
if ($content -notmatch 'localMutation = \$false') { throw 'STATIC_GUARD_FAIL localMutation' }
if ($content -notmatch 'delete = \$false') { throw 'STATIC_GUARD_FAIL delete' }
if ($content -notmatch 'ProtectedData\]::Unprotect') { throw 'STATIC_GUARD_FAIL bridge DPAPI' }
if ($content -notmatch '/api/drive/desktop-access/token') { throw 'STATIC_GUARD_FAIL token exchange' }
Write-Host 'STATIC_GUARD_PASS'
if ($RunProbe) {
  & $ScriptPath -Mode Probe -AuthMode $AuthMode -ServerUrl $ServerUrl
  if ($LASTEXITCODE -ne 0) { throw ('PROBE_FAIL exit=' + $LASTEXITCODE) }
  Write-Host 'PROBE_PASS'
} else { Write-Host 'PROBE_SKIPPED' }
Write-Host 'DIMPRO_DRIVE_DESKTOP_V013_WINDOWS_ACCEPTANCE_PASS'
