# DIMPRO AUTH migration proposals

A `007_auth_v035_project_member_admin.superseded.sql` a korábbi V0.3.5 szerepkör-kezelési migrációs terv megőrzött, **nem aktív** változata.

2026-10-04-től a DIMPRO Drive V0.9.13 a publikus AUTH V0.3.7 által már biztosított `auth_revoke_project_access`, `auth_invite_project_member` és `auth_accept_project_invitation` SECURITY DEFINER függvényekből építi fel a szerepkörváltást. Emiatt új AUTH séma-migráció nem szükséges; az authoritative DEV migration baseline továbbra is 6.

PROD DENY.
