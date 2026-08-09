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
  description?: string;
  note?: string;
  changes?: string[];
  isActive: boolean;
  isCurrent: boolean;
  fileAvailable: boolean;
  fileDeletedAt?: string;
  downloadPageUrl: string;
};

type ReleaseListResult = {
  ok: boolean;
  error?: string;
  project?: string;
  releases?: ReleaseItem[];
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

function formatDate(value: string | null | undefined) {
  if (!value) return "Nincs lejárat";
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Budapest",
  }).format(new Date(value));
}

function getVersionSummary(version: string) {
  if (version === "v3_62") {
    return "DIMPRO Drive Desktop MVP alapmodul, Path Guard előkészítés, projektalapú Drive nézet és védett release-letöltés.";
  }

  return "Részletes verzióleírás még nincs külön rögzítve.";
}

function getVersionBranchLabel(version: string) {
  if (version.startsWith("v3_")) return "v3.x fejlesztési ág";
  if (version.startsWith("v2_")) return "v2.x fejlesztési ág";
  if (version.startsWith("v1_")) return "v1.x fejlesztési ág";
  return "Egyéb verziók";
}

export default function AdminFajlmuhelyVersionsPage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [message, setMessage] = useState("Release lista ellenőrzése...");
  const [loading, setLoading] = useState(false);

  async function loadReleasesFromStoredAdminKey() {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) {
      setAuthState("blocked");
      setMessage("Nincs aktív licencadmin kulcs a böngészőben. Előbb lépj be a /admin felületen.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/releases/list?project=DIMPRO_Fajlmuhely&limit=50", {
        headers: { "x-dimpro-license-admin-key": key },
        cache: "no-store",
      });
      const data = (await response.json()) as ReleaseListResult;

      if (!response.ok || !data.ok) {
        setAuthState("blocked");
        setReleases([]);
        setMessage(data.error || "A licencadmin kulcs nem érvényes a release lista betöltéséhez.");
        return;
      }

      setAuthState("authorized");
      setReleases(data.releases || []);
      setMessage("Release lista betöltve.");
    } catch (error) {
      setAuthState("blocked");
      setReleases([]);
      setMessage(error instanceof Error ? error.message : "Ismeretlen release lista hiba.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReleasesFromStoredAdminKey();
  }, []);

  const activeCount = releases.filter((release) => release.isActive).length;
  const storedCount = releases.filter((release) => release.fileAvailable).length;
  const latestRelease = releases[0];
  const branches = useMemo(
    () => Array.from(new Set(releases.map((release) => getVersionBranchLabel(release.version)))),
    [releases],
  );

  if (authState !== "authorized") {
    return (
      <main className="min-h-screen bg-[#050812] px-5 py-8 text-slate-100 lg:px-8">
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center">
          <div className="w-full rounded-[2rem] border border-amber-300/25 bg-slate-950/85 p-7 shadow-[0_0_90px_rgba(245,158,11,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300/75">Védett Fájlműhely verzióoldal</p>
            <h1 className="mt-4 text-3xl font-black text-white">Licencadmin belépés szükséges</h1>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              A DIMPRO Fájlműhely release lista már nem a sima DIMPROVER app-loginhoz tartozik, hanem a licencadmin munkamenethez. Lépj be a licencadmin felületen, majd onnan nyisd meg ezt az oldalt.
            </p>
            <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              {message}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/admin" className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950">
                Licencadmin belépés →
              </Link>
              <Link href="/admin/dev" className="rounded-2xl border border-lime-300/40 px-5 py-3 text-sm font-black text-lime-100 hover:bg-lime-300/10">
                Fejlesztői kezdőlap
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-950 sm:px-6">
      <section className="mx-auto max-w-7xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-300/40 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-700">DIMPRO admin release központ</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">DIMPRO Fájlműhely verziók</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
                Védett admin verzióoldal a DIMPRO Fájlműhely és DIMPRO Drive Desktop fejlesztési ZIP / 7Z csomagokhoz. Az oldal kizárólag érvényes licencadmin kulccsal tölti be a release listát.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/admin" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
                  Admin választófelület
                </Link>
                <Link href="/admin/dev" className="rounded-xl border border-lime-500/40 px-4 py-2 text-sm font-black text-lime-700 hover:bg-lime-50">
                  Fejlesztői kezdőlap
                </Link>
                <Link href="/admin/releases" className="rounded-xl border border-cyan-500/40 px-4 py-2 text-sm font-black text-cyan-700 hover:bg-cyan-50">
                  Release feltöltő
                </Link>
                <button
                  type="button"
                  onClick={() => void loadReleasesFromStoredAdminKey()}
                  disabled={loading}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
                >
                  {loading ? "Frissítés..." : "Lista frissítése"}
                </button>
              </div>
            </div>

            <div className="grid min-w-64 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="font-semibold text-slate-500">Összes verzió</span>
                <strong className="text-slate-950">{releases.length} db</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="font-semibold text-slate-500">Szerveren lévő fájl</span>
                <strong className="text-cyan-700">{storedCount} db</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="font-semibold text-slate-500">Aktív link</span>
                <strong className="text-emerald-700">{activeCount} db</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="font-semibold text-slate-500">Legutóbbi</span>
                <strong className="text-slate-950">{latestRelease?.version ?? "-"}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-300/40 lg:sticky lg:top-6">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Verziófa</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">DIMPRO Fájlműhely</h2>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-black text-slate-800">└─ DIMPRO Drive Desktop</div>
              <div className="mt-3 grid gap-4 border-l border-slate-300 pl-4">
                {branches.map((branch) => (
                  <div key={branch}>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">{branch}</div>
                    <div className="mt-2 grid gap-1">
                      {releases
                        .filter((release) => getVersionBranchLabel(release.version) === branch)
                        .map((release) => (
                          <a
                            key={release.token}
                            href={`#release-${release.token}`}
                            className={`rounded-xl px-3 py-2 text-sm font-black transition ${
                              release.isCurrent
                                ? "bg-cyan-600 text-white"
                                : release.fileAvailable
                                  ? "bg-white text-slate-700 hover:bg-cyan-50 hover:text-cyan-800"
                                  : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                            }`}
                          >
                            {release.version}
                            <span className="ml-2 text-xs font-semibold opacity-75">
                              {release.fileAvailable ? "ZIP" : "előzmény"}
                            </span>
                          </a>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
              A verziófa nem törlődik akkor sem, ha a régi ZIP / 7Z fájl törlésre kerül a szerverről. Ilyenkor csak az előzmény marad látható.
            </div>
          </aside>

          <section className="grid gap-4">
            {releases.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-700 shadow-xl shadow-slate-300/30">
                Még nincs rögzített DIMPRO Fájlműhely release csomag, vagy a lista üresen érkezett.
              </div>
            ) : null}

            {releases.map((release) => {
              const summary = release.description || release.note || getVersionSummary(release.version);
              const changes = release.changes || [];

              return (
                <details
                  id={`release-${release.token}`}
                  key={release.token}
                  className="group rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-300/30"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 p-5 marker:hidden sm:p-6">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-black text-slate-950">{release.version}</h2>
                        {release.isCurrent ? (
                          <span className="rounded-full bg-cyan-600 px-3 py-1 text-xs font-black text-white">Legfrissebb</span>
                        ) : null}
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${
                            release.fileAvailable
                              ? release.isActive
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                              : "bg-slate-200 text-slate-500"
                          }`}
                        >
                          {release.fileAvailable ? (release.isActive ? "Aktív link" : "Lejárt link") : "Fájl törölve"}
                        </span>
                      </div>
                      <p className="mt-2 break-all text-sm font-semibold text-slate-500">
                        {release.fileName} · {formatBytes(release.sizeBytes)} · {formatDate(release.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {release.fileAvailable && release.isActive ? (
                        <Link
                          href={release.downloadPageUrl}
                          className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black text-white transition hover:bg-cyan-700"
                        >
                          Letöltési oldal
                        </Link>
                      ) : (
                        <span className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-black text-slate-500">
                          Csak előzmény
                        </span>
                      )}
                      <span className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-500 group-open:bg-slate-950 group-open:text-white">
                        Részletek
                      </span>
                    </div>
                  </summary>

                  <div className="border-t border-slate-200 px-5 pb-5 sm:px-6 sm:pb-6">
                    <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <span className="block text-xs font-black uppercase tracking-[0.16em] text-slate-400">Méret</span>
                        <strong className="mt-1 block text-slate-950">{formatBytes(release.sizeBytes)}</strong>
                      </div>
                      <div>
                        <span className="block text-xs font-black uppercase tracking-[0.16em] text-slate-400">Lejárat</span>
                        <strong className="mt-1 block text-slate-950">{formatDate(release.expiresAt)}</strong>
                      </div>
                      <div>
                        <span className="block text-xs font-black uppercase tracking-[0.16em] text-slate-400">Letöltések</span>
                        <strong className="mt-1 block text-slate-950">{release.downloadCount} db</strong>
                      </div>
                      <div>
                        <span className="block text-xs font-black uppercase tracking-[0.16em] text-slate-400">Utolsó letöltés</span>
                        <strong className="mt-1 block text-slate-950">{formatDate(release.lastDownloadedAt)}</strong>
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                      <h3 className="text-lg font-black text-slate-950">Verzió leírás</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{summary}</p>
                      {changes.length > 0 ? (
                        <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-700">
                          {changes.map((change) => (
                            <li key={change} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-600" />
                              <span>{change}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    {!release.fileAvailable ? (
                      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-100 p-4 text-sm leading-6 text-slate-600">
                        A verzióelőzmény megmaradt, de a hozzá tartozó ZIP / 7Z fájl már törölve lett a szerverről.
                        A fájl a helyi gépeden vagy korábbi mentésben keresendő.
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-2xl bg-slate-950 p-4">
                      <span className="block text-xs font-black uppercase tracking-[0.16em] text-cyan-200">SHA256</span>
                      <code className="mt-2 block break-all text-xs font-semibold text-cyan-50">{release.sha256}</code>
                    </div>
                  </div>
                </details>
              );
            })}
          </section>
        </div>
      </section>
    </main>
  );
}
