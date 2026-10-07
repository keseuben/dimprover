param(
  [ValidateSet('Open','SelfCheck')][string]$Mode = 'Open',
  [string]$Uri = '',
  [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
try { Add-Type -AssemblyName System.Web -ErrorAction Stop } catch { throw 'A System.Web assembly nem tölthető be.' }
try { Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop } catch { throw 'A Windows Forms assembly nem tölthető be.' }

$Root = Join-Path $env:LOCALAPPDATA 'DIMPRO\DriveDesktop'
$ConfigPath = Join-Path $Root 'config.json'
$IndexPath = Join-Path $Root 'workfiles-index.json'
$LogPath = Join-Path $Root 'open-handler.log'
$DefaultServerUrl = 'https://drive.dev.dimpro.hu'
$script:DriveHeaders = $null
New-Item -ItemType Directory -Force -Path $Root | Out-Null

function Write-LocalLog([string]$Message) {
  $line = '{0} {1}' -f ((Get-Date).ToUniversalTime().ToString('o')), $Message
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Show-DriveMessage([string]$Text, [string]$Title = 'DIMPRO Drive Desktop', [string]$Icon = 'Information') {
  $messageIcon = [System.Enum]::Parse([System.Windows.Forms.MessageBoxIcon],$Icon,$true)
  [void][System.Windows.Forms.MessageBox]::Show($Text, $Title, [System.Windows.Forms.MessageBoxButtons]::OK, $messageIcon)
}

function Get-ObjectPropertyValue {
  param($InputObject,[Parameter(Mandatory=$true)][string]$Name,$DefaultValue=$null)
  if ($null -eq $InputObject) { return $DefaultValue }
  if ($InputObject -is [System.Collections.IDictionary]) {
    if ($InputObject.Contains($Name)) { return $InputObject[$Name] }
    return $DefaultValue
  }
  $property = $InputObject.PSObject.Properties[$Name]
  if ($null -eq $property) { return $DefaultValue }
  return $property.Value
}

function Read-Config {
  if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    return [pscustomobject][ordered]@{ schemaVersion=1; serverUrl=$DefaultServerUrl; workFilesRoot=''; configuredAt=$null; updatedAt=$null }
  }
  try { $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json }
  catch { throw 'DRIVE_DESKTOP_CONFIG_INVALID' }
  if ([int](Get-ObjectPropertyValue $config 'schemaVersion' 0) -ne 1) { throw 'DRIVE_DESKTOP_CONFIG_SCHEMA_UNSUPPORTED' }
  return $config
}

function Save-Config($Config) {
  $Config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}

function Assert-DevServerUrl([string]$ServerUrl) {
  try { $serverUri = New-Object System.Uri($ServerUrl) }
  catch { throw 'DRIVE_DESKTOP_SERVER_URL_INVALID' }
  if ($serverUri.Scheme -ne 'https') { throw 'DRIVE_DESKTOP_HTTPS_REQUIRED' }
  $hostName = $serverUri.Host.ToLowerInvariant()
  if ($hostName -ne 'drive.dev.dimpro.hu') { throw 'DRIVE_DESKTOP_V019_DEV_SERVER_NOT_ALLOWED' }
  return $serverUri.GetLeftPart([System.UriPartial]::Authority).TrimEnd('/')
}

function Select-WorkFilesRoot([string]$CurrentPath = '') {
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = 'Válaszd ki a DIMPRO helyi munkafájlok mappáját. Ez NEM teljes Drive-szinkronizálás; csak a Windowsban megnyitott fájlok kerülnek ide.'
  $dialog.ShowNewFolderButton = $true
  if ($CurrentPath -and (Test-Path -LiteralPath $CurrentPath -PathType Container)) { $dialog.SelectedPath = $CurrentPath }
  $result = $dialog.ShowDialog()
  if ($result -ne [System.Windows.Forms.DialogResult]::OK -or -not $dialog.SelectedPath) { throw 'DRIVE_DESKTOP_WORKFILES_ROOT_SELECTION_CANCELLED' }
  return [IO.Path]::GetFullPath($dialog.SelectedPath)
}

function Ensure-WorkFilesRoot($Config) {
  $workRoot = [string](Get-ObjectPropertyValue $Config 'workFilesRoot' '')
  if (-not $workRoot -or -not $workRoot.Trim()) {
    Show-DriveMessage 'Első használat: válaszd ki a helyi DIMPRO munkafájlok mappáját. A program nem másolja le a Drive teljes projektstruktúráját; csak a ténylegesen megnyitott fájlokat tárolja itt.'
    $workRoot = Select-WorkFilesRoot
    New-Item -ItemType Directory -Force -Path $workRoot | Out-Null
    $now = (Get-Date).ToUniversalTime().ToString('o')
    $next = [ordered]@{
      schemaVersion = 1
      serverUrl = [string](Get-ObjectPropertyValue $Config 'serverUrl' $DefaultServerUrl)
      workFilesRoot = $workRoot
      configuredAt = if (Get-ObjectPropertyValue $Config 'configuredAt' $null) { [string]$Config.configuredAt } else { $now }
      updatedAt = $now
      semantics = 'PARTIAL_WORKFILES_NOT_SYNC'
    }
    Save-Config $next
    return [IO.Path]::GetFullPath($workRoot)
  }
  New-Item -ItemType Directory -Force -Path $workRoot | Out-Null
  return [IO.Path]::GetFullPath($workRoot)
}

function Get-DriveClientId {
  $machine = [string]$env:COMPUTERNAME
  if (-not $machine) { $machine = 'windows' }
  return ('drive-desktop-' + $machine.Trim().ToLowerInvariant())
}

function Get-HttpErrorSummary($ErrorRecord) {
  try {
    $response = $ErrorRecord.Exception.Response
    if ($null -eq $response) { return '' }
    $stream = $response.GetResponseStream()
    if ($null -eq $stream) { return '' }
    $reader = New-Object System.IO.StreamReader($stream,[Text.Encoding]::UTF8)
    try { $raw = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if (-not $raw) { return '' }
    try {
      $parsed = $raw | ConvertFrom-Json
      $code = [string](Get-ObjectPropertyValue $parsed 'code' '')
      $message = [string](Get-ObjectPropertyValue $parsed 'error' '')
      if ($code -or $message) { return (($code + ': ' + $message).Trim(': ')) }
    } catch { }
    return $raw.Substring(0,[Math]::Min(500,$raw.Length))
  } catch { return '' }
}

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory=$true)][ValidateSet('POST')][string]$Method,
    [Parameter(Mandatory=$true)][string]$RequestUri,
    [Parameter(Mandatory=$true)][hashtable]$Headers,
    [Parameter(Mandatory=$true)]$Body,
    [int]$TimeoutSec = 45
  )
  [byte[]]$bodyBytes = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12 -Compress))
  try {
    $response = Invoke-WebRequest -Method $Method -Uri $RequestUri -Headers $Headers -ContentType 'application/json; charset=utf-8' -Body $bodyBytes -UseBasicParsing -TimeoutSec $TimeoutSec
  } catch {
    $summary = Get-HttpErrorSummary $_
    if ($summary) { throw ('DRIVE_DESKTOP_HTTP_FAILED ' + $summary) }
    throw
  }
  $stream = $response.RawContentStream
  if ($null -eq $stream) { throw 'DRIVE_DESKTOP_HTTP_RESPONSE_STREAM_MISSING' }
  if ($stream.CanSeek) { $stream.Position = 0 }
  $memory = New-Object System.IO.MemoryStream
  try {
    $stream.CopyTo($memory)
    [byte[]]$bytes = $memory.ToArray()
  } finally {
    $memory.Dispose()
  }
  $utf8 = New-Object System.Text.UTF8Encoding($false,$true)
  try { return ($utf8.GetString($bytes) | ConvertFrom-Json) }
  catch { throw 'DRIVE_DESKTOP_HTTP_JSON_INVALID' }
}

