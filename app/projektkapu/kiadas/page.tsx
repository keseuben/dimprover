import type { Metadata } from "next";
import { inspectDriveIssueAccess } from "@/app/lib/drive-core/issueAccess";
import { normalizeDriveCoreError } from "@/app/lib/drive-core/errors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kiadott dokumentum – DIMPRO Projektkapu",
  description: "Kontrollált hozzáférés a DIMPRO Projektkapuban kiadott dokumentumhoz.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] || "") : (value || "");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function ProjectGateIssueAccessPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = single(params.token).trim();

  if (!token) {
    return <IssueAccessFrame>
      <StatusCard
        kind="error"
        title="Hiányzó hozzáférési hivatkozás"
        message="A dokumentum megnyitásához a teljes DIMPRO kiadási hivatkozás szükséges."
      />
    </IssueAccessFrame>;
  }

  try {
    const access = await inspectDriveIssueAccess(token);
    const downloadHref = `/api/drive/public/issue-download?token=${encodeURIComponent(token)}`;
    return <IssueAccessFrame>
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-800">Kiadott dokumentum</p>
            <h1 className="mt-2 text-2xl font-black text-slate-950">{access.documentName}</h1>
            <p className="mt-2 text-sm font-semibold text-slate-600">Kiadási szám: {access.issueNumber}</p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-800">KIADOTT</span>
        </div>

        <dl className="mt-7 grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2">
          <div><dt className="text-xs font-black uppercase tracking-wide text-slate-500">Címzett</dt><dd className="mt-1 text-sm font-bold text-slate-900">{access.recipientName || access.recipientEmail || "Kiadási címzett"}</dd></div>
          <div><dt className="text-xs font-black uppercase tracking-wide text-slate-500">Szervezet</dt><dd className="mt-1 text-sm font-bold text-slate-900">{access.recipientOrganization || "–"}</dd></div>
          <div><dt className="text-xs font-black uppercase tracking-wide text-slate-500">Kiadás ideje</dt><dd className="mt-1 text-sm font-bold text-slate-900">{formatDate(access.issuedAt)}</dd></div>
          <div><dt className="text-xs font-black uppercase tracking-wide text-slate-500">Hivatkozás lejárata</dt><dd className="mt-1 text-sm font-bold text-slate-900">{formatDate(access.expiresAt)}</dd></div>
        </dl>

        <p className="mt-6 text-sm leading-6 text-slate-600">
          A letöltés naplózott művelet. A gomb megnyomásakor a rendszer rövid életű, privát letöltési hozzáférést készít ehhez a kiadott dokumentumhoz.
        </p>

        <a
          href={downloadHref}
          rel="nofollow noreferrer"
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 sm:w-auto"
        >
          Dokumentum letöltése
        </a>
      </section>
    </IssueAccessFrame>;
  } catch (error) {
    const normalized = normalizeDriveCoreError(error);
    const code = normalized.body.code;
    const expired = code === "DRIVE_ISSUE_ACCESS_TOKEN_EXPIRED";
    const inactive = code === "DRIVE_ISSUE_ACCESS_NOT_ISSUED";
    return <IssueAccessFrame>
      <StatusCard
        kind="error"
        title={expired ? "A hivatkozás lejárt" : inactive ? "A dokumentumkiadás már nem aktív" : "A hivatkozás nem használható"}
        message={expired
          ? "Kérjen új kiadási hivatkozást a projekt kapcsolattartójától."
          : inactive
            ? "A dokumentum kiadását visszavonták vagy újabb kiadás váltotta fel."
            : normalized.body.error}
      />
    </IssueAccessFrame>;
  }
}

function IssueAccessFrame({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-cyan-50 px-4 py-10 sm:px-6 sm:py-16">
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
      <div className="mb-7 text-center">
        <p className="text-xs font-black uppercase tracking-[.22em] text-cyan-800">DIMPRO</p>
        <h2 className="mt-1 text-xl font-black text-slate-950">Projektkapu</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">Kontrollált dokumentumkiadás</p>
      </div>
      {children}
    </div>
  </main>;
}

function StatusCard({ title, message }: { kind: "error"; title: string; message: string }) {
  return <section className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-xl shadow-slate-200/60 sm:p-8">
    <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-100 text-xl font-black text-rose-800">!</div>
    <h1 className="mt-5 text-2xl font-black text-slate-950">{title}</h1>
    <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
    <p className="mt-5 text-xs font-semibold text-slate-500">A hivatkozás nem ad általános hozzáférést a projekthez vagy a DIMPRO Drive-hoz.</p>
  </section>;
}
