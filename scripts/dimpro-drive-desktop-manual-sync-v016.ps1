param(
  [ValidateSet('Probe','Plan','Apply')][string]$Mode = 'Probe',
  [ValidateSet('Bridge','DevToken')][string]$AuthMode = 'Bridge',
  [string]$ServerUrl = 'https://drive.dev.dimpro.hu',
  [string]$ProjectId = '',
  [string]$LocalRoot = '',
  [long]$Cursor = 0,
  [string]$ClientId = '',
  [string]$OutputPath = '',
  [switch]$EnableApply,
  [switch]$AllowServerMutation,
  [switch]$AllowLocalMutation,
  [string]$ApplyPlanPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
try { Add-Type -AssemblyName System.Security -ErrorAction Stop } catch { throw 'Windows DPAPI System.Security assembly could not be loaded.' }
$script:DriveAuthHeaders = $null

try { $serverUri = New-Object System.Uri($ServerUrl) }
catch { throw 'Invalid ServerUrl.' }
if ($serverUri.Scheme -ne 'https') { throw 'DIMPRO Drive Desktop requires HTTPS.' }
$serverHost = $serverUri.Host.ToLowerInvariant()
if (($serverHost -eq 'dimpro.hu' -or $serverHost.EndsWith('.dimpro.hu')) -and -not $serverHost.EndsWith('.dev.dimpro.hu')) {
  throw 'V0.1.6 DEV ONLY: production DIMPRO host is denied.'
}

function Get-DriveClientId {
  if ($ClientId -and $ClientId.Trim()) { return $ClientId.Trim() }
  $machine = [string]$env:COMPUTERNAME
  if (-not $machine -or -not $machine.Trim()) { $machine = 'windows' }
  return ('drive-desktop-' + $machine.Trim().ToLowerInvariant())
}

function Read-SecretPlainText([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-BridgeDeviceToken {
  $localAppData = [string]$env:LOCALAPPDATA
  if (-not $localAppData -or -not $localAppData.Trim()) {
    $localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
  }
  if (-not $localAppData -or -not $localAppData.Trim()) { throw 'LOCAL_APP_DATA_NOT_AVAILABLE' }
  $tokenPath = Join-Path $localAppData 'DIMPRO\BenjAdminBridge\device-token.dpapi'
  if (-not (Test-Path -LiteralPath $tokenPath -PathType Leaf)) {
    throw ('Windows Bridge device token not found: ' + $tokenPath)
  }
  $encoded = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
  if (-not $encoded) { throw 'Windows Bridge device token file is empty.' }
  $protected = [Convert]::FromBase64String($encoded)
  $bytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $protected,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  try { return [Text.Encoding]::UTF8.GetString($bytes) }
  finally {
    if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
  }
}

function Request-DriveDesktopAccessToken {
  $bridgeToken = Get-BridgeDeviceToken
  $uri = $ServerUrl.TrimEnd('/') + '/api/drive/desktop-access/token'
  $headers = @{
    Authorization = ('Bearer ' + $bridgeToken)
    'x-dimpro-drive-client-id' = (Get-DriveClientId)
  }
  try {
    [byte[]]$bodyBytes = [Text.Encoding]::UTF8.GetBytes('{}')
    $response = Invoke-DriveUtf8JsonRequest -Method 'POST' -Uri $uri -Headers $headers -BodyBytes $bodyBytes -TimeoutSec 30
  } finally {
    $bridgeToken = $null
  }
  $responseOk = [bool](Get-ObjectPropertyValue $response 'ok' $false)
  $accessToken = [string](Get-ObjectPropertyValue $response 'accessToken' '')
  if (-not $responseOk -or -not $accessToken) {
    throw 'Drive Desktop access token exchange failed.'
  }
  return [pscustomobject]@{
    token = $accessToken
    expiresAt = [string](Get-ObjectPropertyValue $response 'expiresAt' '')
    deviceId = [string](Get-ObjectPropertyValue $response 'deviceId' '')
    agentId = [string](Get-ObjectPropertyValue $response 'agentId' '')
  }
}

function Get-DriveHeaders {
  if ($script:DriveAuthHeaders) { return $script:DriveAuthHeaders }
  $headers = @{ 'x-dimpro-drive-client-id' = (Get-DriveClientId) }

  if ($AuthMode -eq 'Bridge') {
    $issued = Request-DriveDesktopAccessToken
    $headers['Authorization'] = ('Bearer ' + $issued.token)
    $script:DriveAuthHeaders = $headers
    return $script:DriveAuthHeaders
  }

  $devToken = [string]$env:DIMPRO_DRIVE_DEV_TOKEN
  if (-not $devToken -or -not $devToken.Trim()) {
    $devToken = Read-SecretPlainText 'DIMPRO Drive DEV token'
  }
  if (-not $devToken -or -not $devToken.Trim()) { throw 'Missing DEV authentication.' }
  $headers['x-dimpro-drive-dev-token'] = $devToken.Trim()
  $script:DriveAuthHeaders = $headers
  return $script:DriveAuthHeaders
}

function Invoke-DriveGet([string]$Path) {
  $uri = $ServerUrl.TrimEnd('/') + $Path
  return Invoke-DriveUtf8JsonRequest -Method 'GET' -Uri $uri -Headers (Get-DriveHeaders) -TimeoutSec 30
}


function Get-ObjectPropertyValue {
  param(
    $InputObject,
    [Parameter(Mandatory=$true)][string]$Name,
    $DefaultValue = $null
  )
  if ($null -eq $InputObject) { return $DefaultValue }
  if ($InputObject -is [System.Collections.IDictionary]) {
    if ($InputObject.Contains($Name)) { return $InputObject[$Name] }
    return $DefaultValue
  }
  $property = $InputObject.PSObject.Properties[$Name]
  if ($null -eq $property) { return $DefaultValue }
  return $property.Value
}

function Get-HttpErrorSummary($ErrorRecord) {
  try {
    $response = $ErrorRecord.Exception.Response
    if ($null -eq $response) { return '' }
    $stream = $response.GetResponseStream()
    if ($null -eq $stream) { return '' }
    $reader = New-Object System.IO.StreamReader($stream, [Text.Encoding]::UTF8)
    try { $raw = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if (-not $raw) { return '' }
    try {
      $parsed = $raw | ConvertFrom-Json
      $code = [string](Get-ObjectPropertyValue $parsed 'code' '')
      $message = [string](Get-ObjectPropertyValue $parsed 'error' '')
      if ($code -or $message) { return (($code + ': ' + $message).Trim(': ')) }
    } catch { }
    return $raw.Substring(0, [Math]::Min(500, $raw.Length))
  } catch {
    return ''
  }
}

function ConvertFrom-DriveUtf8JsonResponse($Response) {
  if ($null -eq $Response) { throw 'DRIVE_HTTP_RESPONSE_MISSING' }
  $stream = Get-ObjectPropertyValue $Response 'RawContentStream' $null
  if ($null -eq $stream) { throw 'DRIVE_HTTP_RESPONSE_STREAM_MISSING' }
  if ($stream.CanSeek) { $stream.Position = 0 }
  $memory = New-Object System.IO.MemoryStream
  try {
    $stream.CopyTo($memory)
    [byte[]]$bytes = $memory.ToArray()
  } finally {
    $memory.Dispose()
  }
  if ($null -eq $bytes -or $bytes.Length -eq 0) { return $null }
  try {
    $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
    $jsonText = $utf8.GetString($bytes)
  } catch {
    throw 'DRIVE_HTTP_RESPONSE_UTF8_INVALID'
  }
  if (-not $jsonText -or -not $jsonText.Trim()) { return $null }
  try {
    return ($jsonText | ConvertFrom-Json)
  } catch {
    throw 'DRIVE_HTTP_RESPONSE_JSON_INVALID'
  }
}

function Invoke-DriveUtf8JsonRequest {
  param(
    [Parameter(Mandatory=$true)][ValidateSet('GET','POST')][string]$Method,
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][hashtable]$Headers,
    [byte[]]$BodyBytes = $null,
    [int]$TimeoutSec = 30
  )
  $params = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    UseBasicParsing = $true
    TimeoutSec = $TimeoutSec
  }
  if ($null -ne $BodyBytes) {
    $params['ContentType'] = 'application/json; charset=utf-8'
    $params['Body'] = $BodyBytes
  }
  try {
    $webResponse = Invoke-WebRequest @params
    return ConvertFrom-DriveUtf8JsonResponse $webResponse
  } catch {
    $summary = Get-HttpErrorSummary $_
    if ($summary) { throw ('DRIVE_HTTP_REQUEST_FAILED ' + $summary) }
    throw
  }
}

function ConvertTo-HeaderHashtable($InputObject) {
  $headers = @{}
  if ($null -eq $InputObject) { return $headers }
  foreach ($property in $InputObject.PSObject.Properties) {
    if ($null -ne $property.Value) { $headers[[string]$property.Name] = [string]$property.Value }
  }
  return $headers
}

function Invoke-DrivePostJson([string]$Path, $Body) {
  $uri = if ($Path.StartsWith('https://')) { $Path } else { $ServerUrl.TrimEnd('/') + $Path }
  $json = $Body | ConvertTo-Json -Depth 12 -Compress
  [byte[]]$bodyBytes = [Text.Encoding]::UTF8.GetBytes([string]$json)
  return Invoke-DriveUtf8JsonRequest -Method 'POST' -Uri $uri -Headers (Get-DriveHeaders) -BodyBytes $bodyBytes -TimeoutSec 60
}

function Invoke-DrivePostEmpty([string]$Path) {
  $uri = if ($Path.StartsWith('https://')) { $Path } else { $ServerUrl.TrimEnd('/') + $Path }
  [byte[]]$bodyBytes = [Text.Encoding]::UTF8.GetBytes('{}')
  return Invoke-DriveUtf8JsonRequest -Method 'POST' -Uri $uri -Headers (Get-DriveHeaders) -BodyBytes $bodyBytes -TimeoutSec 60
}

function Read-ApplyPlan([string]$Path) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'V016_APPLY_PLAN_FILE_REQUIRED' }
  try { $plan = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
  catch { throw 'V016_APPLY_PLAN_JSON_INVALID' }
  if ([int](Get-ObjectPropertyValue $plan 'schemaVersion' 0) -ne 1) { throw 'V016_APPLY_PLAN_SCHEMA_UNSUPPORTED' }
  $planProjectId = [string](Get-ObjectPropertyValue $plan 'projectId' '')
  if (-not $planProjectId -or -not $planProjectId.Trim()) { throw 'V016_APPLY_PLAN_PROJECT_REQUIRED' }
  if ($null -eq (Get-ObjectPropertyValue $plan 'operations' $null)) { throw 'V016_APPLY_PLAN_OPERATIONS_REQUIRED' }
  return $plan
}

function Test-ApplyRuntimeReady($Health, [bool]$NeedsUpload, [bool]$NeedsDownload) {
  $blockers = New-Object System.Collections.Generic.List[string]
  $database = Get-ObjectPropertyValue $Health 'database' $null
  $storage = Get-ObjectPropertyValue $Health 'storage' $null
  if (-not [bool](Get-ObjectPropertyValue $Health 'ok' $false)) { $blockers.Add('DRIVE_HEALTH_NOT_OK') }
  if (-not [bool](Get-ObjectPropertyValue $database 'ready' $false)) { $blockers.Add('DRIVE_DATABASE_NOT_READY') }
  if (-not [bool](Get-ObjectPropertyValue $storage 'databaseReady' $false)) { $blockers.Add('DRIVE_STORAGE_DATABASE_NOT_READY') }
  if (-not [bool](Get-ObjectPropertyValue $storage 'storageConfigured' $false)) { $blockers.Add('DRIVE_STORAGE_NOT_CONFIGURED') }
  if ($NeedsUpload -and -not [bool](Get-ObjectPropertyValue $storage 'realObjectWriteEnabled' $false)) { $blockers.Add('DRIVE_OBJECT_WRITE_NOT_READY') }
  if ($NeedsDownload -and -not [bool](Get-ObjectPropertyValue $storage 'realObjectDownloadEnabled' $false)) { $blockers.Add('DRIVE_OBJECT_DOWNLOAD_NOT_READY') }
  return [pscustomobject]@{ ready = ($blockers.Count -eq 0); blockers = @($blockers) }
}

function Invoke-DesktopUpload($Operation, [string]$ProjectIdValue) {
  $localPath = [string](Get-ObjectPropertyValue $Operation 'localPath' '')
  if (-not $localPath -or -not (Test-Path -LiteralPath $localPath -PathType Leaf)) { throw ('UPLOAD_LOCAL_FILE_NOT_FOUND: ' + $localPath) }
  $file = Get-Item -LiteralPath $localPath
  $sha256 = Get-FileSha256 $localPath
  $mimeRaw = Get-ObjectPropertyValue $Operation 'mimeType' ''
  $mimeType = if ($mimeRaw) { [string]$mimeRaw } else { 'application/octet-stream' }
  $documentNameRaw = Get-ObjectPropertyValue $Operation 'documentName' ''
  $folderId = [string](Get-ObjectPropertyValue $Operation 'folderId' '')
  $documentId = [string](Get-ObjectPropertyValue $Operation 'documentId' '')
  $expectedCurrentVersion = Get-ObjectPropertyValue $Operation 'expectedCurrentVersion' $null
  $description = Get-ObjectPropertyValue $Operation 'description' ''
  $revisionCode = Get-ObjectPropertyValue $Operation 'revisionCode' ''
  $changeNote = Get-ObjectPropertyValue $Operation 'changeNote' ''
  $kind = ([string](Get-ObjectPropertyValue $Operation 'kind' '')).ToUpperInvariant()

  if ($kind -eq 'UPLOAD_NEW' -and -not $folderId) { throw 'UPLOAD_NEW_FOLDER_ID_REQUIRED' }
  if ($kind -eq 'UPLOAD_VERSION' -and -not $documentId) { throw 'UPLOAD_VERSION_DOCUMENT_ID_REQUIRED' }

  $body = [ordered]@{
    originalName = $file.Name
    documentName = if ($documentNameRaw) { [string]$documentNameRaw } else { $file.Name }
    sizeBytes = [int64]$file.Length
    mimeType = $mimeType
    sha256 = $sha256
    source = 'DESKTOP'
  }
  if ($folderId) { $body.folderId = $folderId }
  if ($documentId) { $body.documentId = $documentId }
  if ($null -ne $expectedCurrentVersion) { $body.expectedCurrentVersion = [int]$expectedCurrentVersion }
  if ($description) { $body.description = [string]$description }
  if ($revisionCode) { $body.revisionCode = [string]$revisionCode }
  if ($changeNote) { $body.changeNote = [string]$changeNote }

  $projectEscaped = [uri]::EscapeDataString($ProjectIdValue)
  $init = Invoke-DrivePostJson ('/api/projects/' + $projectEscaped + '/drive/uploads/init') $body
  $upload = Get-ObjectPropertyValue $init 'upload' $null
  $signedUpload = Get-ObjectPropertyValue $init 'signedUpload' $null
  $completeUrl = [string](Get-ObjectPropertyValue $init 'completeUrl' '')
  $abortUrl = [string](Get-ObjectPropertyValue $init 'abortUrl' '')
  if (-not [bool](Get-ObjectPropertyValue $init 'ok' $false) -or $null -eq $upload -or $null -eq $signedUpload -or -not $completeUrl) { throw 'UPLOAD_INIT_RESPONSE_INVALID' }
  $uploadId = [string](Get-ObjectPropertyValue $upload 'id' '')
  $signedUrl = [string](Get-ObjectPropertyValue $signedUpload 'url' '')
  $signedMethod = [string](Get-ObjectPropertyValue $signedUpload 'method' '')
  if (-not $uploadId -or -not $signedUrl) { throw 'UPLOAD_INIT_RESPONSE_INVALID' }
  if ($signedMethod -ne 'PUT') { throw 'UPLOAD_SIGNED_METHOD_INVALID' }
  $signedHeaders = ConvertTo-HeaderHashtable (Get-ObjectPropertyValue $signedUpload 'headers' $null)
  try {
    Invoke-PresignedPutFile $signedUrl $localPath $signedHeaders
    $complete = Invoke-DrivePostEmpty $completeUrl
    if (-not [bool](Get-ObjectPropertyValue $complete 'ok' $false)) { throw 'UPLOAD_COMPLETE_FAILED' }
    $objectResult = Get-ObjectPropertyValue $complete 'object' $null
    $documentResult = Get-ObjectPropertyValue $complete 'document' $null
    $versionResult = Get-ObjectPropertyValue $complete 'version' $null
    if ($objectResult) {
      $serverSha = [string](Get-ObjectPropertyValue $objectResult 'sha256' '')
      if ($serverSha -and $serverSha.ToLowerInvariant() -ne $sha256) { throw 'UPLOAD_COMPLETE_SHA256_MISMATCH' }
    }
    return [ordered]@{
      kind = 'UPLOAD'
      localPath = $localPath
      uploadId = $uploadId
      documentId = if ($documentResult) { [string](Get-ObjectPropertyValue $documentResult 'id' '') } else { [string](Get-ObjectPropertyValue $upload 'documentId' '') }
      versionId = if ($versionResult) { [string](Get-ObjectPropertyValue $versionResult 'id' '') } else { '' }
      sizeBytes = [int64]$file.Length
      sha256 = $sha256
      ok = $true
    }
  } catch {
    if ($abortUrl) {
      try { [void](Invoke-DrivePostJson $abortUrl @{ reason = 'DIMPRO Drive Desktop signed upload or complete failed.' }) } catch {}
    }
    throw
  }
}

function Invoke-DesktopDownload($Operation, [string]$ProjectIdValue) {
  $documentId = [string](Get-ObjectPropertyValue $Operation 'documentId' '')
  $destinationPath = [string](Get-ObjectPropertyValue $Operation 'destinationPath' '')
  $versionId = [string](Get-ObjectPropertyValue $Operation 'versionId' '')
  $expectedSha = [string](Get-ObjectPropertyValue $Operation 'sha256' '')
  if (-not $documentId) { throw 'DOWNLOAD_DOCUMENT_ID_REQUIRED' }
  if (-not $destinationPath) { throw 'DOWNLOAD_DESTINATION_REQUIRED' }
  $projectEscaped = [uri]::EscapeDataString($ProjectIdValue)
  $documentEscaped = [uri]::EscapeDataString($documentId)
  $body = @{}
  if ($versionId) { $body.versionId = $versionId }
  $init = Invoke-DrivePostJson ('/api/projects/' + $projectEscaped + '/drive/documents/' + $documentEscaped + '/download') $body
  $downloadInfo = Get-ObjectPropertyValue $init 'download' $null
  if (-not [bool](Get-ObjectPropertyValue $init 'ok' $false) -or $null -eq $downloadInfo) { throw 'DOWNLOAD_INIT_RESPONSE_INVALID' }
  $signedUrl = [string](Get-ObjectPropertyValue $downloadInfo 'url' '')
  $signedMethod = [string](Get-ObjectPropertyValue $downloadInfo 'method' '')
  if (-not $signedUrl) { throw 'DOWNLOAD_INIT_RESPONSE_INVALID' }
  if ($signedMethod -ne 'GET') { throw 'DOWNLOAD_SIGNED_METHOD_INVALID' }
  Invoke-PresignedGetFile $signedUrl $destinationPath $expectedSha @{}
  $downloaded = Get-Item -LiteralPath $destinationPath
  $expectedSize = Get-ObjectPropertyValue $downloadInfo 'sizeBytes' $null
  if ($null -ne $expectedSize -and [int64]$downloaded.Length -ne [int64]$expectedSize) { throw 'DOWNLOAD_SIZE_MISMATCH' }
  return [ordered]@{
    kind = 'DOWNLOAD'
    documentId = $documentId
    versionId = [string](Get-ObjectPropertyValue $downloadInfo 'versionId' '')
    destinationPath = $destinationPath
    sizeBytes = [int64]$downloaded.Length
    sha256 = if ($expectedSha) { Get-FileSha256 $destinationPath } else { '' }
    ok = $true
  }
}

function Save-DesktopCursor([string]$ProjectIdValue, [long]$CursorValue, [int]$OperationCount) {
  $projectEscaped = [uri]::EscapeDataString($ProjectIdValue)
  $body = [ordered]@{
    clientId = Get-DriveClientId
    machineName = [string]$env:COMPUTERNAME
    cursorValue = $CursorValue
    metadata = [ordered]@{
      source = 'DIMPRO Drive Desktop V0.1.6'
      operationCount = $OperationCount
      appliedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    }
  }
  $result = Invoke-DrivePostJson ('/api/projects/' + $projectEscaped + '/drive/sync/cursor') $body
  if (-not [bool](Get-ObjectPropertyValue $result 'ok' $false)) { throw 'SYNC_CURSOR_SAVE_FAILED' }
  return $result
}

function Get-RelativePathPortable([string]$BasePath, [string]$FullPath) {
  $base = [IO.Path]::GetFullPath($BasePath).TrimEnd('\\') + '\\'
  $full = [IO.Path]::GetFullPath($FullPath)
  if (-not $full.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw ('File escaped local root: ' + $FullPath) }
  return $full.Substring($base.Length).Replace('\\','/')
}

function Get-LocalManifest([string]$Root) {
  if (-not $Root -or -not $Root.Trim()) { throw 'Plan mode requires LocalRoot.' }
  if (-not (Test-Path -LiteralPath $Root -PathType Container)) { throw ('LocalRoot not found: ' + $Root) }
  $rootFull = (Resolve-Path -LiteralPath $Root).Path
  $files = Get-ChildItem -LiteralPath $rootFull -File -Recurse -Force | Where-Object { $_.FullName -notmatch '[\\/]\.dimpro-drive[\\/]' }
  $manifest = foreach ($file in $files) {
    $hash = Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256
    [ordered]@{
      relativePath = Get-RelativePathPortable $rootFull $file.FullName
      sizeBytes = [int64]$file.Length
      sha256 = $hash.Hash.ToLowerInvariant()
      lastWriteTimeUtc = $file.LastWriteTimeUtc.ToString('o')
    }
  }
  return @($manifest | Sort-Object relativePath)
}

function Write-Result($Result) {
  $json = $Result | ConvertTo-Json -Depth 12
  if ($OutputPath -and $OutputPath.Trim()) {
    $parent = Split-Path -Parent $OutputPath
    if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $json | Set-Content -LiteralPath $OutputPath -Encoding UTF8
  }
  $json
}


function Get-FileSha256([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw ('File not found for SHA-256: ' + $Path)
  }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-ExpectedSha256([string]$Path, [string]$ExpectedSha256) {
  if (-not $ExpectedSha256 -or -not $ExpectedSha256.Trim()) { return }
  $expected = $ExpectedSha256.Trim().ToLowerInvariant()
  if ($expected -notmatch '^[0-9a-f]{64}$') { throw 'Invalid expected SHA-256.' }
  $actual = Get-FileSha256 $Path
  if ($actual -ne $expected) {
    throw ('SHA256_MISMATCH expected=' + $expected + ' actual=' + $actual)
  }
}

function Invoke-PresignedPutFile(
  [string]$Url,
  [string]$FilePath,
  [hashtable]$Headers = @{}
) {
  if (-not $Url.StartsWith('https://')) { throw 'SIGNED_PUT_REQUIRES_HTTPS' }
  if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
    throw ('SIGNED_PUT_FILE_NOT_FOUND: ' + $FilePath)
  }
  Invoke-WebRequest -Method Put -Uri $Url -Headers $Headers -InFile $FilePath -UseBasicParsing -TimeoutSec 300 | Out-Null
}

function Invoke-PresignedGetFile(
  [string]$Url,
  [string]$DestinationPath,
  [string]$ExpectedSha256 = '',
  [hashtable]$Headers = @{}
) {
  if (-not $Url.StartsWith('https://')) { throw 'SIGNED_GET_REQUIRES_HTTPS' }
  if (Test-Path -LiteralPath $DestinationPath -PathType Leaf) {
    throw ('DOWNLOAD_TARGET_ALREADY_EXISTS: ' + $DestinationPath)
  }

  $parent = Split-Path -Parent $DestinationPath
  if (-not $parent) { throw 'DOWNLOAD_TARGET_PARENT_REQUIRED' }
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    throw ('DOWNLOAD_TARGET_PARENT_NOT_FOUND: ' + $parent)
  }

  $leaf = Split-Path -Leaf $DestinationPath
  $tempPath = Join-Path $parent ('.dimpro-part-' + [Guid]::NewGuid().ToString('N') + '-' + $leaf)

  try {
    Invoke-WebRequest -Method Get -Uri $Url -Headers $Headers -OutFile $tempPath -UseBasicParsing -TimeoutSec 300 | Out-Null
    Assert-ExpectedSha256 $tempPath $ExpectedSha256
    [IO.File]::Move($tempPath, $DestinationPath)
  } catch {
    if (Test-Path -LiteralPath $tempPath -PathType Leaf) {
      [IO.File]::Delete($tempPath)
    }
    throw
  }
}

