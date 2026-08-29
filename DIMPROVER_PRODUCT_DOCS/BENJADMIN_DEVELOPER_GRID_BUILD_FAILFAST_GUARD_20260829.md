# BENJADMIN Developer Grid — canonical build fail-fast guard — 2026-08-29

## Környezet
- Developer Grid only
- DEV ONLY · PROD DENY
- ChatGrid v0.3.x változatlan

## Kiváltó esemény
A P0 work-start canonical build `0860ac25544f2a0af86b170e2e421fc11dbf4d86` forráson közel két órán át nem jutott el BUILD_ID-ig. A build worker ~5,5 GB RSS-sel a systemd memory cgroup plafonján `mem_cgroup_handle_over_high` állapotban maradt, miközben a host teljes swapja betelt és a memory PSI 90% fölé emelkedett.

A buildet a konkrét systemd scope szabályos leállításával zártuk le. A központi koordinátor `failed`, exit `143` eredményt rögzített és felszabadította az exclusive lockot. A forrás nem módosult a megszakítás alatt.

## Recovery
A build után a hoston kb. 5,7 GiB memória vált újra elérhetővé. A korábban kiswapolt lapokat központi `maintenance` lock alatt a már bevált `/dev/sda2` swapoff/swapon eljárással visszaállítottuk. Eredmény: swap 0 B, memory PSI avg10 ~0.

## Új fail-fast korlátok
A Developer Grid canonical build scope mostantól:
- `MemoryHigh=4300M`
- `MemoryMax=5000M`
- `MemorySwapMax=512M`
- `RuntimeMaxSec=2700s` (45 perc)

Cél: egy túl nagy memóriaigényű vagy beragadt Next build ne tudja hosszú időre teljes memory-pressure alá tenni a canonical DEV hostot. A build inkább kontrolláltan hibázzon, mint hogy közel két órán át blokkolja a fejlesztési környezetet.

A normál preflight továbbra is minimum 3 GiB MemAvailable és 85% alatti swap-használat mellett enged indulást. A build01/build02 bekötése után a nagy build terhelés elsődlegesen a dedikált build node-okra kerülhet.

## Következő lépés
A következő build csak tiszta source + szabad central lock + zöld resource preflight mellett indulhat. A sikertelen `0860ac2` buildet nem szabad vakon ismételni; új próbálkozás előtt az Operation Reconciler és a jelenlegi exact feature HEAD használata kötelező.

**DEV ONLY · PROD DENY**
