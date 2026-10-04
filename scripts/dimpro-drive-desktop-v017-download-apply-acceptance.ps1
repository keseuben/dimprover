param(
  [Parameter(Mandatory=$true)][string]$PlanPath,
  [Parameter(Mandatory=$true)][string]$ReviewedPlanSha256,
  [string]$ServerUrl = 'https://drive.dev.dimpro.hu',
  [string]$ExpectedProjectId = 'd6-irodaepulet',
  [int]$ExpectedDownloadCount = 5,
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

if (-not (Test-Path -LiteralPath $PlanPath -PathType Leaf)) { throw 'V017_DOWNLOAD_APPLY_PLAN_MISSING' }
$expectedHash = $ReviewedPlanSha256.Trim().ToLowerInvariant()
if ($expectedHash -notmatch '^[0-9a-f]{64}$') { throw 'V017_DOWNLOAD_APPLY_PLAN_SHA_INVALID' }
$actualHash = (Get-FileHash -LiteralPath $PlanPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) { throw ('V017_DOWNLOAD_APPLY_PLAN_SHA_MISMATCH expected=' + $expectedHash + ' actual=' + $actualHash) }

try { $plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json }
catch { throw 'V017_DOWNLOAD_APPLY_PLAN_JSON_INVALID' }

if ([int](Get-PropertyValue $plan 'schemaVersion' 0) -ne 1) { throw 'V017_DOWNLOAD_APPLY_SCHEMA_INVALID' }
if ([string](Get-PropertyValue $plan 'planKind' '') -ne 'DIMPRO_DRIVE_DESKTOP_MANUAL_SYNC_V017') { throw 'V017_DOWNLOAD_APPLY_KIND_INVALID' }
$projectId = [string](Get-PropertyValue $plan 'projectId' '')
if ($projectId -ne $ExpectedProjectId) { throw ('V017_DOWNLOAD_APPLY_PROJECT_MISMATCH actual=' + $projectId) }
if ([int](Get-PropertyValue $plan 'conflictCount' -1) -ne 0) { throw 'V017_DOWNLOAD_APPLY_CONFLICTS_PRESENT' }
$localRoot = [string](Get-PropertyValue $plan 'localRoot' '')
if (-not $localRoot -or -not (Test-Path -LiteralPath $localRoot -PathType Container)) { throw 'V017_DOWNLOAD_APPLY_LOCAL_ROOT_INVALID' }

$operations = @(Get-PropertyValue $plan 'operations' @())
if ($operations.Count -ne $ExpectedDownloadCount) { throw ('V017_DOWNLOAD_APPLY_OPERATION_COUNT_MISMATCH expected=' + $ExpectedDownloadCount + ' actual=' + $operations.Count) }
foreach ($operation in $operations) {
  $kind = ([string](Get-PropertyValue $operation 'kind' '')).ToUpperInvariant()
  if ($kind -ne 'DOWNLOAD') { throw ('V017_DOWNLOAD_APPLY_NON_DOWNLOAD_OPERATION: ' + $kind) }
  $destinationPath = [string](Get-PropertyValue $operation 'destinationPath' '')
  if (-not $destinationPath) { throw 'V017_DOWNLOAD_APPLY_DESTINATION_REQUIRED' }
  if (Test-Path -LiteralPath $destinationPath -PathType Leaf) { throw ('V017_DOWNLOAD_APPLY_TARGET_ALREADY_EXISTS: ' + $destinationPath) }
  $sha = ([string](Get-PropertyValue $operation 'sha256' '')).ToLowerInvariant()
  if ($sha -notmatch '^[0-9a-f]{64}$') { throw 'V017_DOWNLOAD_APPLY_EXPECTED_SHA_REQUIRED' }
}

$mainScript = Join-Path $PSScriptRoot 'dimpro-drive-desktop-manual-sync-v017.ps1'
if (-not (Test-Path -LiteralPath $mainScript -PathType Leaf)) { throw 'V017_DOWNLOAD_APPLY_MAIN_SCRIPT_MISSING' }

if (-not $ResultRoot) { $ResultRoot = Join-Path ([IO.Path]::GetTempPath()) 'DIMPRO-Drive-V017-Download-Apply-Acceptance' }
if (-not (Test-Path -LiteralPath $ResultRoot -PathType Container)) { New-Item -ItemType Directory -Path $ResultRoot -Force | Out-Null }
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$resultPath = Join-Path $ResultRoot ('apply-result-' + $stamp + '.json')
$machine = [string]$env:COMPUTERNAME
if (-not $machine -or -not $machine.Trim()) { $machine = 'windows' }
$acceptanceClientId = ('drive-desktop-v017-download-acceptance-' + $machine.Trim().ToLowerInvariant())

& $mainScript `
  -Mode Apply `
  -AuthMode Bridge `
  -ServerUrl $ServerUrl `
  -ProjectId $ExpectedProjectId `
  -ClientId $acceptanceClientId `
  -ApplyPlanPath $PlanPath `
  -ReviewedPlanSha256 $expectedHash `
  -EnableApply `
  -AllowServerMutation `
  -AllowLocalMutation `
  -OutputPath $resultPath | Out-Null

if (-not (Test-Path -LiteralPath $resultPath -PathType Leaf)) { throw 'V017_DOWNLOAD_APPLY_RESULT_MISSING' }
$result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
if (-not [bool](Get-PropertyValue $result 'ok' $false) -or [string](Get-PropertyValue $result 'mode' '') -ne 'Apply') { throw 'V017_DOWNLOAD_APPLY_RESULT_INVALID' }
if ([string](Get-PropertyValue $result 'reviewedPlanSha256' '') -ne $expectedHash) { throw 'V017_DOWNLOAD_APPLY_RESULT_SHA_MISMATCH' }
if ([int](Get-PropertyValue $result 'operationCount' -1) -ne $ExpectedDownloadCount) { throw 'V017_DOWNLOAD_APPLY_RESULT_COUNT_MISMATCH' }

$resultOperations = @(Get-PropertyValue $result 'operations' @())
if ($resultOperations.Count -ne $ExpectedDownloadCount) { throw 'V017_DOWNLOAD_APPLY_RESULT_OPERATIONS_MISMATCH' }
$planByDestination = @{}
foreach ($operation in $operations) {
  $destination = [IO.Path]::GetFullPath([string](Get-PropertyValue $operation 'destinationPath' ''))
  $planByDestination[$destination.ToLowerInvariant()] = $operation
}
foreach ($downloadResult in $resultOperations) {
  if ([string](Get-PropertyValue $downloadResult 'kind' '') -ne 'DOWNLOAD') { throw 'V017_DOWNLOAD_APPLY_RESULT_NON_DOWNLOAD' }
  $destination = [IO.Path]::GetFullPath([string](Get-PropertyValue $downloadResult 'destinationPath' ''))
  if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) { throw ('V017_DOWNLOAD_APPLY_FILE_MISSING: ' + $destination) }
  $key = $destination.ToLowerInvariant()
  if (-not $planByDestination.ContainsKey($key)) { throw ('V017_DOWNLOAD_APPLY_UNPLANNED_RESULT: ' + $destination) }
  $planned = $planByDestination[$key]
  $expectedSha = ([string](Get-PropertyValue $planned 'sha256' '')).ToLowerInvariant()
  $actualSha = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualSha -ne $expectedSha) { throw ('V017_DOWNLOAD_APPLY_FILE_SHA_MISMATCH: ' + $destination) }
}

$cursor = Get-PropertyValue $result 'cursor' $null
if ($null -eq $cursor -or -not [bool](Get-PropertyValue $cursor 'ok' $false)) { throw 'V017_DOWNLOAD_APPLY_CURSOR_SAVE_FAILED' }

$summary = [ordered]@{
  ok = $true
  code = 'DIMPRO_DRIVE_DESKTOP_V017_DOWNLOAD_APPLY_ACCEPTANCE_PASS'
  projectId = $ExpectedProjectId
  clientId = $acceptanceClientId
  reviewedPlanSha256 = $expectedHash
  localRoot = $localRoot
  resultPath = $resultPath
  downloadCount = $ExpectedDownloadCount
  cursorSaved = $true
  serverMutation = 'ACCEPTANCE_CURSOR_ONLY'
  documentMutation = $false
  localMutation = $true
  delete = $false
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$summary | ConvertTo-Json -Depth 8
Write-Host 'DIMPRO_DRIVE_DESKTOP_V017_DOWNLOAD_APPLY_ACCEPTANCE_PASS'
