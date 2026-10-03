# DIMPRO AUTH V0.3 – Meghívásos hozzáférés és Drive scope

Állapot: DEV ONLY · PROD DENY

## Alapelv

A központi DIMPRO AUTH nem nyitott regisztráció. Ismeretlen e-mail-címhez a rendszer nem küld OTP-t és nem hoz létre automatikus felhasználót. Új külső felhasználó csak admin/projektmeghívásból kerülhet az `auth_users` állományba.

A hitelesítés és a jogosultság két külön lépés:

1. DIMPRO identity + OTP igazolja, hogy ki a felhasználó.
2. `auth_access_grants` mondja meg, hogy mit láthat és használhat.

## Drive jogosultsági scope-ok

- `drive.access`: beléphet a Drive alkalmazásba.
- `drive.personal.access`: van saját személyes DIMPRO Drive területe; a grant nem tartalmaz `project_id`-t.
- `drive.project.access`: csak az explicit `project_id` projekthez fér hozzá.
- `project.members.invite`: az adott projekten belül küldhet/vonhat vissza meghívást.

Szerepkörök:

- `DRIVE_PERSONAL_USER`: `drive.access` + `drive.personal.access`.
- `DRIVE_PROJECT_MEMBER`: `drive.access` + `drive.project.access`.
- `DRIVE_PROJECT_MANAGER`: `drive.access` + `drive.project.access` + `project.members.invite`.

Projektmeghívás nem ad személyes Drive tárhelyet. Személyes Drive jogosultság nem ad automatikusan hozzáférést idegen projektekhez.

## Meghívási folyamat

1. Jogosult projektmenedzser megadja a meghívott e-mail-címét és a projektet.
2. Ha az identity még nem létezik, az AUTH létrehoz egy `SIMPLE`, `ACTIVE` felhasználót, de projektjogot még nem ad.
3. Az `auth_invitations` rekord csak HMAC/hash formájú tokenazonosítót tárol; a nyers token csak a meghívólinkben létezik.
4. A meghívó e-mail a központi `noreply@dimpro.hu` profilról megy ki.
5. A link megnyitása önmagában nem fogadja el a meghívást; külön POST művelet szükséges, így e-mail scanner nem tudja automatikusan elfogadni.
6. Elfogadáskor pontosan az invitation product/project/role scope-jának megfelelő `auth_access_grant` jön létre.
7. A grant változás a `session_version` mechanizmuson keresztül a régi sessionöket érvényteleníti.
8. Elfogadás után a felhasználó a központi AUTH → SSO útvonalon kerül vissza a Drive-ba.

## Biztonsági szabályok

- Meghívó max. 30 napos, alapértelmezés 7 nap.
- Ugyanarra az e-mail/product/project/role kombinációra egyszerre egy PENDING meghívó lehet.
- Új meghívó az előző függő meghívót visszavonja.
- `SUSPENDED` vagy `DISABLED` felhasználó meghívással nem aktiválható újra. Az új, még el nem fogadott meghívotti identity `ACTIVE + login_enabled=false`, ezért OTP-t még nem kaphat; elfogadáskor válik belépésre jogosulttá.
- Runtime DB role közvetlenül nem kap INSERT/UPDATE jogosultságot a grants/invitations táblákra; módosítás csak szűk `SECURITY DEFINER` függvényeken keresztül történhet.
- `DIMPRO_AUTH_INVITATION_PEPPER` külön secret az OTP/session/audit/SSO secretektől.
- Minden meghívás, elfogadás, visszavonás és e-mail delivery auditálható.

## DEV admin személyes Drive

A DEV admin script külön műveleteket kap:

- `grant-personal-drive`
- `revoke-personal-drive`

Ez szándékosan külön van a projektmeghívástól.

## Tesztállapot

- AUTH V0.2.1 security contract: 56/56 PASS.
- AUTH V0.3 invitation contract: 25/25 PASS.
- Isolated AUTH TypeScript gate: PASS.
- Targeted ESLint: PASS.
- Migration 005 SQL transaction/ROLLBACK validation: PASS.

Következő DEV aktiválási lépés: migration 005 backup utáni APPLY, runtime invitation secret telepítése, majd Drive-integrációs project-scope enforcement és meghívás E2E.

## Projekt-hozzáférés visszavonása

- A `auth_revoke_project_access` pontos user + project + DRIVE scope szerint vonja vissza az aktív grantokat.
- A meglévő `auth_access_grants_session_version` trigger a visszavonással azonnal növeli a célfelhasználó session verzióját, így a régi központi és Drive session a következő ellenőrzéskor érvénytelenné válik.
- A személyes Drive grantot projekt-hozzáférés visszavonása nem érinti.
