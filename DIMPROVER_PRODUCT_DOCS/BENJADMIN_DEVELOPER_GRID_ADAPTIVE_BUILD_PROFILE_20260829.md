# BENJADMIN Developer Grid — adaptive canonical build profile — 2026-08-29

## Környezet
- Developer Grid only
- DEV ONLY · PROD DENY
- ChatGrid v0.3.x változatlan

## Indok
A P0 work-start RC két egymást követő canonical webpack buildje 1 CPU mellett a 45 perces fail-fast időkorlátnál állt le, miközben a cgroup memória-csúcsa kb. 4,21 GiB volt és OOM nem történt. A korábbi v0.1.5 build ugyanazon hoston 1 CPU-val 13,9 perc alatt fordult, ezért a jelenlegi állapot CPU-idő szempontból indokolatlanul lassú.

## Új profil
A canonical wrapper továbbra is fail-closed resource gate-tel indul. Alapértelmezés: 1 CPU / 100% CPUQuota. Csak akkor válthat 2 CPU / 200% CPUQuota profilra, ha:
- MemAvailable legalább 5 GiB;
- legalább 2 CPU látható;
- a meglévő swap gate PASS;
- a forrás exact canonical branch/HEAD és clean;
- a central exclusive lock szabad.

A memória-plafon nem emelkedik: `MemoryHigh=4300M`, `MemoryMax=5000M`, `MemorySwapMax=512M`. A 45 perces `RuntimeMaxSec=2700s` megmarad.

A build log külön `BUILD_PROFILE` sort ír a tényleges CPU profilról. Így a gyorsítás auditálható, de nem kerülhet a resource gate elé.

**DEV ONLY · PROD DENY**
