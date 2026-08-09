import Link from "next/link";
import { getReleaseByToken, getReleaseHistoryForProject } from "@/app/lib/downloads/releaseDownloads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DownloadPageProps = {
  params: Promise<{
    token: string;
  }>;
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

function formatDate(value: string | null) {
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

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Budapest",
  }).format(new Date(value));
}

function getFallbackDescription(version: string) {
  if (version === "v3_62") {
    return "DIMPRO Fájlműhely v3.62 – DIMPRO Drive Desktop MVP alapmodul. Tartalmazza a Drive modulhelyet, a mock projekt- és fájllistát, a Path Guard alapellenőrzést, a DriveEvent előkészítést és a helyi DIMPRO Drive mappa logikáját.";
  }

  return "A csomaghoz még nincs külön részletes verzióleírás rögzítve.";
}

function getFallbackChanges(version: string) {
  if (version === "v3_62") {
    return [
      "DIMPRO Drive Desktop alapmenü és modulhely beépítése a Fájlműhelybe.",
      "Projektlista és szerveres fájllista MVP mock adatokkal.",
      "Path Guard fájl- és útvonalhossz ellenőrző helper első verziója.",
      "DriveEvent eseménystruktúra és védett release-letöltési alap előkészítése.",
    ];
  }

  return [];
}

export default async function DownloadPage({ params }: DownloadPageProps) {
  const { token } = await params;
  const lookup = await getReleaseByToken(token);

  if (!lookup.ok) {
    return (
      <main className="min-h-screen bg-slate-100 px-6 py-12 text-slate-950">
        <section className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-white p-8 shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-600">DIMPRO release letöltés</p>
          <h1 className="mt-4 text-3xl font-black text-slate-950">A letöltési link nem használható</h1>
          <p className="mt-4 text-slate-700">{lookup.message}</p>
          <Link href="/" className="mt-8 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">
            Vissza a főoldalra
          </Link>
        </section>
      </main>
    );
  }

  const { record } = lookup;
  const history = await getReleaseHistoryForProject(record.project, record.token, 12);
  const description = record.description || record.note || getFallbackDescription(record.version);
  const changes = record.changes?.length ? record.changes : getFallbackChanges(record.version);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-950 sm:px-6">
      <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-300/40 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-700">DIMPRO védett release</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Letöltési csomag</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Védett, token alapú letöltés. A csomag nincs nyilvános fájllistában, de a link birtokában a lejáratig letölthető.
              </p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
              Aktív link
            </span>
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm">
            <div className="grid gap-4">
              <div className="grid gap-1 border-b border-slate-200 pb-3 sm:grid-cols-[150px_1fr]">
                <span className="font-semibold text-slate-500">Fájl</span>
                <strong className="break-all text-slate-950">{record.fileName}</strong>
              </div>
              <div className="grid gap-1 border-b border-slate-200 pb-3 sm:grid-cols-[150px_1fr]">
                <span className="font-semibold text-slate-500">Projekt</span>
                <strong className="text-slate-950">{record.project}</strong>
              </div>
              <div className="grid gap-1 border-b border-slate-200 pb-3 sm:grid-cols-[150px_1fr]">
                <span className="font-semibold text-slate-500">Verzió</span>
                <strong className="text-slate-950">{record.version}</strong>
              </div>
              <div className="grid gap-1 border-b border-slate-200 pb-3 sm:grid-cols-[150px_1fr]">
                <span className="font-semibold text-slate-500">Méret</span>
                <strong className="text-slate-950">{formatBytes(record.sizeBytes)}</strong>
              </div>
              <div className="grid gap-1 border-b border-slate-200 pb-3 sm:grid-cols-[150px_1fr]">
                <span className="font-semibold text-slate-500">Lejárat</span>
                <strong className="text-slate-950">{formatDate(record.expiresAt)}</strong>
              </div>
              <div className="grid gap-2">
                <span className="font-semibold text-slate-500">SHA256 ellenőrző összeg</span>
                <code className="break-all rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs font-semibold text-cyan-100">
                  {record.sha256}
                </code>
              </div>
            </div>
          </div>

          <a
            href={`/api/downloads/${encodeURIComponent(record.token)}`}
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-cyan-600 px-6 py-4 text-base font-black text-white shadow-lg shadow-cyan-900/20 transition hover:bg-cyan-700"
          >
            ZIP csomag letöltése
          </a>

          <div className="mt-6 rounded-2xl border border-cyan-100 bg-cyan-50 p-5">
            <h2 className="text-lg font-black text-slate-950">Verzió leírás</h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">{description}</p>
            {changes.length > 0 ? (
              <ul className="mt-4 grid gap-2 text-sm leading-6 text-slate-700">
                {changes.map((change) => (
                  <li key={change} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-600" />
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-300/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Előzmények</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Verziók</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{history.length} db</span>
          </div>

          <div className="mt-5 grid gap-3">
            {history.map((item) => (
              <a
                key={item.token}
                href={item.downloadPageUrl}
                className={`rounded-2xl border p-4 transition ${
                  item.isCurrent
                    ? "border-cyan-300 bg-cyan-50 shadow-sm"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="text-base text-slate-950">{item.version}</strong>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{formatShortDate(item.createdAt)}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-black ${
                      item.isCurrent
                        ? "bg-cyan-600 text-white"
                        : item.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {item.isCurrent ? "Aktuális" : item.isActive ? "Aktív" : "Lejárt"}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 break-all text-xs leading-5 text-slate-600">{item.fileName}</p>
                {item.note || item.description ? (
                  <p className="mt-3 line-clamp-3 text-sm leading-5 text-slate-700">{item.description || item.note}</p>
                ) : null}
              </a>
            ))}
          </div>

          <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-800">
            A korábbi verziók itt maradnak nyomon követésre. A lejárt linkek nem tölthetők le új token nélkül.
          </p>
        </aside>
      </section>
    </main>
  );
}