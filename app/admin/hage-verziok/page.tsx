"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AuthState = "checking" | "authorized" | "blocked";

type ReleaseItem = {
  token: string;
  project: string;
  version: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  expiresAt: string | null;
  downloadCount: number;
  lastDownloadedAt: string | null;
  title?: string;
  description?: string;
  note?: string;
  changes?: string[];
  isActive: boolean;
  isCurrent: boolean;
  fileAvailable: boolean;
  downloadPageUrl: string;
};

type ReleaseListResponse = {
  ok: boolean;
  error?: string;
  releases?: ReleaseItem[];
};

type ReleasePair = {
  baseVersion: string;
  dev?: ReleaseItem;
  run?: ReleaseItem;
  other: ReleaseItem[];
  updatedAt: string;
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Budapest",
  }).format(date);
}

function releaseKind(release: ReleaseItem) {
  const value = `${release.version} ${release.fileName} ${release.title || ""}`.toUpperCase();
  if (value.includes("RUN")) return "run" as const;
  if (value.includes("DEV")) return "dev" as const;
  return "other" as const;
}

function baseVersionOf(release: ReleaseItem) {
  const value = `${release.version} ${release.fileName}`;
  const match = value.match(/(?:MVP\s*)?V?([0-9]{2,4})/i);
  return match ? `v${match[1]}` : release.version;
}

function buildPairs(releases: ReleaseItem[]): ReleasePair[] {
  const groups = new Map<string, ReleasePair>();
  for (const release of releases) {
    const baseVersion = baseVersionOf(release);
    const current = groups.get(baseVersion) ?? {
      baseVersion,
      other: [],
      updatedAt: release.createdAt,
    };
    const kind = releaseKind(release);
    if (kind === "dev") current.dev = release;
    else if (kind === "run") current.run = release;
    else current.other.push(release);
    if (new Date(release.createdAt).getTime() > new Date(current.updatedAt).getTime()) current.updatedAt = release.createdAt;
    groups.set(baseVersion, current);
  }
  return Array.from(groups.values()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function ReleaseCard({ release, label, tone }: { release?: ReleaseItem; label: string; tone: "dev" | "run" }) {
  if (!release) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
        <strong className="block text-slate-700">{label}</strong>
        Ehhez a verzióhoz még nincs rögzített {label.toLowerCase()} csomag.
      </div>
    );
  }

  const toneClass = tone === "dev"
    ? "border-cyan-300 bg-cyan-50 text-cyan-950"
    : "border-emerald-300 bg-emerald-50 text-emerald-950";

  return (
    <article className={`rounded-2xl border p-5 ${toneClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] opacity-65">{label}</p>
          <h3 className="mt-1 text-lg font-black">{release.title || release.fileName}</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${release.fileAvailable ? "bg-emerald-600 text-white" : "bg-amber-200 text-amber-950"}`}>
          {release.fileAvailable ? (release.isActive ? "Letölthető" : "Link lejárt") : "Fájl nincs a VPS-en"}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 opacity-80">{release.description || release.note || "Nincs külön leírás."}</p>
      <div className="mt-4 grid gap-2 text-xs font-semibold sm:grid-cols-2">
        <span>Fájl: <strong>{release.fileName}</strong></span>
        <span>Méret: <strong>{formatBytes(release.sizeBytes)}</strong></span>
        <span>Kiadás: <strong>{formatDate(release.createdAt)}</strong></span>
        <span>Letöltés: <strong>{release.downloadCount} db</strong></span>
      </div>
      <code className="mt-4 block break-all rounded-xl bg-white/70 p-3 text-[11px] font-semibold">SHA-256: {release.sha256}</code>
      {release.changes?.length ? (
        <ul className="mt-4 space-y-2 text-sm font-semibold">
          {release.changes.map((change) => <li key={change}>• {change}</li>)}
        </ul>
      ) : null}
      {release.fileAvailable && release.isActive ? (
        <a href={release.downloadPageUrl} className="mt-4 inline-flex rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">Letöltési oldal →</a>
      ) : (
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-100 px-4 py-3 text-xs font-bold text-amber-950">
          A verzióelőzmény rögzítve van, de a fizikai ZIP még nincs a szerveres release tárhelyen. A következő feltöltésnél a HAGE Munkatér projektet kell választani.
        </p>
      )}
    </article>
  );
}

