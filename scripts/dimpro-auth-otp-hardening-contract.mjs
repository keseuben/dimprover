import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  request: 'app/api/dimpro-auth/request-otp/route.ts',
  verify: 'app/api/dimpro-auth/verify-otp/route.ts',
  appLogin: 'app/login/DimproAppOtpLogin.tsx',
  legacyLogin: 'app/login/DimproverOtpLogin.tsx',
};
const text = {};
for (const [k,f] of Object.entries(files)) text[k] = await readFile(f,'utf8');

assert.match(text.request, /isDimproEmailAllowed\(email\)/, 'OTP request must enforce server-side allowlist.');
assert.match(text.request, /shouldCreateUser:\s*false/, 'OTP request must never auto-create Supabase users.');
assert.match(text.verify, /isDimproEmailAllowed\(email\)/, 'OTP verify must enforce server-side allowlist.');
assert.match(text.verify, /isDimproEmailAllowed\(data\.user\.email\)/, 'Verified Supabase identity must be re-authorized.');
assert.match(text.appLogin, /fetch\("\/api\/dimpro-auth\/request-otp"/, 'DIMPRO login must use guarded server OTP endpoint.');
assert.match(text.appLogin, /fetch\("\/api\/dimpro-auth\/verify-otp"/, 'DIMPRO login must use guarded server verify endpoint.');
assert.match(text.legacyLogin, /fetch\("\/api\/dimpro-auth\/request-otp"/, 'DIMPROVER login fallback must use guarded server OTP endpoint.');
assert.match(text.legacyLogin, /fetch\("\/api\/dimpro-auth\/verify-otp"/, 'DIMPROVER login fallback must use guarded server verify endpoint.');
assert.doesNotMatch(text.legacyLogin, /auth\.signInWithOtp/, 'Fallback login may not bypass guarded server endpoint.');
assert.doesNotMatch(text.legacyLogin, /auth\.verifyOtp/, 'Fallback login may not bypass guarded server verification.');

console.log(JSON.stringify({ok:true, contract:'DIMPRO OTP hardening', checks:10}, null, 2));
