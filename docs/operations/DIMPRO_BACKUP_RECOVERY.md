# DIMPRO mentési és helyreállítási kézikönyv

## Aktív rendszer

- Forrás: `dotroll-current-app-01`
- Cél: titkosított Restic repository a Hetzner Storage Boxon
- Napi mentés: 01:30 UTC, legfeljebb 10 perc véletlen késleltetés
- Napi frissesség-ellenőrzés: 05:00 UTC
- Heti repository-ellenőrzés: vasárnap 04:10 UTC
- Megőrzés: 14 napi, 8 heti és 12 havi snapshot

## Mentett tartalom

- DIMPROVER projektforrás
- PM2 állapot
- Nginx, systemd, SSH, UFW és Fail2ban konfiguráció
- telepített csomagok és rendszerállapot
- Supabase PostgreSQL logikai dump
- helyi DIMPRO rendszeradatok

## Titkok

A Restic-jelszó és a Supabase adatbázisjelszó nem írható dokumentációba vagy chatbe. A Restic-jelszót külön, szerveren kívüli jelszókezelőben is meg kell őrizni. Enélkül a titkosított repository új szerverről nem nyitható meg.

## Állapotellenőrzés

```bash
systemctl status dimpro-backup.timer dimpro-backup-check.timer dimpro-backup-watchdog.timer
cat /var/lib/dimpro-backup/status/latest.json
cat /var/log/dimpro-backup/latest-status.env
journalctl -t dimpro-backup-alert --no-pager
```

Restic-parancsok előtt:

```bash
set -a
source /etc/dimpro-backup/backup.env
set +a
```

Snapshotok:

```bash
restic snapshots --latest 5
```

## Kézi mentés

```bash
systemctl start dimpro-backup.service
journalctl -u dimpro-backup.service -n 100 --no-pager
```

## Fájl-visszaállítás

Mindig külön próbamappába kell visszaállítani. Éles fájl közvetlen felülírása tilos ellenőrzés és külön jóváhagyás nélkül.

```bash
set -a
source /etc/dimpro-backup/backup.env
set +a
mkdir -p /var/lib/dimpro-backup/manual-restore
restic restore SNAPSHOT_ID --target /var/lib/dimpro-backup/manual-restore --include /KERESETT/UTVONAL
```

## Supabase adatbázis-visszaállítás

A jelenlegi `postgresql.dump` titkosított vészhelyzeti dump. A teljes visszaállítási próbát nem szabad az éles Supabase-projektbe futtatni.

Biztonságos sorrend:

1. külön Supabase tesztprojekt létrehozása;
2. szükséges kiterjesztések bekapcsolása;
3. dump visszaállítása a Storage Box snapshotból külön munkamappába;
4. visszatöltés a tesztprojektbe;
5. táblák, `auth.users`, RLS, függvények és mintarekordok ellenőrzése;
6. eredmény jegyzőkönyvezése.

A Supabase hordozható mentés hivatalosan három fájlt használ: `roles.sql`, `schema.sql`, `data.sql`, Supabase CLI-val. A CLI Docker-környezetet használ, ezért ezt később külön backup worker vagy CI-folyamat végezze, ne a jelenlegi alkalmazás-VPS.

## Riasztás

Helyi riasztások:

- `/var/lib/dimpro-backup/alerts/`
- `journalctl -t dimpro-backup-alert`

A riasztás jelenleg helyi eseményt és naplóbejegyzést készít. Külső e-mail-küldéshez később SMTP-adatok szükségesek.
