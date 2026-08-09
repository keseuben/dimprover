# DIMPRO SQL-fájl átadási és futtatási szabály

**Dátum:** 2026. augusztus 2.  
**Érvényesség:** minden jövőbeni DIMPRO / DIMPROVER / Projektkapu / Drop Supabase SQL-migrációra

## Kötelező átadási forma

Amikor a felhasználónak kézzel kell SQL-fájlt futtatnia, az asszisztens nem csak letöltési hivatkozást ad. Minden esetben meg kell adni:

1. az SQL-fájl egyértelmű, beszédes nevét;
2. a VPS-en lévő teljes elérési útját;
3. a helyi Windows PowerShellben futtatható teljes `scp` parancsot;
4. a szerverjelszó megadására vonatkozó rövid jelzést;
5. a helyi VS Code megnyitási parancsot;
6. a `Ctrl + A`, `Ctrl + C` lépést;
7. a Supabase SQL Editorban a `New query`, `Ctrl + V`, `Run` lépéseket;
8. az elvárt sikerüzenetet vagy a visszaküldendő hibaüzenetet.

## Kötelező minta

```powershell
scp root@213.160.68.24:/root/dimprover/supabase/SQL_FAJL_NEVE.sql "$env:USERPROFILE\Downloads\SQL_FAJL_NEVE.sql"
```

Ezután a felhasználó megadja a szerver jelszavát.

```powershell
code "$env:USERPROFILE\Downloads\SQL_FAJL_NEVE.sql"
```

VS Code-ban:

```text
Ctrl + A
Ctrl + C
```

Supabase SQL Editorban:

```text
New query
Ctrl + V
Run
```

## Fájlnévadás

Az SQL-fájlnév tartalmazza:

- a termék vagy modul nevét;
- a funkciót;
- a verziót;
- szükség esetén a `BOOTSTRAP`, `MIGRATION`, `PATCH` vagy `ROLLBACK` jelölést.

Példa:

```text
DIMPRO_PROJECT_CORE_V020_BOOTSTRAP.sql
```

A felhasználónak küldött parancsban ugyanazt a fájlnevet kell használni a szerveren és a helyi Letöltések mappában is.
