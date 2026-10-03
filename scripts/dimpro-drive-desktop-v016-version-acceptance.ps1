param(
  [string]$ServerUrl = 'https://drive.dev.dimpro.hu',
  [string]$ProjectId = 'd6-irodaepulet',
  [string]$documentId = 'drive-document-cde50a0b770f',
  [int]$ExpectedCurrentVersion = 1,
  [string]$WorkRoot = '',
  [switch]$ConfirmDevMutation
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $ConfirmDevMutation) { throw 'V016_VERSION_ACCEPTANCE_CONFIRM_DEV_MUTATION_REQUIRED' }

try { $serverUri = [Uri]$ServerUrl }
catch { throw 'V016_VERSION_ACCEPTANCE_SERVER_URL_INVALID' }

if ($serverUri.Scheme -ne 'https' -or $serverUri.Host -ne 'drive.dev.dimpro.hu') {
  throw 'V016_VERSION_ACCEPTANCE_DEV_SERVER_REQUIRED'
}

if ($ExpectedCurrentVersion -lt 1) { throw 'V016_VERSION_ACCEPTANCE_EXPECTED_VERSION_INVALID' }

if (-not $WorkRoot) {
  $WorkRoot = Join-Path ([IO.Path]::GetTempPath()) 'DIMPRO-Drive-V016-Version-Acceptance'
}
if (-not (Test-Path -LiteralPath $WorkRoot -PathType Container)) {
  New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null
}

$mainScript = Join-Path $PSScriptRoot 'dimpro-drive-desktop-manual-sync-v016.ps1'
if (-not (Test-Path -LiteralPath $mainScript -PathType Leaf)) {
  throw 'V016_VERSION_ACCEPTANCE_MAIN_SCRIPT_MISSING'
}

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$nonce = [Guid]::NewGuid().ToString('N').Substring(0,12)
$fileName = 'DIMPRO_DESKTOP_V016_VERSION_ACCEPTANCE_' + $stamp + '_' + $nonce + '.txt'
$sourcePath = Join-Path $WorkRoot $fileName
$downloadPath = Join-Path $WorkRoot ('downloaded_' + $fileName)
$uploadPlanPath = Join-Path $WorkRoot ('version-upload-plan-' + $stamp + '-' + $nonce + '.json')
$uploadResultPath = Join-Path $WorkRoot ('version-upload-result-' + $stamp + '-' + $nonce + '.json')
$downloadPlanPath = Join-Path $WorkRoot ('version-download-plan-' + $stamp + '-' + $nonce + '.json')
$downloadResultPath = Join-Path $WorkRoot ('version-download-result-' + $stamp + '-' + $nonce + '.json')

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$content = @(
  'DIMPRO Drive Desktop V0.1.6 UPLOAD_VERSION Acceptance'
  'DEV ONLY - PROD DENY'
  'UTF-8 próba: Árvíztűrő tükörfúrógép – őűŐŰ'
  ('GeneratedAtUtc=' + (Get-Date).ToUniversalTime().ToString('o'))
  ('Nonce=' + $nonce)
  ('ProjectId=' + $ProjectId)
  ('DocumentId=' + $documentId)
  ('ExpectedCurrentVersion=' + $ExpectedCurrentVersion)
) -join [Environment]::NewLine
[IO.File]::WriteAllText($sourcePath, $content + [Environment]::NewLine, $utf8NoBom)
$sourceSha = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()

$changeNote = 'V0.1.6 UTF-8 ellenőrzés – Árvíztűrő tükörfúrógép, őűŐŰ'
$uploadPlan = [ordered]@{
  schemaVersion = 1
  projectId = $ProjectId
  operations = @(
    [ordered]@{
      kind = 'UPLOAD_VERSION'
      localPath = $sourcePath
      documentId = $DocumentId
      expectedCurrentVersion = $ExpectedCurrentVersion
      mimeType = 'text/plain'
      revisionCode = 'Rev. 1'
      changeNote = $changeNote
    }
  )
}
$uploadPlan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $uploadPlanPath -Encoding UTF8

&mainScript `
  -Mode Apply `
  -AuthMode Bridge `
  -ServerUrl $ServerUrl `
  -EnableApply `
  -AllowServerMutation `
  -AllowLocalMutation `
  -ApplyPlanPath $uploadPlanPath `
  -OutputPath $uploadResultPath | Out-Null

if (-not (Test-Path -LiteralPath $uploadResultPath -PathType Leaf)) {
  throw 'V016_VERSION_ACCEPTANCE_UPLOAD_RESULT_MISSING'
}
$uploadResult = Get-Content -LiteralPath $uploadResultPath -Raw | ConvertFrom-Json
if (-not $uploadResult.ok -or [int]$uploadResult.operationCount -ne 1) {
  throw 'V016_VERSION_ACCEPTANCE_UPLOAD_FAILED'
}
$uploadOp = @($uploadResult.operations)[0]
if (-not $uploadOp.ok) { throw 'V016_VERSION_ACCEPTANCE_UPLOAD_OPERATION_FAILED' }

$returnedDocumentId = [string]$uploadOp.documentId
$versionId = [string]$uploadOp.versionId
$serverSha = [string]$uploadOp.sha256
if ($returnedDocumentId -ne $DocumentId) { throw 'V016_VERSION_ACCEPTANCE_DOCUMENT_ID_MISMATCH' }
if (-not $versionId) { throw 'V016_VERSION_ACCEPTANCE_VERSION_ID_MISSING' }
if ($serverSha.ToLowerInvariant() -ne $sourceSha) { throw 'V016_VERSION_ACCEPTANCE_UPLOAD_SHA_MISMATCH' }

$downloadPlan = [ordered]@{
  schemaVersion = 1
  projectId = $ProjectId
  operations = @(
    [ordered]@{
      kind = 'DOWNLOAD'
      documentId = $DocumentId
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
  throw 'V016_VERSION_ACCEPTANCE_DOWNLOAD_RESULT_MISSING'
}
$downloadResult = Get-Content -LiteralPath $downloadResultPath -Raw | ConvertFrom-Json
if (-not $downloadResult.ok -or [int]$downloadResult.operationCount -ne 1) {
  throw 'V016_VERSION_ACCEPTANCE_DOWNLOAD_FAILED'
}
$downloadOp = @($downloadResult.operations)[0]
if (-not $downloadOp.ok) { throw 'V016_VERSION_ACCEPTANCE_DOWNLOAD_OPERATION_FAILED' }
if ([string]$downloadOp.versionId -ne $versionId) { throw 'V016_VERSION_ACCEPTANCE_DOWNLOAD_VERSION_MISMATCH' }

$downloadSha = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($downloadSha -ne $sourceSha) { throw 'V016_VERSION_ACCEPTANCE_DOWNLOAD_SHA_MISMATCH' }

$result = [ordered]@{
  ok = $true
  code = 'DIMPRO_DRIVE_DESKTOP_V016_VERSION_ACCEPTANCE_PASS'
  projectId = $ProjectId
  documentId = $DocumentId
  previousVersionNumber = $ExpectedCurrentVersion
  expectedNewVersionNumber = ($ExpectedCurrentVersion + 1)
  versionId = $versionId
  changeNote = $changeNote
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
Write-Host 'DIMPRO_DRIVE_DESKTOP_V016_VERSION_ACCEPTANCE_PASS'
