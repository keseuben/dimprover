param(
  [string]$ServerUrl = 'https://drive.dev.dimpro.hu',
  [string]$ProjectId = 'd6-irodaepulet',
  [string]$WorkRoot = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $WorkRoot) {
  $WorkRoot = Join-Path ([IO.Path]::GetTempPath()) 'DIMPRO-Drive-V017-Plan-Acceptance'
}
if (-not (Test-Path -LiteralPath $WorkRoot -PathType Container)) {
  New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null
}
$localRoot = Join-Path $WorkRoot 'empty-local-root'
if (-not (Test-Path -LiteralPath $localRoot -PathType Container)) {
  New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
}

# Fail closed if the acceptance root is not actually empty apart from ignored .dimpro-drive metadata.
$unexpected = @(Get-ChildItem -LiteralPath $localRoot -Force | Where-Object { $_.Name -ne '.dimpro-drive' })
if ($unexpected.Count -gt 0) { throw 'V017_PLAN_ACCEPTANCE_LOCAL_ROOT_NOT_EMPTY' }

$mainScript = Join-Path $PSScriptRoot 'dimpro-drive-desktop-manual-sync-v017.ps1'
if (-not (Test-Path -LiteralPath $mainScript -PathType Leaf)) { throw 'V017_PLAN_ACCEPTANCE_MAIN_SCRIPT_MISSING' }

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$reportPath = Join-Path $WorkRoot ('plan-report-' + $stamp + '.json')
$applyPlanPath = Join-Path $WorkRoot ('prepared-apply-plan-' + $stamp + '.json')

& $mainScript `
  -Mode Plan `
  -AuthMode Bridge `
  -ServerUrl $ServerUrl `
  -ProjectId $ProjectId `
  -LocalRoot $localRoot `
  -Cursor 0 `
  -OutputPath $reportPath `
  -PreparedApplyPlanPath $applyPlanPath | Out-Null

if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) { throw 'V017_PLAN_ACCEPTANCE_REPORT_MISSING' }
$report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
if (-not $report.ok -or [string]$report.mode -ne 'Plan' -or [string]$report.version -ne '0.1.7') { throw 'V017_PLAN_ACCEPTANCE_REPORT_INVALID' }
if ([bool]$report.safety.serverMutation) { throw 'V017_PLAN_ACCEPTANCE_SERVER_MUTATION_DETECTED' }
if ([bool]$report.safety.syncDataMutation) { throw 'V017_PLAN_ACCEPTANCE_SYNC_DATA_MUTATION_DETECTED' }
if ([bool]$report.safety.delete) { throw 'V017_PLAN_ACCEPTANCE_DELETE_DETECTED' }
if ([int]$report.summary.localFileCount -ne 0) { throw 'V017_PLAN_ACCEPTANCE_LOCAL_NOT_EMPTY' }
if ([int]$report.summary.uploadCount -ne 0) { throw 'V017_PLAN_ACCEPTANCE_UNEXPECTED_UPLOAD' }

$remoteCount = [int]$report.summary.remoteDocumentCount
$classified = [int]$report.summary.downloadCount + [int]$report.summary.conflictCount + [int]$report.summary.unchangedCount
if ($classified -ne $remoteCount) { throw ('V017_PLAN_ACCEPTANCE_CLASSIFICATION_MISMATCH remote=' + $remoteCount + ' classified=' + $classified) }

$blocked = [bool]$report.preparedApplyPlan.blocked
$conflictCount = [int]$report.summary.conflictCount
if ($conflictCount -gt 0) {
  if (-not $blocked) { throw 'V017_PLAN_ACCEPTANCE_CONFLICT_NOT_BLOCKED' }
  if (Test-Path -LiteralPath $applyPlanPath -PathType Leaf) { throw 'V017_PLAN_ACCEPTANCE_BLOCKED_PLAN_WAS_WRITTEN' }
} else {
  if ($blocked) { throw 'V017_PLAN_ACCEPTANCE_FALSE_BLOCK' }
  if (-not (Test-Path -LiteralPath $applyPlanPath -PathType Leaf)) { throw 'V017_PLAN_ACCEPTANCE_APPLY_PLAN_MISSING' }
  $actualSha = (Get-FileHash -LiteralPath $applyPlanPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualSha -ne ([string]$report.preparedApplyPlan.sha256).ToLowerInvariant()) { throw 'V017_PLAN_ACCEPTANCE_PLAN_SHA_MISMATCH' }
  $prepared = Get-Content -LiteralPath $applyPlanPath -Raw | ConvertFrom-Json
  if ([string]$prepared.planKind -ne 'DIMPRO_DRIVE_DESKTOP_MANUAL_SYNC_V017') { throw 'V017_PLAN_ACCEPTANCE_PLAN_KIND_INVALID' }
  if ([int]$prepared.conflictCount -ne 0) { throw 'V017_PLAN_ACCEPTANCE_PLAN_CONFLICT_COUNT_INVALID' }
}

$result = [ordered]@{
  ok = $true
  code = 'DIMPRO_DRIVE_DESKTOP_V017_PLAN_ACCEPTANCE_PASS'
  projectId = $ProjectId
  localRoot = $localRoot
  reportPath = $reportPath
  preparedApplyPlanPath = if (Test-Path -LiteralPath $applyPlanPath -PathType Leaf) { $applyPlanPath } else { '' }
  preparedApplyPlanSha256 = [string]$report.preparedApplyPlan.sha256
  remoteDocumentCount = $remoteCount
  downloadCount = [int]$report.summary.downloadCount
  conflictCount = $conflictCount
  unchangedCount = [int]$report.summary.unchangedCount
  nextCursor = [long]$report.nextCursor
  serverMutation = $false
  syncDataMutation = $false
  delete = $false
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$result | ConvertTo-Json -Depth 8
Write-Host 'DIMPRO_DRIVE_DESKTOP_V017_PLAN_ACCEPTANCE_PASS'
