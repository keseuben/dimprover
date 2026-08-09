# DIMPRO Drop 1.1.0 – Identity Core fogyasztói integráció

Dátum: 2026-08-07
Állapot: RELEASED – privát pilot / korlátozott béta. Nyilvános GA kiadás nem történt.

## Cél
A DIMPRO Drop Send és projektkapcsolati folyamatai a központi DIMPRO Identity Core 0.1.0 felhasználói, licenc-, Send-jogosultsági és projektadatait használják. Nem készült párhuzamos Drop user/licenc/projekt törzsadatbázis.

## Megvalósult
- központi `ABCD-123-456` Send-jogosultságkód ellenőrzés;
- HMAC-alapú Send-kód tárolás, nyers kód csak egyszeri adminválaszban;
- központi, nem szerkeszthető feladói név/e-mail/DIMPRO user-kód;
- `locked_default`, `approved_list`, `free_entry` címzettmód támogatás;
- engedélyezett projektlista a központi projekttagságból;
- kézi projektkód ellenőrzés rate limittel;
- projektcél: `Beérkező Drop`;
- projektkód önmagában nem ad hozzáférést: Send entitlement + projektjog szükséges;
- központi havi Send-keret elszámolás csomagonként idempotensen;
- képcsoport megőrzése;
- audit: Send-kód ellenőrzés, projektkód siker/hiba, Send-véglegesítés;
- explicit, egyenkénti legacy Send-kód átvezetési adminfolyamat; automatikus migráció nincs.

## Javított integrációs hibák
1. Identity health-check korábban minden táblán `id` oszlopot feltételezett; a kompozit kulcsos rate-limit tábla miatt hamis readiness hibát adott. Javítva.
2. A PostgreSQL Drop workflow mapper nem térképezte vissza a `dimpro_send_entitlement_id`, `dimpro_project_id`, `project_public_code` mezőket. Emiatt a finalize legacy folyamatnak láthatta a központi csomagot és kihagyhatta az Identity elszámolást. Javítva és regressziós szerződéssel lefedve.
3. Candidate E2E-ben a production worker versenyezhetett a candidate finalize-zal. A validációt izolált candidate `scanOnly` worker futással végeztük.

## Validáció
- TypeScript: PASS.
- teljes ESLint: 0 error; 113 korábbról meglévő warning más modulokban.
- Identity Core health: 12/12 PASS.
- Identity–Drop source contract: 55/55 PASS.
- valós API/S3/ClamAV/Identity E2E: 30/30 PASS.
- Identity UI böngésző E2E: 19/19 PASS.
- accessibility/responsive böngésző smoke: 11/11 PASS (desktop, mobil, 200%-os zoom-egyenérték).
- scan acceleration contract: 27 PASS.
- kamera/e-mail preview contract: 58 PASS.
- PWA icon contract: 51 PASS.
- private-pilot validation contract: 97 PASS.
- E2E fixture maradvány: 0 user, 0 project, 0 E2E license; S3 tesztobjektum eltávolítva.

## Régi regressziós tesztek auditja
A v0.9.x történeti contractok egy része szándékosan korábbi implementációszöveget/verziót rögzít, ezért DROP 1.1.0 forráson nem tekinthető release gate-nek:
- v0.9.5 PostgreSQL store: régi UI-verziószöveg miatt áll meg;
- v0.9.6 Operations: régi workflow-manager verziószöveg miatt áll meg;
- v0.9.7 Mobile Experience: `DROP 0.9.9` runtime-verziót vár;
- v0.9.8 Offline Mobile: szóközérzékeny forráskód-regexet vár (`{workflowType:mode}`), miközben a jelenlegi, funkcionálisan azonos kód `{ workflowType: mode }`;
- v0.9.9 E-mail Client Validation: régi runtime-verziót vár;
- v0.9.9 Package ZIP: a korábbi egysoros `formData().get()` forrásmintát várja. A jelenlegi route továbbra is POST-bodyból olvassa a tokent, URL query-be nem teszi, és JSON csak teszttámogatásra maradt.

Ezeket történeti szerződésként megőrizzük. A DROP 1.1.0 release gate-je a 55 pontos Identity contract + 30 pontos valós E2E + 19 pontos Identity UI E2E + 11 nézetes browser smoke és a releváns friss regressziók.

## Release / rollback
Production aktiválás: `2026-08-07T13:59:50+00:00`.
Éles URL: `https://drop.dimpro.hu`.
Release státusz: privát pilot / korlátozott béta; `generalAvailabilityReleased=false`.
Éles utóellenőrzés: Identity health 12/12 PASS; HTTPS browser smoke 11/11 PASS; Identity UI 19/19 PASS; teljes production E2E 30/30 PASS.

Candidate BUILD_ID: `2vjwsByoXD2z3L-36-8mm`.
Tervezett release: `.next-v110-release-final`.
Előző production rollback cél: `.next-v100-release-final`.
Identity gate rollback érték: `DIMPRO_IDENTITY_CORE_ENABLED=false`.

## Biztonsági alapelv
A teljes Identity Core adatbázis-bootstrap nem fut újra. A Drop a már működő központi Identity Core fogyasztója. A DB-jelszó nem kerül Next runtime secretbe. A Send- és session-secretek root-only env fájlból töltődnek.