function Get-ApplyReadiness($Contract) {
  $blockers = New-Object System.Collections.Generic.List[string]
  $core = Get-ObjectPropertyValue $Contract 'projectGateDriveCore' $null

  if ($null -eq $core) {
    $blockers.Add('PROJECT_GATE_DRIVE_CORE_MISSING')
  } else {
    foreach ($field in @('objectUploadInit','objectUploadComplete','objectDownloadInit','cursor')) {
      if (-not (Get-ObjectPropertyValue $core $field $null)) { $blockers.Add(('CONTRACT_ENDPOINT_MISSING_' + $field.ToUpperInvariant())) }
    }

    $objectStorage = Get-ObjectPropertyValue $core 'objectStorage' $null
    if ($objectStorage) {
      $writeMode = [string](Get-ObjectPropertyValue $objectStorage 'objectWrites' '')
      if ($writeMode -and ($writeMode.ToLowerInvariant().Contains('disabled') -or $writeMode.ToLowerInvariant().Contains('required'))) {
        $blockers.Add('OBJECT_STORAGE_WRITES_NOT_READY')
      }
    } else {
      $blockers.Add('OBJECT_STORAGE_CONTRACT_MISSING')
    }
  }

  $auth = Get-ObjectPropertyValue $Contract 'auth' $null
  $authModes = @(Get-ObjectPropertyValue $auth 'currentModes' @())
  if (-not ($authModes -contains 'desktop-access')) {
    $blockers.Add('DESKTOP_ACCESS_MODE_NOT_ADVERTISED')
  }

  return [pscustomobject]@{
    ready = ($blockers.Count -eq 0)
    blockers = @($blockers)
    requiredGates = @(
      'physical Windows PowerShell 5.1 acceptance PASS',
      'Bridge-backed desktop access token runtime active',
      'live read-only Probe PASS',
      'private object storage writes ready',
      'exact upload/download request schema verified'
    )
  }
}

