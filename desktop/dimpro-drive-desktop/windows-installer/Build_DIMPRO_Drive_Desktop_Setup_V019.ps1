param(
  [string]$OutputDirectory = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$source = Join-Path $PSScriptRoot 'Program.cs'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$handler = Join-Path $repoRoot 'scripts\dimpro-drive-desktop-open-handler-v019.ps1'
$output = Join-Path $OutputDirectory 'DIMPRO_Drive_Desktop_Setup_V019.exe'

$candidates = @(
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$csc = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $csc) { throw 'A .NET Framework C# fordító (csc.exe) nem található.' }
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Program.cs hiányzik.' }
if (-not (Test-Path -LiteralPath $handler -PathType Leaf)) { throw 'A V0.1.9 handler hiányzik.' }

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Force }

& $csc `
  /nologo `
  /target:winexe `
  /platform:anycpu `
  /optimize+ `
  /reference:System.dll `
  /reference:System.Core.dll `
  /reference:System.Drawing.dll `
  /reference:System.Windows.Forms.dll `
  /reference:System.Web.Extensions.dll `
  /resource:"$handler,DIMPRO.DriveDesktop.Handler.ps1" `
  /out:"$output" `
  "$source"

if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output -PathType Leaf)) {
  throw 'A DIMPRO Drive Desktop EXE build sikertelen.'
}

$hash = Get-FileHash -LiteralPath $output -Algorithm SHA256
[pscustomobject][ordered]@{
  ok = $true
  code = 'DIMPRO_DRIVE_DESKTOP_V019_SETUP_EXE_BUILD_PASS'
  output = $output
  sha256 = $hash.Hash.ToLowerInvariant()
  bytes = (Get-Item -LiteralPath $output).Length
  compiler = $csc
  productionAccess = 'DENY'
} | ConvertTo-Json -Depth 4
