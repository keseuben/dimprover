import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (file) => readFile(file, "utf8");
const [migration, admin, invitations, security, authz, requestOtp, verifyOtp, proxy, licensePage, memberUi, inviteUi] = await Promise.all([
  read("supabase/migrations/20260810063500_dimpro_org_license_seats_invites_v020.sql"),
  read("app/lib/identity-core/admin.ts"),
  read("app/lib/identity-core/invitations.ts"),
  read("app/lib/identity-core/security.ts"),
  read("app/lib/dimpro/login-authorization.ts"),
  read("app/api/dimpro-auth/request-otp/route.ts"),
  read("app/api/dimpro-auth/verify-otp/route.ts"),
  read("proxy.ts"),
  read("app/admin/licenckozpont/page.tsx"),
  read("components/license/OrganizationLicenseMembers.tsx"),
  read("components/license/OrganizationInvitationClient.tsx"),
]);
const checks=[];
function has(text,value,label){assert.ok(text.includes(value),`${label}: hiányzik: ${value}`);checks.push(label)}
has(migration,"max_users integer not null default 1","külön felhasználói keret");
has(migration,"legacy_license_ref text null","legacy licenchivatkozás");
has(migration,"create table if not exists public.dimpro_membership_modules","tagsági modulok");
has(migration,"create table if not exists public.dimpro_organization_invitations","szervezeti meghívások");
has(migration,"token_hash text not null","csak token hash tárolás");
assert.doesNotMatch(migration,/\braw_token\b/i,"Nyers meghívótoken oszlop nem tárolható.");checks.push("nincs nyers token oszlop");
has(migration,"grant execute on function public.dimpro_normalize_email(text) to service_role","backend constraint jogosultság");
has(migration,"'0.2.0'","Identity 0.2.0 marker");
has(security,"createDimproOrganizationInvitationToken","biztonságos meghívótoken");
has(invitations,"DIMPRO_ORGANIZATION_USER_SEAT_LIMIT_REACHED","seat limit szerveroldali kapu");
has(invitations,"DIMPRO_MEMBERSHIP_MODULE_NOT_LICENSED","felhasználói modul subset kapu");
has(admin,"DIMPRO_LICENSE_USER_SEAT_LIMIT_BELOW_USAGE","keretcsökkentés védelem");
has(admin,"DIMPRO_MEMBERSHIP_DROP_SEND_NOT_ALLOWED","Send felhasználói modulvédelem");
has(authz,"identity_organization_license","központi org-licenc belépés");
has(requestOtp,"resolveDimproLoginAuthorization","OTP kérés központi jogosultság");
has(requestOtp,'shouldCreateUser: authorization.source !== "legacy_allowlist"',"meghívott auth user bootstrap");
has(verifyOtp,"linkDimproAuthUser","OTP után auth link");
has(proxy,"resolveDimproLoginAuthorization","proxy központi jogosultság");
has(proxy,"isDimproInvitationPage","publikus meghívóoldal");
has(licensePage,"Max. felhasználó","Licencközpont user seat UI");
has(licensePage,"Max. eszköz","Licencközpont device UI");
has(memberUi,"Felhasználó meghívása","szervezeti meghívás UI");
has(memberUi,"Egyszer megjelenő meghívólink","egyszeri link UX");
has(inviteUi,"Meghívás elfogadása","publikus elfogadó UX");
console.log(JSON.stringify({ok:true,contract:"DIMPRO Identity organization license V020",checks:checks.length},null,2));
