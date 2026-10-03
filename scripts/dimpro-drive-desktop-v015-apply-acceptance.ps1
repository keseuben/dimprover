param(
  [string]$ServerUrl = 'https://drive.dev.dimpro.hu',
  [string]$ProjectId = 'd6-irodaepulet',
  [string]$FolderId = 'drive-folder-03148ec117a64388d88a',
  [string]$WorkRoot = '',
  [switch]$ConfirmDevMutation
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $ConfirmDevMutation) { throw 'V015_APPLY_ACCEPTANCE_CONFIRM_DEV_MUTATION_REQUIRED' }

try { $serverUri = [Uri]$ServerUrl }
catch { throw 'V015_APPLY_ACCEPTANCE_SERVER_URL_INVALID' }

if ($serverUri.Scheme -ne 'https' -or $serverUri.Host -ne 'drive.dev.dimpro.hu') {
  throw 'V015_APPLY_ACCEPTANCE_DEV_SERVER_REQUIRED'
}

if (-not $WorkRoot) {
  $baseTemp = [IO.Path]::GetTempPath()
  $WorkRoot = Join-Path $baseTemp 'DIMPRO-Drive-V015-Apply-Acceptance'
}
if (-not (Test-Path -LiteralPath $WorkRoot -PathType Container)) {
  New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null
}

$mainScript = Join-Path $PSScriptRoot 'dimpro-drive-desktop-manual-sync-v015.ps1'
if (-not (Test-Path -LiteralPath $mainScript -PathType Leaf)) {
  throw 'V015_APPLY_ACCEPTANCE_MAIN_SCRIPT_MISSING'
}

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$nonce = [Guid]::NewGuid().ToString('N').Substring(0,12)
$fileName = 'DIMPRO_DESKTOP_V015_APPLY_ACCEPTANCE_' + $stamp + '_' + $nonce + '.txt'
$sourcePath = Join-Path $WorkRoot $fileName
$downloadPath = Join-Path $WorkRoot ('downloaded_' + $fileName)
$uploadPlanPath = Join-Path $WorkRoot ('upload-plan-' + $stamp + '-' + $nonce + '.json')
$uploadResultPath = Join-Path $WorkRoot ('upload-result-' + $stamp + '-' + $nonce + '.json')
$downloadPlanPath = Join-Path $WorkRoot ('download-plan-' + $stamp + '-' + $nonce + '.json')
$downloadResultPath = Join-Path $WorkRoot ('download-result-' + $stamp + '-' + $nonce + '.json')

$content = @(
  'DIMPRO Drive Desktop V0.1.5 Apply Acceptance'
  'DEV ONLY - PROD DENY'
  ('GeneratedAtUtc=' + (Get-Date).ToUniversalTime().ToString('o'))
  ('Nonce=' + $nonce)
  ('ProjectId=' + $ProjectId)
  ('FolderId=' + $FolderId)
) -join [Environment]::NewLine
[IO.File]::WriteAllText($sourcePath, $content + [Environment]::NewLine, [Text.Encoding]::UTF8)
$sourceSha = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()

$uploadPlan = [ordered]@{
  schemaVersion = 1
  projectId = $ProjectId
  operations = @(
    [ordered]@{
      kind = 'UPLOAD_NEW'
      localPath = $sourcePath
      folderId = $FolderId
      documentName = $fileName
      mimeType = 'text/plain'
      revisionCode = 'Rev. 0'
      changeNote = 'DIMPRO Drive Desktop V0.1.5 controlled DEV Apply acceptance'
      description = 'Automatikus DEV acceptance tesztfájl. Szerveroldali törlés nem történik.'
    }
  )
}
$uploadPlan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $uploadPlanPath -Encoding UTF8

& $mainScript `
  -Mode Apply `
  -AuthMode Bridge `
  -ServerUrl $ServerUrl `
  -EnableApply `
  -AllowServerMutation `
  -AllowLocalMutation `
  -ApplyPlanPath $uploadPlanPath `
  -OutputPath $uploadResultPath | Out-Null

if (-not (Test-Path -LiteralPath $uploadResultPath -PathType Leaf)) {
  throw 'V015_APPLY_ACCEPTANCE_UPLOAD_RESULT_MISSING'
}
$uploadResult = Get-Content -LiteralPath $uploadResultPath -Raw | ConvertFrom-Json
if (-not $uploadResult.ok -or [int]$uploadResult.operationCount -ne 1) {
  throw 'V015_APPLY_ACCEPTANCE_UPLOAD_FAILED'
}
$uploadOp = @($uploadResult.operations)[0]
if (-not $uploadOp.ok) { throw 'V015_APPLY_ACCEPTANCE_UPLOAD_OPERATION_FAILED' }
$documentId = [string]$uploadOp.documentId
$versionId = [string]$uploadOp.versionId
$serverSha = [string]$uploadOp.sha256
if (-not $documentId -or -not $versionId) { throw 'V015_APPLY_ACCEPTANCE_UPLOAD_IDS_MISSING' }
if ($serverSha.ToLowerInvariant() -ne $sourceSha) { throw 'V015_APPLY_ACCEPTANCE_UPLOAD_SHA_MISMATCH' }

$downloadPlan = [ordered]@{
  schemaVersion = 1
  projectId = $ProjectId
  operations = @(
    [ordered]@{
      kind = 'DOWNLOAD'
      documentId = $documentId
      versionId = $versionId
      destinationPath = $downloadPath
      sha256 = $sourceSha
    }
  )
}
$downloadPlan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $downloadPlanPath -Encoding UTF8

& $mainScript `
  -Mode Apply `
  -AuthMode Bridge `
  -ServerUrl $ServerUrl `
  -EnableApply `
  -AllowServerMutation `
  -AllowLocalMutation `
  -ApplyPlanPath $downloadPlanPath `
  -OutputPath $downloadResultPath | Out-Null

if (-not (Test-Path -LiteralPath $downloadResultPath -PathType Leaf)) {
  throw 'V015_APPLY_ACCEPTANCE_DOWNLOAD_RESULT_MISSING'
}
$downloadResult = Get-Content -LiteralPath $downloadResultPath -Raw | ConvertFrom-Json
if (-not $downloadResult.ok -or [int]$downloadResult.operationCount -ne 1) {
  throw 'V015_APPLY_ACCEPTANCE_DOWNLOAD_FAILED'
}
$downloadOp = @($downloadResult.operations)[0]
if (-not $downloadOp.ok) { throw 'V015_APPLY_ACCEPTANCE_DOWNLOAD_OPERATION_FAILED' }

$downloadSha = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($downloadSha -ne $sourceSha) { throw 'V015_APPLY_ACCEPTANCE_DOWNLOAD_SHA_MISMATCH' }

$result = [ordered]@{
  ok = $true
  code = 'DIMPRO_DRIVE_DESKTOP_V015_APPLY_ACCEPTANCE_PASS'
  projectId = $ProjectId
  folderId = $FolderId
  documentId = $documentId
  versionId = $versionId
  sourcePath = $sourcePath
  downloadPath = $downloadPath
  sourceSha256 = $sourceSha
  downloadSha256 = $downloadSha
  serverMutation = $true
  localMutation = $true
  delete = $false
  serverUrl = $ServerUrl
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$result | ConvertTo-Json -Depth 8
Write-Host 'DIMPRO_DRIVE_DESKTOP_V015_APPLY_ACCEPTANCE_PASS'
