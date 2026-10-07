param(
  [ValidateSet('Install','Configure','SelfCheck','Uninstall')][string]$Mode = 'SelfCheck',
  [string]$ServerUrl = 'https://drive.dev.dimpro.hu',
  [string]$SourceHandler = '',
  [string]$WorkFilesRoot = '',
  [switch]$PurgeLocalMetadata
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
try { Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop } catch { throw 'A Windows Forms assembly nem tölthető be.' }

$Root = Join-Path $env:LOCALAPPDATA 'DIMPRO\DriveDesktop'
$HandlerPath = Join-Path $Root 'open-handler.ps1'
$ConfigPath = Join-Path $Root 'config.json'
$IndexPath = Join-Path $Root 'workfiles-index.json'
$LogPath = Join-Path $Root 'open-handler.log'
$ProtocolRoot = 'HKCU:\Software\Classes\dimpro-drive'
$ProtocolCommand = Join-Path $ProtocolRoot 'shell\open\command'

function Assert-ServerUrl([string]$Value) {
  try { $uri = New-Object System.Uri($Value) } catch { throw 'DRIVE_DESKTOP_SERVER_URL_INVALID' }
  if ($uri.Scheme -ne 'https') { throw 'DRIVE_DESKTOP_HTTPS_REQUIRED' }
  $hostName = $uri.Host.ToLowerInvariant()
  if ($hostName -ne 'drive.dev.dimpro.hu') { throw 'DRIVE_DESKTOP_V019_DEV_SERVER_NOT_ALLOWED' }
  return $uri.GetLeftPart([System.UriPartial]::Authority).TrimEnd('/')
}

function Resolve-HandlerSource {
  if ($SourceHandler) { return (Resolve-Path -LiteralPath $SourceHandler).Path }
  $candidate = Join-Path $PSScriptRoot 'dimpro-drive-desktop-open-handler-v019.ps1'
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw 'DRIVE_DESKTOP_V019_HANDLER_SOURCE_NOT_FOUND' }
  return (Resolve-Path -LiteralPath $candidate).Path
}

function Select-WorkRoot([string]$Current = '') {
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = 'DIMPRO helyi munkafájlok mappája. Ez nem teljes Drive-szinkronizálás; csak a Windowsban megnyitott fájlok kerülnek ide.'
  $dialog.ShowNewFolderButton = $true
  if ($Current -and (Test-Path -LiteralPath $Current -PathType Container)) { $dialog.SelectedPath = $Current }
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK -or -not $dialog.SelectedPath) { throw 'DRIVE_DESKTOP_WORKFILES_ROOT_SELECTION_CANCELLED' }
  return [IO.Path]::GetFullPath($dialog.SelectedPath)
}

function Read-ExistingConfig {
  if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { return $null }
  try { return (Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json) } catch { return $null }
}

function Save-DriveConfig([string]$ResolvedServer,[string]$ResolvedWorkRoot) {
  if ($ResolvedWorkRoot) { New-Item -ItemType Directory -Force -Path $ResolvedWorkRoot | Out-Null }
  $existing = Read-ExistingConfig
  $now = (Get-Date).ToUniversalTime().ToString('o')
  [ordered]@{
    schemaVersion = 1
    serverUrl = $ResolvedServer
    workFilesRoot = $ResolvedWorkRoot
    configuredAt = if ($existing -and $existing.configuredAt) { [string]$existing.configuredAt } else { $now }
    updatedAt = $now
    semantics = 'PARTIAL_WORKFILES_NOT_SYNC'
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}

function Register-Protocol {
  $powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  if (-not (Test-Path -LiteralPath $powershellExe -PathType Leaf)) { throw 'DRIVE_DESKTOP_WINDOWS_POWERSHELL_NOT_FOUND' }
  New-Item -Path $ProtocolRoot -Force | Out-Null
  Set-Item -Path $ProtocolRoot -Value 'URL:DIMPRO Drive Protocol'
  New-ItemProperty -Path $ProtocolRoot -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
  New-Item -Path (Join-Path $ProtocolRoot 'shell') -Force | Out-Null
  New-Item -Path (Join-Path $ProtocolRoot 'shell\open') -Force | Out-Null
  New-Item -Path $ProtocolCommand -Force | Out-Null
  $command = '"' + $powershellExe + '" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $HandlerPath + '" -Uri "%1"'
  Set-Item -Path $ProtocolCommand -Value $command
}

function Get-SelfCheck {
  $config = Read-ExistingConfig
  $command = ''
  try { $command = [string](Get-Item -Path $ProtocolCommand -ErrorAction Stop).GetValue('') } catch { }
  $workRoot = if ($config) { [string]$config.workFilesRoot } else { '' }
  $windows = ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT)
  $handlerInstalled = Test-Path -LiteralPath $HandlerPath -PathType Leaf
  $commandTargetsHandler = [bool]($command -and $command.Contains($HandlerPath))
  return [pscustomobject][ordered]@{
    ok = ($windows -and $handlerInstalled -and [bool]$command -and $commandTargetsHandler)
    code = 'DIMPRO_DRIVE_DESKTOP_V019_MANAGER_SELF_CHECK'
    windows = $windows
    powershell = $PSVersionTable.PSVersion.ToString()
    handlerInstalled = $handlerInstalled
    protocolRegistered = [bool]$command
    protocolCommandTargetsHandler = $commandTargetsHandler
    workFilesRootConfigured = [bool]$workRoot
    workFilesRoot = $workRoot
    workFilesRootPresent = [bool]($workRoot -and (Test-Path -LiteralPath $workRoot -PathType Container))
    semantics = 'PARTIAL_WORKFILES_NOT_SYNC'
    autoDeleteWorkFiles = $false
    fullDriveSync = $false
  }
}

