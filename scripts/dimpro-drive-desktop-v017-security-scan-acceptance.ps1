param(
  [Parameter(Mandatory=$true)][string]$PlanPath,
  [Parameter(Mandatory=$true)][string]$ReviewedPlanSha256,
  [string]$ServerUrl = 'https://drive.dev.dimpro.hu',
  [string]$ExpectedProjectId = 'd6-irodaepulet',
  [int]$ExpectedScanCount = 5,
  [string]$ResultRoot = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-PropertyValue($Object, [string]$Name, $DefaultValue = $null) {
  if ($null -eq $Object) { return $DefaultValue }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $DefaultValue }
  return $property.Value
}

if (-not (Test-Path -LiteralPath $PlanPath -PathType Leaf)) { throw 'V017_SECURITY_ACCEPTANCE_PLAN_MISSING' }
$expectedHash = $ReviewedPlanSha256.Trim().ToLowerInvariant()
if ($expectedHash -notmatch '^[0-9a-f]{64}$') { throw 'V017_SECURITY_ACCEPTANCE_PLAN_SHA_INVALID' }
$actualHash = (Get-FileHash -LiteralPath $PlanPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) { throw ('V017_SECURITY_ACCEPTANCE_PLAN_SHA_MISMATCH expected=' + $expectedHash + ' actual=' + $actualHash) }

try { $plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json }
catch { throw 'V017_SECURITY_ACCEPTANCE_PLAN_JSON_INVALID' }
if ([int](Get-PropertyValue $plan 'schemaVersion' 0) -ne 1) { throw 'V017_SECURITY_ACCEPTANCE_SCHEMA_INVALID' }
if ([string](Get-PropertyValue $plan 'planKind' '') -ne 'DIMPRO_DRIVE_DESKTOP_MANUAL_SYNC_V017') { throw 'V017_SECURITY_ACCEPTANCE_KIND_INVALID' }
$projectId = [string](Get-PropertyValue $plan 'projectId' '')
if ($projectId -ne $ExpectedProjectId) { throw ('V017_SECURITY_ACCEPTANCE_PROJECT_MISMATCH actual=' + $projectId) }
if ([int](Get-PropertyValue $plan 'conflictCount' -1) -ne 0) { throw 'V017_SECURITY_ACCEPTANCE_CONFLICTS_PRESENT' }
$operations = @(Get-PropertyValue $plan 'operations' @())
if ($operations.Count -ne $ExpectedScanCount) { throw ('V017_SECURITY_ACCEPTANCE_OPERATION_COUNT_MISMATCH expected=' + $ExpectedScanCount + ' actual=' + $operations.Count) }
$plannedByVersion = @{}
foreach ($operation in $operations) {
  $kind = ([string](Get-PropertyValue $operation 'kind' '')).ToUpperInvariant()
  if ($kind -ne 'DOWNLOAD') { throw ('V017_SECURITY_ACCEPTANCE_NON_DOWNLOAD_OPERATION: ' + $kind) }
  $versionId = [string](Get-PropertyValue $operation 'versionId' '')
  $documentId = [string](Get-PropertyValue $operation 'documentId' '')
  $sha = ([string](Get-PropertyValue $operation 'sha256' '')).ToLowerInvariant()
  if (-not $versionId -or -not $documentId) { throw 'V017_SECURITY_ACCEPTANCE_ID_REQUIRED' }
  if ($sha -notmatch '^[0-9a-f]{64}$') { throw 'V017_SECURITY_ACCEPTANCE_EXPECTED_SHA_REQUIRED' }
  if ($plannedByVersion.ContainsKey($versionId)) { throw ('V017_SECURITY_ACCEPTANCE_DUPLICATE_VERSION: ' + $versionId) }
  $plannedByVersion[$versionId] = $operation
}

$mainScript = Join-Path $PSScriptRoot 'dimpro-drive-desktop-manual-sync-v017.ps1'
if (-not (Test-Path -LiteralPath $mainScript -PathType Leaf)) { throw 'V017_SECURITY_ACCEPTANCE_MAIN_SCRIPT_MISSING' }
if (-not $ResultRoot) { $ResultRoot = Join-Path ([IO.Path]::GetTempPath()) 'DIMPRO-Drive-V017-Security-Scan-Acceptance' }
if (-not (Test-Path -LiteralPath $ResultRoot -PathType Container)) { New-Item -ItemType Directory -Path $ResultRoot -Force | Out-Null }
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$resultPath = Join-Path $ResultRoot ('security-scan-result-' + $stamp + '.json')
$machine = [string]$env:COMPUTERNAME
if (-not $machine -or -not $machine.Trim()) { $machine = 'windows' }
$acceptanceClientId = ('drive-desktop-v017-security-scan-acceptance-' + $machine.Trim().ToLowerInvariant())

