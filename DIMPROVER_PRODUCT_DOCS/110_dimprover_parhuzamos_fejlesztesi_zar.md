# DIMPROVER párhuzamos fejlesztési és kizárólagos műveleti zár

**Bevezetés:** 2026. augusztus 7.  
**Érintett projekt:** `/root/dimprover`

## Cél

Több ChatGPT-fejlesztési csevegés párhuzamosan módosíthat forrásfájlokat, készíthet SQL-t, dokumentációt, célzott tesztet, TypeScript- vagy ESLint-ellenőrzést. Ugyanakkor egyszerre csak egy erőforrás- és állapotérzékeny művelet futhat:

- Next.js production/candidate build;
- release-pointer módosítás és élesítés;
- adatbázis-migráció;
- PM2 restart;
- egyéb kizárólagos karbantartás.

## Automatikus elsőként érkező sorrend

A közös zár fájlja:

```text
/root/dimprover/.dimprover/locks/exclusive-operation.lock
```

Az elsőként induló művelet megszerzi a zárat és végigfut. A második vagy harmadik művelet nem indul párhuzamosan, hanem legfeljebb 7200 másodpercig automatikusan vár. A zár a folyamat befejezésekor operációs rendszer szinten felszabadul, ezért szerver- vagy folyamatleállás után sem marad aktív zárolás.

## Kötelező buildindítás

A `package.json` `build` parancsa közvetlenül a koordinált buildet indítja:

```bash
npm run build
```

A hívás automatikusan a következő scriptre kerül:

```text
scripts/dimpro-coordinated-build.sh
```

Ez a közös műveleti koordinátort használja:

```text
scripts/dimpro-coordinated-operation.sh
```

Közvetlen `next build` vagy `npm run build:raw` csak kézi helyreállításkor és kizárólag akkor használható, ha bizonyítottan nincs másik fejlesztési művelet.

## Release-, migráció- és restartműveletek

Példák:

```bash
npm run operation:release -- bash scripts/sajat-release-script.sh
npm run operation:migration -- bash scripts/sajat-migration-script.sh
npm run operation:restart -- pm2 restart dimprover
```

Ezek ugyanazt a közös kizárólagos zárat használják, ezért build, migráció, release és restart egymással sem futhat párhuzamosan.

## Műveletgazda és állapot

A futó művelet állapota:

```text
/root/dimprover/.dimprover/active-development.json
```

Az állapot tartalmazza:

- művelettípust;
- fejlesztési gazdát;
- feladatot;
- candidate/release célt;
- PID-et;
- indulási időt;
- szerver bootazonosítót.

A befejezett műveletek naplója:

```text
/root/dimprover/.dimprover/development-operations.jsonl
```

## Fejlesztési csevegések kötelező szabálya

1. Forrásfejlesztés előtt továbbra is kötelező a szerverállapot, az érintett fájlok és a backup ellenőrzése.
2. `npm run build` automatikusan sorba állítja a buildet.
3. Release, migráció és restart csak a koordinált műveleti wrapperrel indítható.
4. Másik futó kizárólagos műveletet tilos leállítani vagy megkerülni.
5. A várakozó csevegés közben végezhet dokumentációt, célzott lintet, TypeScript-ellenőrzést és nem ütköző forrásmódosítást.
6. Élesítés előtt továbbra is szükséges smoke, böngészőteszt, rollback és dokumentált eredmény.

## Ellenőrzési eredmény

A 2026. augusztus 7-i kétfolyamatos próba során:

- `zárteszt-A` elsőként megszerezte a zárat;
- `zárteszt-B` várakozott;
- `zárteszt-B` csak `zárteszt-A` befejezése után indult;
- párhuzamos végrehajtás nem történt;
- az aktív állapotfájl a műveletsor végén törlődött;
- mindkét művelet külön kezdési és befejezési naplóbejegyzést kapott.
