# DIMPRO DEV Worktree Retention V3 – 2026-09-09

## Cél

A DEV VPS ne teljen meg a fejlesztések során létrejövő, később már nem használt Git worktree-k miatt, és ne legyen szükség havi kézi, több tíz GB-os takarításra. A V3 kizárólag DEV-re vonatkozik; PROD-ra nem alkalmazható.

A 2026-09-09-i audit során 29 régi, tiszta, nem futó worktree szabályos eltávolítása 40 831 422 464 bájt helyet szabadított fel, a root filesystem használata 94%-ról 60%-ra csökkent. A V3 ezt a felhalmozódást előzi meg fokozatos, fail-closed automatikával.

## Automatikus működés

- napi futás: 04:20 Europe/Budapest, legfeljebb 10 perc random késleltetéssel;
- a napi Restic backup és a korábbi storage-retention után fut;
- cél szabad hely: 30 GiB;
- ha legalább 30 GiB szabad hely van, worktree-t nem töröl;
- csak akkor kezd eltávolítani, ha a szabad hely a cél alá esett;
- a legrégebbi jogosult worktree-kkel kezd, és azonnal megáll, amikor a 30 GiB cél teljesül.

## Worktree törlési kapuk

Egy worktree csak akkor lehet automatikus jelölt, ha minden feltétel teljesül:

1. közvetlenül a `/srv/dimpro-dev/worktrees` alatt található;
2. ugyanahhoz a canonical Git repositoryhoz tartozik;
3. Git-clean, beleértve az untracked fájlokat is;
4. nem detached HEAD;
5. a lokális branch ref pontosan a worktree HEAD-jére mutat;
6. legalább 14 napja inaktív;
7. nincs alatta futó processz;
8. nincs PM2 cwd-hivatkozás;
9. nincs systemd/cron hivatkozás;
10. nem szerepel aktív koordinált műveletben;
11. neve/branch-e nem védett, például `immutable` vagy canonical védett branch;
12. létezik sikeres, legfeljebb 30 órás Restic backup-státusz;
13. a backup időpontja nem lehet korábbi a worktree HEAD commitjánál.

Bármely bizonytalan vagy hibás állapot esetén a motor nem töröl.

## Utolsó fejlesztések megtartása

A fejlesztési worktree-k branch-/névcsaládokba vannak rendezve. Családonként a legfrissebb 3 worktree 30 napig garantáltan védett. Ezután a `newest` védelem lejár, és a többi biztonsági kapu dönthet a törlésről.

Ez azért szükséges, hogy:

- a kisebb, egymást követő modulfejlesztések utolsó néhány állapota megmaradjon;
- ugyanakkor az egydarabos vagy ritkán folytatott, hónapokkal korábbi worktree-k ne maradjanak örökre a szerveren.

## Visszaállíthatóság

Törlés előtt a motor:

1. újra lefuttatja a biztonsági kapukat;
2. archive refet készít: `refs/retention-archive/YYYYMMDD/<worktree-name>`;
3. 0600 jogosultságú recovery manifestet ír a `/srv/dimpro-dev/coordination/recovery/worktree-retention-v3` könyvtárba;
4. csak ezután futtatja a `git worktree remove <path>` műveletet.

`--force` és `rm -rf` nem használható a V3 worktree-törlésben. A lokális branch és az archive ref megmarad. A napi Restic mentés a `/srv/dimpro-dev/worktrees` és `/srv/dimpro-dev/repositories` forrást tartalmazza; a regenerálható `node_modules` és `.next*` állományok ki vannak zárva.

## Kapcsolódó fájlok

- `scripts/dimpro-dev-worktree-retention-v3.mjs`
- `scripts/dimpro-dev-worktree-retention-v3.sh`
- `scripts/dimpro-dev-worktree-retention-v3-contract.mjs`
- `config/dimpro-dev-storage-retention.json`
- `ops/systemd/dimpro-dev-worktree-retention-v3.service`
- `ops/systemd/dimpro-dev-worktree-retention-v3.timer`

## Validáció

A V3 contract temp Git repositoryban tényleges `git worktree remove` műveletet tesztel. Ellenőrzi a családonkénti utolsó 3 védelmet, a 30 napos lejáratot, dirty worktree védelmét, stale backup fail-closed viselkedést, archive refet és recovery manifestet. A korábbi Storage Retention V2 és hardening contractok regresszióként továbbra is kötelezők.

A 2026-09-09-i valós DEV dry-run a finomított szabállyal 141 worktree-ből 17 későbbi jelöltet azonosított, de 44,66 GiB szabad hely mellett helyesen 0 worktree-t törölt.

## Worktree dependency helper hardening

A V3 validáció feltárt egy korábbi helper-hibát: ha a megadott operator worktree `node_modules` könyvtára külső symlink volt, a `cp -al` a symlinket örökítette tovább az új worktree-be. Ezt a Next/Turbopack build elutasítja. A helper most csak valódi, nem symlink `node_modules` könyvtárat fogad el dependency-forrásként; lockfile-egyezés mellett szükség esetén a `benjadmin-operator-ui-v2` valódi dependency-fájára esik vissza. A létrehozás után külön ellenőrzi, hogy a cél `node_modules` valódi könyvtár.

## DEV build memória-stabilizálás

A V3 production validáció 2026-09-10 00:44-kor globális OOM miatt leállt. A kernelnapló igazolta, hogy a DEV-en csak a kb. 510 MiB-os swap-partíció állt rendelkezésre. 2026-09-10 08:49-kor egy külön 4 GiB `/swapfile` került létrehozásra `600` jogosultsággal és `/etc/fstab` bejegyzéssel, így az összes rendelkezésre álló swap kb. 4,5 GiB lett. Az eredeti `/etc/fstab` időbélyeges biztonsági mentése megmaradt. Ez üzemeltetési stabilizálás, nem alkalmazásfunkció.