function Get-DriveOpenHeaders {
  return @{ 'x-dimpro-drive-client-id'=(Get-DriveClientId) }
}

function Parse-OpenTicket([string]$RawUri) {
  if (-not $RawUri) { throw 'DRIVE_DESKTOP_URI_REQUIRED' }
  try { $parsed = New-Object System.Uri($RawUri) }
  catch { throw 'DRIVE_DESKTOP_URI_INVALID' }
  if ($parsed.Scheme -ne 'dimpro-drive' -or $parsed.Host -ne 'open-file') { throw 'DRIVE_DESKTOP_URI_ROUTE_INVALID' }
  $query = [System.Web.HttpUtility]::ParseQueryString($parsed.Query)
  $ticket = [string]$query.Get('ticket')
  if ($ticket -notmatch '^[A-Za-z0-9_-]{43}$') { throw 'DRIVE_DESKTOP_OPEN_TICKET_INVALID' }
  if ($query.Get('server')) { throw 'DRIVE_DESKTOP_URI_SERVER_OVERRIDE_DENIED' }
  return $ticket
}

function Convert-ToSafeWindowsName([string]$Value,[string]$Fallback='DIMPRO') {
  $name = ($Value -replace '[<>:"/\\|?*\x00-\x1f]','_').Trim().TrimEnd('.')
  if (-not $name) { $name = $Fallback }
  if ($name.Length -gt 180) { $name = $name.Substring(0,180).TrimEnd() }
  if ($name -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') { $name = '_' + $name }
  return $name
}

function Convert-ToSafeFileName([string]$Value,[string]$Fallback='DIMPRO_file') {
  $candidate = Convert-ToSafeWindowsName $Value $Fallback
  if ($candidate.Length -le 180) { return $candidate }
  $ext = [IO.Path]::GetExtension($candidate)
  $stem = [IO.Path]::GetFileNameWithoutExtension($candidate)
  $maxStem = [Math]::Max(20,180-$ext.Length)
  return ($stem.Substring(0,[Math]::Min($stem.Length,$maxStem)).TrimEnd() + $ext)
}

function Assert-PathWithinRoot([string]$RootPath,[string]$CandidatePath) {
  $rootFull = [IO.Path]::GetFullPath($RootPath).TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)
  $candidateFull = [IO.Path]::GetFullPath($CandidatePath)
  $prefix = $rootFull + [IO.Path]::DirectorySeparatorChar
  if (-not $candidateFull.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'DRIVE_DESKTOP_WORKFILE_PATH_ESCAPE_DENIED' }
  return $candidateFull
}

