import fs from 'node:fs';
const token = fs.readFileSync(new URL('../app/lib/drive/desktopAccessToken.ts', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../app/api/drive/desktop-access/token/route.ts', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../app/lib/drive/driveApi.ts', import.meta.url), 'utf8');
const checks = [
  ['token prefix', /TOKEN_PREFIX = "dpat1"/.test(token)],
  ['HMAC SHA256', /createHmac\("sha256"/.test(token)],
  ['short TTL max 900', /MAX_TTL_SECONDS = 900/.test(token)],
  ['secret min/max length', /secret\.length < 32 \|\| secret\.length > 256/.test(token)],
  ['secret file fallback', /DEFAULT_SECRET_FILE/.test(token) && /readFileSync/.test(token)],
  ['timing safe compare', /timingSafeEqual/.test(token)],
  ['expiry validation', /claims\.exp <= now/.test(token)],
  ['bridge auth exchange', /authenticateWindowsBridgeDevice/.test(route)],
  ['no-store response', /cache-control/.test(route)],
  ['desktop access auth mode', /"desktop-access"/.test(api)],
  ['bearer access verification', /verifyDriveDesktopAccessToken/.test(api)],
  ['client binding', /requestedClientId !== claims\.clientId/.test(api)],
];
let pass=0;
for (const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${String(pass+1).padStart(2,'0')} ${name}`); if(ok) pass++; else process.exitCode=1;}
if(pass!==checks.length) throw new Error(`V0.1.3 contract failed ${pass}/${checks.length}`);
console.log(`DIMPRO Drive Desktop access V0.1.3 contract PASS ${pass}/${checks.length}`);