export default function HageVersionsPage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [message, setMessage] = useState("Betöltés...");

  const pairs = useMemo(() => buildPairs(releases), [releases]);
  const devCount = releases.filter((item) => releaseKind(item) === "dev").length;
  const runCount = releases.filter((item) => releaseKind(item) === "run").length;
  const storedCount = releases.filter((item) => item.fileAvailable).length;

  useEffect(() => {
    async function load() {
      const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
      if (!key) {
        setAuthState("blocked");
        setMessage("Licencadmin belépés szükséges.");
        return;
      }
      try {
        const authResponse = await fetch("/api/license/admin", {
          headers: { "x-dimpro-license-admin-key": key },
          cache: "no-store",
        });
        if (!authResponse.ok) {
          setAuthState("blocked");
          setMessage("A licencadmin munkamenet nem érvényes.");
          return;
        }
        setAuthState("authorized");
        const response = await fetch("/api/releases/list?project=HAGE_Munkater&limit=100", {
          headers: { "x-dimpro-license-admin-key": key },
          cache: "no-store",
        });
        const data = await response.json() as ReleaseListResponse;
        if (!response.ok || !data.ok) {
          setMessage(data.error || "Nem sikerült betölteni a HAGE verziókat.");
          return;
        }
        setReleases(data.releases || []);
        setMessage("");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Ismeretlen hálózati hiba.");
      }
    }
    void load();
  }, []);

  if (authState !== "authorized") {
    return (
      <main className="min-h-screen bg-[#050812] px-5 py-8 text-white">
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center">
          <div className="w-full rounded-[2rem] border border-amber-300/25 bg-slate-950/85 p-7">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">Védett HAGE verzióoldal</p>
            <h1 className="mt-4 text-3xl font-black">Licencadmin belépés szükséges</h1>
            <p className="mt-4 text-sm leading-7 text-slate-300">{message}</p>
            <Link href="/admin" className="mt-6 inline-flex rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950">Licencadmin belépés →</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6">
      <section className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] border border-cyan-200 bg-white p-7 shadow-sm">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-cyan-700">DIMPRO admin release központ</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.04em]">HAGE-INVEST Munkatér verziók</h1>
              <p className="mt-4 max-w-4xl text-sm font-semibold leading-7 text-slate-600">DEV és RUN kiadások párosított, védett verziólistája. A kiadási folyamat végén mindkét csomagot a HAGE_Munkater projekthez kell rögzíteni.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/dev" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black hover:bg-slate-50">Fejlesztői kezdőlap</Link>
              <Link href="/admin/releases?project=HAGE_Munkater" className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black text-white hover:bg-cyan-500">HAGE release feltöltő</Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Verziók</p><p className="mt-2 text-3xl font-black">{pairs.length}</p></div>
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">DEV csomag</p><p className="mt-2 text-3xl font-black">{devCount}</p></div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">RUN csomag</p><p className="mt-2 text-3xl font-black">{runCount}</p></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">VPS-en tárolt</p><p className="mt-2 text-3xl font-black">{storedCount}</p></div>
        </section>

        {message ? <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900">{message}</div> : null}

        <section className="mt-6 space-y-5">
          {pairs.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">Még nincs HAGE release bejegyzés.</div>
          ) : pairs.map((pair) => (
            <article key={pair.baseVersion} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">HAGE-INVEST Munkatér</p>
                  <h2 className="mt-1 text-3xl font-black">{pair.baseVersion}</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700">Frissítve: {formatDate(pair.updatedAt)}</span>
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <ReleaseCard release={pair.dev} label="DEV kiadás" tone="dev" />
                <ReleaseCard release={pair.run} label="RUN kiadás" tone="run" />
              </div>
              {pair.other.length ? <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">További kapcsolódó bejegyzések: {pair.other.map((item) => item.version).join(", ")}</div> : null}
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
