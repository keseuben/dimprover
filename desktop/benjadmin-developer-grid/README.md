# BENJADMIN Developer Grid Desktop v0.1.1 DEV

Új, a ChatGrid v0.3.x-től elkülönített Developer Grid Windows desktop preview.

## Fix elrendezés

- 01 · ÁrminAI — bal felső
- 02 · OutminAI — jobb felső
- 03 · BenjáminAI — bal alsó (backend kompatibilitási kód: `BENAI`)
- 04 · JázminAI — jobb alsó
- középen: BENJADMIN Fejlesztői Vezérlőpult / Central Core munkatér
- 05 · DevminAI — külön felhozható segédagent

A ChatGrid v0.3.x külön termék és fallback/reference marad; ez az EXE nem írja felül a ChatGrid telepítését vagy helyi konfigurációját.

## DEV biztonság

- DEV ONLY · PROD DENY
- helyi jelszókapu
- ChatGPT WebContentsView: sandbox, Node tiltva, context isolation, HTTPS host allowlist
- Windows screen lock automatikus munkatérzár
- BENJADMIN élő kapcsolat a meglévő ChatGrid read-only kompatibilitási bridge-en keresztül; a Developer Grid native delta API későbbi bekötési pont

## Build

```text
npm ci
npm run check
npm run dist:win
npm run package:dev
```