if ($Mode -eq 'Install') {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'DRIVE_DESKTOP_V019_WINDOWS_REQUIRED' }
  $resolvedServer = Assert-ServerUrl $ServerUrl
  $source = Resolve-HandlerSource
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  Copy-Item -LiteralPath $source -Destination $HandlerPath -Force
  $existing = Read-ExistingConfig
  $resolvedWorkRoot = $WorkFilesRoot
  if (-not $resolvedWorkRoot -and $existing -and $existing.workFilesRoot) { $resolvedWorkRoot = [string]$existing.workFilesRoot }
  if ($resolvedWorkRoot) { $resolvedWorkRoot = [IO.Path]::GetFullPath($resolvedWorkRoot) }
  Save-DriveConfig $resolvedServer $resolvedWorkRoot
  Register-Protocol
  $result = Get-SelfCheck
  if (-not $result.ok) { throw 'DRIVE_DESKTOP_V019_INSTALL_SELF_CHECK_FAILED' }
  Write-Host 'DIMPRO Drive Desktop V0.1.9 Windows Open Handler telepítve.'
  Write-Host 'Fontos: ez NEM teljes Drive-szinkron. Csak a megnyitott munkafájlok kerülnek a kiválasztott helyre.'
  $result | ConvertTo-Json -Depth 6
  exit 0
}

if ($Mode -eq 'Configure') {
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  $existing = Read-ExistingConfig
  $resolvedServer = Assert-ServerUrl $(if ($existing -and $existing.serverUrl) { [string]$existing.serverUrl } else { $ServerUrl })
  $current = if ($existing -and $existing.workFilesRoot) { [string]$existing.workFilesRoot } else { '' }
  $resolvedWorkRoot = if ($WorkFilesRoot) { [IO.Path]::GetFullPath($WorkFilesRoot) } else { Select-WorkRoot $current }
  Save-DriveConfig $resolvedServer $resolvedWorkRoot
  Write-Host ('DIMPRO munkafájl-mappa beállítva: ' + $resolvedWorkRoot)
  Get-SelfCheck | ConvertTo-Json -Depth 6
  exit 0
}

if ($Mode -eq 'Uninstall') {
  if (Test-Path -Path $ProtocolRoot) { Remove-Item -Path $ProtocolRoot -Recurse -Force }
  if (Test-Path -LiteralPath $HandlerPath -PathType Leaf) { Remove-Item -LiteralPath $HandlerPath -Force }
  if ($PurgeLocalMetadata) {
    if (Test-Path -LiteralPath $IndexPath -PathType Leaf) { Remove-Item -LiteralPath $IndexPath -Force }
    if (Test-Path -LiteralPath $LogPath -PathType Leaf) { Remove-Item -LiteralPath $LogPath -Force }
    if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) { Remove-Item -LiteralPath $ConfigPath -Force }
  }
  Write-Host 'DIMPRO Drive Desktop V0.1.9 Open Handler eltávolítva. A felhasználó munkafájljai érintetlenek maradtak.'
  exit 0
}

$selfCheck = Get-SelfCheck
$selfCheck | ConvertTo-Json -Depth 6
if (-not $selfCheck.ok) { exit 2 }
