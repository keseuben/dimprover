param(
  [ValidateSet('Probe','Plan')][string]$Mode = 'Probe',
  [ValidateSet('Bridge','DevToken')][string]$AuthMode = 'Bridge',
  [string]$ServerUrl = 'https://drive.dev.dimpro.hu',
  [string]$ProjectId = '',
  [string]$LocalRoot = '',
  [long]$Cursor = 0,
  [string]$ClientId = '',
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script:DriveAuthHeaders = $null

try { $serverUri = New-Object System.Uri($ServerUrl) }
catch { throw 'Invalid ServerUrl.' }
if ($serverUri.Scheme -ne 'https') { throw 'DIMPRO Drive Desktop requires HTTPS.' }
$serverHost = $serverUri.Host.ToLowerInvariant()
if (($serverHost -eq 'dimpro.hu' -or $serverHost.EndsWith('.dimpro.hu')) -and -not $serverHost.EndsWith('.dev.dimpro.hu')) {
  throw 'V0.1.3 DEV ONLY: production DIMPRO host is denied.'
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
  $tokenPath = Join-Path $env:LOCALAPPDATA 'DIMPRO\BenjAdminBridge\device-token.dpapi'
  if (-not (Test-Path -LiteralPath $tokenPath -PathType Leaf)) {
    throw ('Windows Bridge device token not found: ' + $tokenPath)
  }
  $encoded = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
  if (-not $encoded) { throw 'Windows Bridge device token file is empty.' }
  $protected = [Convert]::FromBase64String($encoded)
  $bytes = [Security.Cryptography.ProtectedData]::Unprotect(
    $protected,
    $null,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
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
    $response = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 30
  } finally {
    $bridgeToken = $null
  }
  if (-not $response.ok -or -not $response.accessToken) {
    throw 'Drive Desktop access token exchange failed.'
  }
  return [pscustomobject]@{
    token = [string]$response.accessToken
    expiresAt = [string]$response.expiresAt
    deviceId = [string]$response.deviceId
    agentId = [string]$response.agentId
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
  return Invoke-RestMethod -Method Get -Uri $uri -Headers (Get-DriveHeaders) -TimeoutSec 30
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

$contract = Invoke-DriveGet '/api/drive/desktop-contract'
if (-not $contract.ok) { throw 'DIMPRO Drive Desktop API contract unavailable.' }

if ($Mode -eq 'Probe') {
  $projects = Invoke-DriveGet '/api/projects'
  $items = @()
  if ($projects.projects) { $items = @($projects.projects) }
  Write-Result ([ordered]@{
    ok = $true
    mode = 'Probe'
    authMode = $AuthMode
    clientId = Get-DriveClientId
    serverUrl = $ServerUrl
    contractVersion = $contract.version
    contractMode = $contract.mode
    projectCount = $items.Count
    projects = $items
    safety = [ordered]@{ devOnly = $true; serverMutation = $false; localMutation = $false; delete = $false }
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  })
  exit 0
}

if (-not $ProjectId -or -not $ProjectId.Trim()) { throw 'Plan mode requires ProjectId.' }
$manifest = Get-LocalManifest $LocalRoot
$projectIdEscaped = [uri]::EscapeDataString($ProjectId.Trim())
$health = Invoke-DriveGet ('/api/projects/' + $projectIdEscaped + '/drive/health')
$tree = Invoke-DriveGet ('/api/projects/' + $projectIdEscaped + '/drive/tree')
$changes = Invoke-DriveGet ('/api/projects/' + $projectIdEscaped + '/drive/changes?cursor=' + $Cursor)
$remoteFiles = @()
if ($tree.files) { $remoteFiles = @($tree.files) }
elseif ($tree.items) { $remoteFiles = @($tree.items | Where-Object { $_.type -eq 'file' -or $_.kind -eq 'file' }) }
$remoteByPath = @{}
foreach ($item in $remoteFiles) {
  $path = ''
  if ($item.relativePath) { $path = [string]$item.relativePath }
  elseif ($item.path) { $path = [string]$item.path }
  elseif ($item.name) { $path = [string]$item.name }
  if ($path) { $remoteByPath[$path.Replace('\\','/').ToLowerInvariant()] = $item }
}
$localOnly = @(); $matched = @()
foreach ($local in $manifest) {
  $key = ([string]$local.relativePath).ToLowerInvariant()
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
  contractVersion = $contract.version
  health = $health
  local = [ordered]@{ fileCount = $manifest.Count; files = $manifest }
  remote = [ordered]@{ fileCount = $remoteFiles.Count; tree = $tree; changes = $changes }
  plan = [ordered]@{
    localOnlyCount = $localOnly.Count
    matchedCount = $matched.Count
    localOnly = $localOnly
    matched = $matched
    note = 'V0.1.3 plans only. No upload, download, rename or delete.'
  }
  safety = [ordered]@{ devOnly = $true; serverMutation = $false; localMutation = $false; delete = $false }
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
})