$contract = Invoke-DriveGet '/api/drive/desktop-contract'
if (-not [bool](Get-ObjectPropertyValue $contract 'ok' $false)) { throw 'DIMPRO Drive Desktop API contract unavailable.' }


$applyReadiness = Get-ApplyReadiness $contract

if ($Mode -eq 'Apply') {
  if (-not $EnableApply) { throw 'V016_APPLY_ENABLE_SWITCH_REQUIRED' }
  if (-not $AllowServerMutation) { throw 'V016_SERVER_MUTATION_APPROVAL_REQUIRED' }
  if (-not $AllowLocalMutation) { throw 'V016_LOCAL_MUTATION_APPROVAL_REQUIRED' }
  $plan = Read-ApplyPlan $ApplyPlanPath
  $planProjectId = ([string](Get-ObjectPropertyValue $plan 'projectId' '')).Trim()
  if ($ProjectId -and $ProjectId.Trim() -and $ProjectId.Trim() -ne $planProjectId) { throw 'V016_PROJECT_ID_MISMATCH' }
  $operations = @(Get-ObjectPropertyValue $plan 'operations' @())
  $needsUpload = @($operations | Where-Object { ([string](Get-ObjectPropertyValue $_ 'kind' '')).ToUpperInvariant().StartsWith('UPLOAD') }).Count -gt 0
  $needsDownload = @($operations | Where-Object { ([string](Get-ObjectPropertyValue $_ 'kind' '')).ToUpperInvariant() -eq 'DOWNLOAD' }).Count -gt 0
  $projectEscaped = [uri]::EscapeDataString($planProjectId)
  $health = Invoke-DriveGet ('/api/projects/' + $projectEscaped + '/drive/health')
  $runtimeReadiness = Test-ApplyRuntimeReady $health $needsUpload $needsDownload
  if (-not $runtimeReadiness.ready) { throw ('V016_APPLY_NOT_READY: ' + ($runtimeReadiness.blockers -join ',')) }

  $results = @()
  foreach ($operation in $operations) {
    $kind = ([string](Get-ObjectPropertyValue $operation 'kind' '')).ToUpperInvariant()
    if ($kind -eq 'UPLOAD_NEW' -or $kind -eq 'UPLOAD_VERSION') {
      $results += Invoke-DesktopUpload $operation $planProjectId
    } elseif ($kind -eq 'DOWNLOAD') {
      $results += Invoke-DesktopDownload $operation $planProjectId
    } else {
      throw ('V016_OPERATION_KIND_UNSUPPORTED: ' + $kind)
    }
  }
  $cursorResult = $null
  $nextCursorValue = Get-ObjectPropertyValue $plan 'nextCursor' $null
  if ($null -ne $nextCursorValue) {
    $cursorResult = Save-DesktopCursor $planProjectId ([long]$nextCursorValue) $results.Count
  }
  Write-Result ([ordered]@{
    ok = $true
    mode = 'Apply'
    version = '0.1.6'
    projectId = $planProjectId
    operationCount = $results.Count
    operations = $results
    cursor = $cursorResult
    safety = [ordered]@{ devOnly = $true; explicitApply = $true; delete = $false }
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  })
  return
}

