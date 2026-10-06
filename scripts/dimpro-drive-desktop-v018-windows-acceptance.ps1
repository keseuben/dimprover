param(
  [switch]$RunInstalledSelfCheck
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$HandlerPath = Join-Path $PSScriptRoot 'dimpro-drive-desktop-open-handler-v018.ps1'
$ManagerPath = Join-Path $PSScriptRoot 'dimpro-drive-desktop-open-handler-manager-v018.ps1'

Write-Host 'DIMPRO Drive Desktop V0.1.8 Windows Open Handler acceptance'
Write-Host 'DEV ONLY - PROD DENY'
Write-Host ('PowerShell: ' + $PSVersionTable.PSVersion.ToString())

foreach ($path in @($HandlerPath,$ManagerPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw ('V018_REQUIRED_FILE_MISSING ' + $path) }
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
  if ($errors.Count -gt 0) {
    foreach ($error in $errors) { Write-Host ('PARSE_ERROR ' + $error.Message) }
    throw ('V018_POWERSHELL_PARSE_FAILED ' + [IO.Path]::GetFileName($path))
  }
}
Write-Host 'POWERSHELL_PARSE_PASS'

$handlerSha = (Get-FileHash -LiteralPath $HandlerPath -Algorithm SHA256).Hash.ToLowerInvariant()
$managerSha = (Get-FileHash -LiteralPath $ManagerPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host ('HANDLER_SHA256=' + $handlerSha)
Write-Host ('MANAGER_SHA256=' + $managerSha)

$handler = Get-Content -LiteralPath $HandlerPath -Raw
$manager = Get-Content -LiteralPath $ManagerPath -Raw

$checks = [ordered]@{
  protocolScheme = $handler.Contains('$parsed.Scheme -ne ''dimpro-drive''')
  ticketOnly = $handler.Contains('$query.Get(''ticket'')') -and $handler.Contains('DRIVE_DESKTOP_URI_SERVER_OVERRIDE_DENIED')
  bridgeDpapi = $handler.Contains('DIMPRO\BenjAdminBridge\device-token.dpapi') -and $handler.Contains('ProtectedData]::Unprotect')
  desktopTokenExchange = $handler.Contains('/api/drive/desktop-access/token')
  ticketRedeem = $handler.Contains('/api/drive/desktop-open/redeem')
  exactHash = $handler.Contains('DRIVE_DESKTOP_DOWNLOAD_SHA256_MISMATCH')
  exactSize = $handler.Contains('DRIVE_DESKTOP_DOWNLOAD_SIZE_MISMATCH')
  localModifiedGuard = $handler.Contains("stateLabel = 'LOCAL_MODIFIED'") -and $handler.Contains('nem írta felül')
  noAutoDelete = $handler.Contains('autoDelete = $false') -and $handler.Contains('fullDriveSync = $false')
  partialSemantics = $handler.Contains('PARTIAL_WORKFILES_NOT_SYNC') -and $handler.Contains('DIMPRO MUNKAFÁJLOK')
  defaultAssociation = $handler.Contains('Start-Process -FilePath $targetPath')
  perUserProtocol = $manager.Contains('HKCU:\Software\Classes\dimpro-drive') -and -not $manager.Contains('HKLM:')
  uninstallPreservesWorkfiles = $manager.Contains('munkafájljai érintetlenek maradtak')
  productionDeny = $handler.Contains('DRIVE_DESKTOP_V018_DEV_SERVER_NOT_ALLOWED') -and $manager.Contains('DRIVE_DESKTOP_V018_DEV_SERVER_NOT_ALLOWED')
}

$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value })
foreach ($check in $checks.GetEnumerator()) {
  Write-Host (($(if ($check.Value) { 'PASS ' } else { 'FAIL ' })) + $check.Key)
}
if ($failed.Count -gt 0) { throw ('V018_STATIC_ACCEPTANCE_FAILED ' + (($failed | ForEach-Object { $_.Key }) -join ',')) }
Write-Host 'STATIC_GUARD_PASS'

if ($RunInstalledSelfCheck) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ManagerPath -Mode SelfCheck
  if ($LASTEXITCODE -ne 0) { throw 'V018_MANAGER_SELF_CHECK_FAILED' }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $HandlerPath -Mode SelfCheck
  if ($LASTEXITCODE -ne 0) { throw 'V018_HANDLER_SELF_CHECK_FAILED' }
  Write-Host 'INSTALLED_SELF_CHECK_PASS'
} else {
  Write-Host 'INSTALLED_SELF_CHECK_SKIPPED'
}

Write-Host 'DIMPRO_DRIVE_DESKTOP_V018_WINDOWS_OPEN_HANDLER_ACCEPTANCE_PASS'
