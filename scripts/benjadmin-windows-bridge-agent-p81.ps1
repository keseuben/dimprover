param(
  [ValidateSet('Pair','Heartbeat','Once')][string]$Mode = 'Heartbeat',
  [string]$ServerUrl = 'https://admin.dev.dimpro.hu',
  [string]$PairingId = '',
  [string]$PairingCode = '',
  [int]$HeartbeatSeconds = 30
)
$ErrorActionPreference = 'Stop'
if (-not $ServerUrl.StartsWith('https://')) { throw 'A Windows Bridge agent kizárólag HTTPS szerver URL-lel indulhat.' }
$Root = Join-Path $env:LOCALAPPDATA 'DIMPRO\BenjAdminBridge'
$IdentityPath = Join-Path $Root 'identity.json'
$TokenPath = Join-Path $Root 'device-token.dpapi'
New-Item -ItemType Directory -Force -Path $Root | Out-Null

function Get-Identity {
  if (Test-Path $IdentityPath) { return Get-Content $IdentityPath -Raw | ConvertFrom-Json }
  $identity = [ordered]@{ agentId = "win-agent-$([guid]::NewGuid().ToString('N'))"; deviceId = ''; sessionId = ''; serverUrl = $ServerUrl }
  $identity | ConvertTo-Json | Set-Content -Path $IdentityPath -Encoding UTF8
  return [pscustomobject]$identity
}
function Save-Identity($Identity) { $Identity | ConvertTo-Json | Set-Content -Path $IdentityPath -Encoding UTF8 }
function Protect-Token([string]$Token) {
  $bytes=[Text.Encoding]::UTF8.GetBytes($Token)
  $protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Convert]::ToBase64String($protected) | Set-Content -Path $TokenPath -Encoding ASCII
}
function Unprotect-Token {
  if (-not (Test-Path $TokenPath)) { throw 'Nincs párosított Windows Bridge device token.' }
  $protected=[Convert]::FromBase64String((Get-Content $TokenPath -Raw).Trim())
  $bytes=[Security.Cryptography.ProtectedData]::Unprotect($protected,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  return [Text.Encoding]::UTF8.GetString($bytes)
}
function Json-Post([string]$Path,$Body,[hashtable]$Headers=@{}) {
  return Invoke-RestMethod -Method Post -Uri ($ServerUrl.TrimEnd('/')+$Path) -Headers $Headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 8 -Compress)
}
$identity=Get-Identity

if ($Mode -eq 'Pair') {
  if (-not $PairingId -or -not $PairingCode) { throw 'Pair módban PairingId és PairingCode szükséges.' }
  $hello=[ordered]@{ protocolVersion=1; agentId=$identity.agentId; deviceLabel=$env:COMPUTERNAME; osVersion=[Environment]::OSVersion.VersionString; powershellVersion=$PSVersionTable.PSVersion.ToString(); capabilities=@('powershell','terminal-reconnect','raw-sanitized-audit'); nonce=[guid]::NewGuid().ToString('N'); sentAt=(Get-Date).ToUniversalTime().ToString('o') }
  $claim=Json-Post '/api/dev/terminal-hub/windows-bridge/claim' ([ordered]@{pairingId=$PairingId;code=$PairingCode;hello=$hello})
  $claimToken=$claim.claim.claimToken
  $deadline=[DateTime]::Parse($claim.claim.expiresAt).ToUniversalTime()
  Write-Host 'Pairing igény elküldve. Jóváhagyásra vár a BENJADMIN Konzolban.'
  while ((Get-Date).ToUniversalTime() -lt $deadline) {
    Start-Sleep -Seconds 3
    try {
      $status=Invoke-RestMethod -Method Get -Uri ($ServerUrl.TrimEnd('/')+"/api/dev/terminal-hub/windows-bridge/claim/status?pairingId=$PairingId") -Headers @{Authorization="Bearer $claimToken"}
      if ($status.claim.status -eq 'active') {
        Protect-Token $status.claim.deviceToken
        $identity.deviceId=$status.claim.deviceId; $identity.sessionId=$status.claim.sessionId; $identity.serverUrl=$ServerUrl; Save-Identity $identity
        Write-Host 'Windows Bridge pairing kész. A device token DPAPI-védelemmel mentve.'
        exit 0
      }
    } catch { if ($_.Exception.Response.StatusCode.value__ -notin @(409)) { throw } }
  }
  throw 'A pairing jóváhagyási időablaka lejárt.'
}

$token=Unprotect-Token
if (-not $identity.sessionId) { throw 'Nincs aktív Windows Bridge session az identity fájlban.' }
do {
  $heartbeat=[ordered]@{protocolVersion=1;agentId=$identity.agentId;sessionId=$identity.sessionId;sentAt=(Get-Date).ToUniversalTime().ToString('o')}
  $response=Json-Post '/api/dev/terminal-hub/windows-bridge/heartbeat' $heartbeat @{Authorization="Bearer $token"}
  if ($response.commands -and $response.commands.Count -gt 0) { throw 'P8.1 biztonsági sértés: a heartbeat végrehajtandó parancsot adott vissza.' }
  if ($Mode -eq 'Once') { Write-Host "Heartbeat OK: $($response.serverTime)"; break }
  Start-Sleep -Seconds ([Math]::Max(15,[Math]::Min(120,$HeartbeatSeconds)))
} while ($true)