if ($Mode -eq 'Probe') {
  $projects = Invoke-DriveGet '/api/projects'
  $items = @()
  $projectItems = Get-ObjectPropertyValue $projects 'projects' @()
  if ($projectItems) { $items = @($projectItems) }
  Write-Result ([ordered]@{
    ok = $true
    mode = 'Probe'
    authMode = $AuthMode
    clientId = Get-DriveClientId
    serverUrl = $ServerUrl
    contractVersion = [string](Get-ObjectPropertyValue $contract 'version' '')
    contractMode = [string](Get-ObjectPropertyValue $contract 'mode' '')
    projectCount = $items.Count
    projects = $items
    applyReadiness = $applyReadiness
    safety = [ordered]@{ devOnly = $true; serverMutation = $false; localMutation = $false; delete = $false }
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  })
  return
}

if (-not $ProjectId -or -not $ProjectId.Trim()) { throw 'Plan mode requires ProjectId.' }
$manifest = Get-LocalManifest $LocalRoot
$projectIdEscaped = [uri]::EscapeDataString($ProjectId.Trim())
$health = Invoke-DriveGet ('/api/projects/' + $projectIdEscaped + '/drive/health')
$tree = Invoke-DriveGet ('/api/projects/' + $projectIdEscaped + '/drive/tree')
$changes = Invoke-DriveGet ('/api/projects/' + $projectIdEscaped + '/drive/changes?cursor=' + $Cursor)
$remoteFiles = @()
$treeFiles = Get-ObjectPropertyValue $tree 'files' @()
$treeItems = Get-ObjectPropertyValue $tree 'items' @()
if ($treeFiles) { $remoteFiles = @($treeFiles) }
elseif ($treeItems) {
  $remoteFiles = @($treeItems | Where-Object {
    ([string](Get-ObjectPropertyValue $_ 'type' '')).ToLowerInvariant() -eq 'file' -or
    ([string](Get-ObjectPropertyValue $_ 'kind' '')).ToLowerInvariant() -eq 'file'
  })
}
$remoteByPath = @{}
foreach ($item in $remoteFiles) {
  $path = [string](Get-ObjectPropertyValue $item 'relativePath' '')
  if (-not $path) { $path = [string](Get-ObjectPropertyValue $item 'path' '') }
  if (-not $path) { $path = [string](Get-ObjectPropertyValue $item 'name' '') }
  if ($path) { $remoteByPath[$path.Replace('\\','/').ToLowerInvariant()] = $item }
}
$localOnly = @(); $matched = @()
foreach ($local in $manifest) {
  $key = ([string](Get-ObjectPropertyValue $local 'relativePath' '')).ToLowerInvariant()
  if ($remoteByPath.ContainsKey($key)) { $matched += [ordered]@{ local = $local; remote = $remoteByPath[$key] } }
  else { $localOnly += $local }
}
Write-Result ([ordered]@{
  ok = $true
  mode = 'Plan'
  authMode = $AuthMode
  clientId = Get-DriveClientId
  serverUrl = $ServerUrl
  projectId = $ProjectId.Trim()
  localRoot = (Resolve-Path -LiteralPath $LocalRoot).Path
  cursor = $Cursor
  contractVersion = [string](Get-ObjectPropertyValue $contract 'version' '')
  health = $health
  applyReadiness = $applyReadiness
  local = [ordered]@{ fileCount = $manifest.Count; files = $manifest }
  remote = [ordered]@{ fileCount = $remoteFiles.Count; tree = $tree; changes = $changes }
  plan = [ordered]@{
    localOnlyCount = $localOnly.Count
    matchedCount = $matched.Count
    localOnly = $localOnly
    matched = $matched
    note = 'V0.1.6 plans only. No upload, download, rename or delete.'
  }
  safety = [ordered]@{ devOnly = $true; serverMutation = $false; localMutation = $false; delete = $false }
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
})