function Read-Index {
  if (-not (Test-Path -LiteralPath $IndexPath -PathType Leaf)) { return [pscustomobject][ordered]@{ schemaVersion=1; updatedAt=$null; entries=@() } }
  try { $state = Get-Content -LiteralPath $IndexPath -Raw | ConvertFrom-Json }
  catch { throw 'DRIVE_DESKTOP_WORKFILE_INDEX_INVALID' }
  if ([int](Get-ObjectPropertyValue $state 'schemaVersion' 0) -ne 1) { throw 'DRIVE_DESKTOP_WORKFILE_INDEX_SCHEMA_UNSUPPORTED' }
  return $state
}

function Save-Index($Entries) {
  [ordered]@{ schemaVersion=1; semantics='PARTIAL_WORKFILES_NOT_SYNC'; updatedAt=(Get-Date).ToUniversalTime().ToString('o'); entries=@($Entries) } |
    ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $IndexPath -Encoding UTF8
}

function Get-FileSha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Find-IndexEntry($State,[string]$ProjectId,[string]$DocumentId) {
  foreach ($entry in @($State.entries)) {
    if ([string]$entry.projectId -eq $ProjectId -and [string]$entry.documentId -eq $DocumentId) { return $entry }
  }
  return $null
}

function Write-IndexEntry($State,$Entry) {
  $entries = @()
  foreach ($current in @($State.entries)) {
    if ([string]$current.projectId -eq [string]$Entry.projectId -and [string]$current.documentId -eq [string]$Entry.documentId) { continue }
    $entries += $current
  }
  $entries += [pscustomobject]$Entry
  Save-Index $entries
}