& $mainScript `
  -Mode ScanPlan `
  -AuthMode Bridge `
  -ServerUrl $ServerUrl `
  -ProjectId $ExpectedProjectId `
  -ClientId $acceptanceClientId `
  -ApplyPlanPath $PlanPath `
  -ReviewedPlanSha256 $expectedHash `
  -EnableSecurityScan `
  -AllowServerMutation `
  -OutputPath $resultPath | Out-Null

if (-not (Test-Path -LiteralPath $resultPath -PathType Leaf)) { throw 'V017_SECURITY_ACCEPTANCE_RESULT_MISSING' }
$result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
if (-not [bool](Get-PropertyValue $result 'ok' $false) -or [string](Get-PropertyValue $result 'mode' '') -ne 'ScanPlan') { throw 'V017_SECURITY_ACCEPTANCE_RESULT_INVALID' }
if ([string](Get-PropertyValue $result 'reviewedPlanSha256' '') -ne $expectedHash) { throw 'V017_SECURITY_ACCEPTANCE_RESULT_SHA_MISMATCH' }
if ([int](Get-PropertyValue $result 'scanCount' -1) -ne $ExpectedScanCount) { throw 'V017_SECURITY_ACCEPTANCE_RESULT_SCAN_COUNT_MISMATCH' }
if ([int](Get-PropertyValue $result 'cleanCount' -1) -ne $ExpectedScanCount) { throw 'V017_SECURITY_ACCEPTANCE_RESULT_CLEAN_COUNT_MISMATCH' }

$scans = @(Get-PropertyValue $result 'scans' @())
if ($scans.Count -ne $ExpectedScanCount) { throw 'V017_SECURITY_ACCEPTANCE_RESULT_ITEMS_MISMATCH' }
foreach ($scan in $scans) {
  if ([string](Get-PropertyValue $scan 'kind' '') -ne 'SECURITY_SCAN') { throw 'V017_SECURITY_ACCEPTANCE_RESULT_KIND_INVALID' }
  if (([string](Get-PropertyValue $scan 'status' '')).ToUpperInvariant() -ne 'CLEAN') { throw 'V017_SECURITY_ACCEPTANCE_RESULT_NOT_CLEAN' }
  $versionId = [string](Get-PropertyValue $scan 'versionId' '')
  if (-not $plannedByVersion.ContainsKey($versionId)) { throw ('V017_SECURITY_ACCEPTANCE_UNPLANNED_VERSION: ' + $versionId) }
  $planned = $plannedByVersion[$versionId]
  $expectedSha = ([string](Get-PropertyValue $planned 'sha256' '')).ToLowerInvariant()
  $scanSha = ([string](Get-PropertyValue $scan 'sha256' '')).ToLowerInvariant()
  if ($scanSha -ne $expectedSha) { throw ('V017_SECURITY_ACCEPTANCE_RESULT_HASH_MISMATCH versionId=' + $versionId) }
}

$security = Get-PropertyValue $result 'security' $null
if ($null -eq $security -or -not [bool](Get-PropertyValue $security 'ready' $false)) { throw 'V017_SECURITY_ACCEPTANCE_SCANNER_NOT_READY' }

$summary = [ordered]@{
  ok = $true
  code = 'DIMPRO_DRIVE_DESKTOP_V017_SECURITY_SCAN_ACCEPTANCE_PASS'
  projectId = $ExpectedProjectId
  clientId = $acceptanceClientId
  reviewedPlanSha256 = $expectedHash
  resultPath = $resultPath
  scanCount = $ExpectedScanCount
  cleanCount = $ExpectedScanCount
  scannerReady = $true
  scannerEngine = [string](Get-PropertyValue $security 'engine' '')
  scannerEngineVersion = [string](Get-PropertyValue $security 'engineVersion' '')
  signatureVersion = [string](Get-PropertyValue $security 'signatureVersion' '')
  serverMutation = 'SECURITY_SCAN_METADATA'
  documentContentMutation = $false
  localMutation = $false
  delete = $false
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$summary | ConvertTo-Json -Depth 8
Write-Host 'DIMPRO_DRIVE_DESKTOP_V017_SECURITY_SCAN_ACCEPTANCE_PASS'