function Get-ProjectWorkFolder([string]$WorkRoot,$Open) {
  $projectLabel = (([string]$Open.projectCode).Trim() + ' ' + ([string]$Open.projectName).Trim()).Trim()
  if (-not $projectLabel) { $projectLabel = [string]$Open.projectId }
  $folderName = (Convert-ToSafeWindowsName $projectLabel 'DIMPRO Projekt') + ' - DIMPRO MUNKAFÁJLOK'
  $folderPath = Assert-PathWithinRoot $WorkRoot (Join-Path $WorkRoot $folderName)
  New-Item -ItemType Directory -Force -Path $folderPath | Out-Null
  return $folderPath
}

function Get-UniqueTargetPath([string]$ProjectFolder,[string]$FileName,[string]$DocumentId) {
  $safeName = Convert-ToSafeFileName $FileName
  $candidate = Join-Path $ProjectFolder $safeName
  if (-not (Test-Path -LiteralPath $candidate)) { return $candidate }
  $ext = [IO.Path]::GetExtension($safeName)
  $stem = [IO.Path]::GetFileNameWithoutExtension($safeName)
  $suffix = (Convert-ToSafeWindowsName $DocumentId 'doc')
  if ($suffix.Length -gt 8) { $suffix = $suffix.Substring(0,8) }
  return Join-Path $ProjectFolder (Convert-ToSafeFileName ($stem + '__' + $suffix + $ext))
}

function Download-VerifiedFile($Open,[string]$TargetPath,[string]$ExpectedSha,[long]$ExpectedSize,[string]$ReplaceGuardSha='') {
  $download = $Open.download
  if ([string](Get-ObjectPropertyValue $download 'method' '') -ne 'GET') { throw 'DRIVE_DESKTOP_DOWNLOAD_METHOD_UNSUPPORTED' }
  $downloadUrl = [string](Get-ObjectPropertyValue $download 'url' '')
  if (-not $downloadUrl.StartsWith('https://')) { throw 'DRIVE_DESKTOP_DOWNLOAD_URL_INVALID' }
  $targetDirectory = [IO.Path]::GetDirectoryName($TargetPath)
  if (-not $targetDirectory) { throw 'DRIVE_DESKTOP_TARGET_DIRECTORY_INVALID' }
  $tempPath = Join-Path $targetDirectory ('.dimpro-download-' + [guid]::NewGuid().ToString('N') + '.tmp')
  try {
    Invoke-WebRequest -Method Get -Uri $downloadUrl -OutFile $tempPath -UseBasicParsing -TimeoutSec 180
    $actualSize = (Get-Item -LiteralPath $tempPath).Length
    if ($ExpectedSize -gt 0 -and $actualSize -ne $ExpectedSize) { throw 'DRIVE_DESKTOP_DOWNLOAD_SIZE_MISMATCH' }
    $actualSha = Get-FileSha256 $tempPath
    if ($actualSha -ne $ExpectedSha) { throw 'DRIVE_DESKTOP_DOWNLOAD_SHA256_MISMATCH' }

    if (Test-Path -LiteralPath $TargetPath -PathType Leaf) {
      if (-not $ReplaceGuardSha) { throw 'DRIVE_DESKTOP_TARGET_EXISTS_UNEXPECTEDLY' }
      $currentSha = Get-FileSha256 $TargetPath
      if ($currentSha -ne $ReplaceGuardSha) { throw 'DRIVE_DESKTOP_LOCAL_FILE_CHANGED_DURING_DOWNLOAD' }
    }
    Move-Item -LiteralPath $tempPath -Destination $TargetPath -Force
    return $actualSha
  } finally {
    if (Test-Path -LiteralPath $tempPath -PathType Leaf) { Remove-Item -LiteralPath $tempPath -Force }
  }
}

function Invoke-OpenFlow([string]$RawUri) {
  $ticket = Parse-OpenTicket $RawUri
  $config = Read-Config
  $serverUrl = Assert-DevServerUrl ([string](Get-ObjectPropertyValue $config 'serverUrl' $DefaultServerUrl))
  $workRoot = Ensure-WorkFilesRoot $config
  $headers = Get-DriveOpenHeaders
  $redeemed = Invoke-JsonRequest -Method POST -RequestUri ($serverUrl + '/api/drive/desktop-open/redeem') -Headers $headers -Body @{ ticket=$ticket }
  if (-not [bool](Get-ObjectPropertyValue $redeemed 'ok' $false) -or $null -eq (Get-ObjectPropertyValue $redeemed 'open' $null)) { throw 'DRIVE_DESKTOP_OPEN_REDEEM_FAILED' }
  $open = $redeemed.open

  $expectedSha = ([string](Get-ObjectPropertyValue $open 'sha256' '')).ToLowerInvariant()
  if ($expectedSha -notmatch '^[a-f0-9]{64}$') { throw 'DRIVE_DESKTOP_EXPECTED_SHA256_REQUIRED' }
  $expectedSize = [long](Get-ObjectPropertyValue $open 'sizeBytes' 0)
  $projectId = [string]$open.projectId
  $documentId = [string]$open.documentId
  $versionId = [string]$open.versionId
  $fileName = Convert-ToSafeFileName ([string]$open.fileName)
  if (-not $projectId -or -not $documentId -or -not $versionId -or -not $fileName) { throw 'DRIVE_DESKTOP_OPEN_METADATA_INVALID' }

  $state = Read-Index
  $entry = Find-IndexEntry $state $projectId $documentId
  $projectFolder = Get-ProjectWorkFolder $workRoot $open
  $targetPath = $null
  $previousServerSha = ''
  $baseServerSha = ''
  if ($entry) {
    $targetPath = Assert-PathWithinRoot $workRoot ([string]$entry.localPath)
    $previousServerSha = ([string](Get-ObjectPropertyValue $entry 'remoteSha256' (Get-ObjectPropertyValue $entry 'serverSha256' ''))).ToLowerInvariant()
    $baseServerSha = ([string](Get-ObjectPropertyValue $entry 'baseServerSha256' $previousServerSha)).ToLowerInvariant()
  } else {
    $initialTarget = Assert-PathWithinRoot $workRoot (Join-Path $projectFolder $fileName)
    if (Test-Path -LiteralPath $initialTarget -PathType Leaf) {
      $collisionSha = Get-FileSha256 $initialTarget
      $targetPath = if ($collisionSha -eq $expectedSha) { $initialTarget } else { Assert-PathWithinRoot $workRoot (Get-UniqueTargetPath $projectFolder $fileName $documentId) }
    } else {
      $targetPath = $initialTarget
    }
  }

  $stateLabel = 'SERVER_CURRENT'
  $downloaded = $false
  $localSha = ''
  if (Test-Path -LiteralPath $targetPath -PathType Leaf) {
    $localSha = Get-FileSha256 $targetPath
    if ($localSha -eq $expectedSha) {
      $stateLabel = 'SERVER_CURRENT'
    } elseif ($entry -and $baseServerSha -match '^[a-f0-9]{64}$' -and $localSha -eq $baseServerSha) {
      $localSha = Download-VerifiedFile $open $targetPath $expectedSha $expectedSize $baseServerSha
      $stateLabel = 'SERVER_UPDATED'
      $downloaded = $true
      $baseServerSha = $expectedSha
    } elseif ($entry) {
      $stateLabel = 'LOCAL_MODIFIED'
      $remoteChanged = $baseServerSha -match '^[a-f0-9]{64}$' -and $baseServerSha -ne $expectedSha
      $message = 'A helyi munkafájl módosult, ezért a DIMPRO Drive Desktop nem írta felül. A helyi példány nyílik meg.'
      if ($remoteChanged) { $message += "`r`n`r`nFigyelem: közben a Drive szerververziója is megváltozott. Feltöltés/szinkron előtt konfliktuskezelés szükséges." }
      Show-DriveMessage $message 'DIMPRO Drive Desktop – helyi módosítás' 'Warning'
    } else {
      $targetPath = Assert-PathWithinRoot $workRoot (Get-UniqueTargetPath $projectFolder $fileName $documentId)
      $localSha = Download-VerifiedFile $open $targetPath $expectedSha $expectedSize
      $downloaded = $true
    }
  } else {
    $localSha = Download-VerifiedFile $open $targetPath $expectedSha $expectedSize
    $downloaded = $true
  }

  $now = (Get-Date).ToUniversalTime().ToString('o')
  if (-not $baseServerSha -or $baseServerSha -notmatch '^[a-f0-9]{64}$') { $baseServerSha = $expectedSha }
  if ($stateLabel -ne 'LOCAL_MODIFIED') { $baseServerSha = $expectedSha }

  $indexEntry = [ordered]@{
    projectId = $projectId
    projectCode = [string](Get-ObjectPropertyValue $open 'projectCode' '')
    projectName = [string](Get-ObjectPropertyValue $open 'projectName' '')
    documentId = $documentId
    versionId = $versionId
    localPath = $targetPath
    remoteSha256 = $expectedSha
    baseServerSha256 = if ($stateLabel -eq 'LOCAL_MODIFIED' -and $baseServerSha) { $baseServerSha } else { $expectedSha }
    localSha256AtOpen = if ($localSha) { $localSha } else { Get-FileSha256 $targetPath }
    sizeBytes = (Get-Item -LiteralPath $targetPath).Length
    state = $stateLabel
    downloadedAt = if ($downloaded) { $now } elseif ($entry) { [string](Get-ObjectPropertyValue $entry 'downloadedAt' '') } else { $now }
    lastOpenedAt = $now
    autoDelete = $false
    semantics = 'PARTIAL_WORKFILE_NOT_SYNC'
  }
  Write-IndexEntry $state $indexEntry
  Write-LocalLog ("OPEN project={0} document={1} version={2} state={3} path={4}" -f $projectId,$documentId,$versionId,$stateLabel,$targetPath)

  if (-not $NoLaunch) {
    try { Start-Process -FilePath $targetPath | Out-Null }
    catch { throw ('DRIVE_DESKTOP_WINDOWS_ASSOCIATION_OPEN_FAILED ' + $_.Exception.Message) }
  }

  return [pscustomobject][ordered]@{
    ok = $true
    code = 'DIMPRO_DRIVE_DESKTOP_V019_OPEN_HANDLER_PASS'
    projectId = $projectId
    documentId = $documentId
    versionId = $versionId
    localPath = $targetPath
    state = $stateLabel
    downloaded = $downloaded
    autoDelete = $false
    fullDriveSync = $false
  }
}

if ($Mode -eq 'SelfCheck') {
  $config = Read-Config
  $serverUrl = Assert-DevServerUrl ([string](Get-ObjectPropertyValue $config 'serverUrl' $DefaultServerUrl))
  $workRoot = [string](Get-ObjectPropertyValue $config 'workFilesRoot' '')
  $windows = ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT)
  $selfCheck = [pscustomobject][ordered]@{
    ok = $windows
    code = 'DIMPRO_DRIVE_DESKTOP_V019_OPEN_HANDLER_SELF_CHECK_PASS'
    windows = $windows
    powershell = $PSVersionTable.PSVersion.ToString()
    serverUrl = $serverUrl
    workFilesRootConfigured = [bool]$workRoot
    workFilesRoot = $workRoot
    ticketCapabilityAuth = $true
    persistentDesktopAuth = $false
    autoDeleteWorkFiles = $false
    fullDriveSync = $false
  }
  $selfCheck | ConvertTo-Json -Depth 6
  if (-not $selfCheck.ok) { exit 2 }
  exit 0
}

try {
  $result = Invoke-OpenFlow $Uri
  $result | ConvertTo-Json -Depth 6
  exit 0
} catch {
  $message = $_.Exception.Message
  Write-LocalLog ('ERROR ' + $message)
  try { Show-DriveMessage ("A Windows-megnyitás sikertelen.`r`n`r`n" + $message) 'DIMPRO Drive Desktop' 'Error' } catch { }
  throw
}
