import Link from "next/link";
import { cookies, headers } from "next/headers";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Construction,
  FileDown,
  FileText,
  ImageUp,
  LockKeyhole,
  ShieldAlert,
} from "lucide-react";
import { validateDropAccessToken } from "@/app/lib/drop/dropAccess";
import { findDropPackageById, listDropRecipientsForPackage } from "@/app/lib/drop/dropRepository";
import { getDropDownloadPanelFiles } from "@/app/lib/drop/download/dropDownloadService";
import { getDropFinalReportPublicState } from "@/app/lib/drop/report/dropFinalReportService";
import { assertDropFeatureEnabled, getDropFeatureFlags } from "@/app/lib/drop/dropFeatureFlags";
import { getDropRuntimeHealth } from "@/app/lib/drop/dropRuntime";
import type { DropAccessGrant, DropAccessPurpose } from "@/app/lib/drop/dropTypes";
import DropBrand from "./DropBrand";
import DropCapabilityQuarantineUpload from "./DropCapabilityQuarantineUpload";
import DropSecureDownloadPanel from "./DropSecureDownloadPanel";
import DropDownloadPinGate from "./DropDownloadPinGate";
import { getDropPackageWorkflow } from "@/app/lib/drop/public/dropPublicRepository";
import { verifyDropDownloadProof } from "@/app/lib/drop/public/dropDownloadProof";
import { DROP_DOWNLOAD_PROOF_COOKIE } from "@/app/lib/drop/public/dropPublicSession";

const purposeContent: Record<DropAccessPurpose, {
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof ImageUp;
}> = {
  upload: {
    eyebrow: "Feltöltési jogosultság",
    title: "A meghívólink érvényes",
    description: "A feltöltési jogosultság ellenőrzése sikeres. A fájlok közvetlenül a privát DROP tárhelyre kerülnek, majd kötelező vírusellenőrzési karanténba lépnek.",
    icon: ImageUp,
  },
  view: {
    eyebrow: "Megtekintési jogosultság",
    title: "A Drop csomag megnyitható",
    description: "A hozzáférés ellenőrzése sikeres. A megtekinthető fájlok csak vírusellenőrzés és biztonsági kiadás után jelenhetnek meg.",
    icon: CheckCircle2,
  },
  download: {
    eyebrow: "Letöltési jogosultság",
    title: "A letöltési link érvényes",
    description: "A letöltési jogosultság ellenőrzése sikeres. Csak a teljes vírusellenőrzésen átment, SHA-256 ellenőrzőösszeggel lezárt fájlokhoz készül rövid életű letöltési hivatkozás.",
    icon: FileDown,
  },
  report: {
    eyebrow: "Riportjogosultság",
    title: "A riportlink érvényes",
    description: "A riportjogosultság ellenőrzése sikeres. Az elkészült végleges A4-es PDF-riport innen biztonságos, időkorlátos hivatkozással tölthető le.",
    icon: FileText,
  },
};

export default async function DropValidatedAccessPage({ rawToken, purpose }: { rawToken: string; purpose: DropAccessPurpose }) {
  const content = purposeContent[purpose];
  const Icon = content.icon;
  let grant: DropAccessGrant | null = null;
  let operationEnabled = false;
  let resumableUploadEnabled = false;
  let downloadFiles: Awaited<ReturnType<typeof getDropDownloadPanelFiles>> = [];
  let reportState: Awaited<ReturnType<typeof getDropFinalReportPublicState>> | null = null;
  let downloadPinRequired = false;
  let downloadPinVerified = false;
  let downloadWorkflow: Awaited<ReturnType<typeof getDropPackageWorkflow>> = null;
  let downloadTransferSummary: { senderName: string; subject: string; recipients: Array<{ name: string; email: string }>; showRecipients: boolean; senderMessage: string; packageNote: string; workflowType: string } | null = null;
  let accessError: { message: string; code: string } | null = null;

  try {
    assertDropFeatureEnabled("accessGateEnabled");
    grant = await validateDropAccessToken({ rawToken, expectedPurpose: purpose, headers: await headers() });
    const [flags, runtimeHealth] = await Promise.all([
      Promise.resolve(getDropFeatureFlags()),
      getDropRuntimeHealth(),
    ]);
    operationEnabled = purpose === "view"
      || (purpose === "report" && flags.pdfReportEnabled)
      || (purpose === "upload" && Boolean(runtimeHealth.readiness.quarantineUpload))
      || (purpose === "download" && Boolean(runtimeHealth.readiness.publicDownload));
    resumableUploadEnabled = Boolean(runtimeHealth.readiness.resumableUpload);
    if (purpose === "download" && operationEnabled) {
      downloadWorkflow = await getDropPackageWorkflow(grant.packageId);
      downloadPinRequired = Boolean(downloadWorkflow?.requireDownloadPin);
      const cookieStore = await cookies();
      downloadPinVerified = !downloadPinRequired || verifyDropDownloadProof(cookieStore.get(DROP_DOWNLOAD_PROOF_COOKIE)?.value, grant.packageId);
      if (downloadPinVerified) {
        const [panelFiles, packageRow, recipientRows] = await Promise.all([
          getDropDownloadPanelFiles(grant.packageId),
          findDropPackageById(grant.packageId),
          listDropRecipientsForPackage(grant.packageId),
        ]);
        downloadFiles = panelFiles;
        if (downloadWorkflow && packageRow) {
          downloadTransferSummary = {
            senderName: packageRow.uploader_name || "DIMPRO Drop feladó",
            subject: downloadWorkflow.subject || packageRow.title,
            recipients: recipientRows.map((recipient) => ({ name: recipient.name, email: recipient.email })),
            showRecipients: downloadWorkflow.showRecipientsOnDownload !== false,
            senderMessage: downloadWorkflow.senderMessage,
            packageNote: downloadWorkflow.packageNote,
            workflowType: downloadWorkflow.workflowType,
          };
        }
      }
    }
    if (purpose === "report" && operationEnabled) {
      reportState = await getDropFinalReportPublicState(grant.packageId);
    }
  } catch (error) {
    const candidate = error as { message?: string; code?: string } | null;
    accessError = {
      message: candidate?.message || "A hozzáférési hivatkozás hibás, lejárt vagy nem ehhez a művelethez tartozik.",
      code: candidate?.code || "DROP_ACCESS_DENIED",
    };
  }

  if (accessError || !grant) {
    return <DeniedAccess message={accessError?.message || "A hozzáférés nem ellenőrizhető."} code={accessError?.code || "DROP_ACCESS_DENIED"} />;
  }

  const enabledMessage = purpose === "download"
    ? "A biztonságos letöltési kapu aktív. Csak vírusellenőrzött fájlok jelennek meg."
    : purpose === "upload"
      ? "A feltöltési kapu aktív. A fájlok kötelező karantén- és vírusellenőrzési folyamatba kerülnek."
      : purpose === "report"
        ? "A riportkapu aktív. Csak a csomaghoz tartozó, friss végleges riport tölthető le."
        : "A hozzáférés érvényes és a csomag megtekinthető.";

  return (
    <main className="min-h-screen bg-[#eef4f8] px-5 py-8 text-slate-900 sm:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center">
        <div className="w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.10)]">
          <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_38%),linear-gradient(135deg,#f8fbfd,#eef7fa)] p-6 sm:p-8">
            <DropBrand />
            <div className="mt-8 grid h-16 w-16 place-items-center rounded-3xl border border-lime-200 bg-lime-50 text-lime-800 shadow-sm">
              <Icon size={30} aria-hidden="true" />
            </div>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.24em] text-cyan-700">{content.eyebrow}</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{content.title}</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">{content.description}</p>
          </div>
          <div className="p-6 sm:p-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Info label="Csomag" value={grant.title} />
              <Info label="Csomagkód" value={grant.publicCode} />
              <Info label="Csomagmód" value={grant.mode} />
              <Info label="Token" value={grant.tokenHint} />
            </div>
            <div className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 text-sm leading-6 ${operationEnabled ? "border-lime-200 bg-lime-50 text-lime-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
              {operationEnabled ? <CheckCircle2 className="mt-0.5 shrink-0" size={20} /> : <Construction className="mt-0.5 shrink-0" size={20} />}
              <p>{operationEnabled ? enabledMessage : "A token érvényes, de a kapcsolódó fájlművelet feature flag és biztonsági kapu miatt továbbra is inaktív."}</p>
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <Clock3 className="mt-0.5 shrink-0 text-cyan-700" size={20} />
              <p>A hozzáférési token lejárata: <strong>{new Date(grant.expiresAt).toLocaleString("hu-HU")}</strong>. A csomag lejárata: <strong>{new Date(grant.packageExpiresAt).toLocaleString("hu-HU")}</strong>.</p>
            </div>
            {purpose === "upload" && operationEnabled ? <DropCapabilityQuarantineUpload rawToken={rawToken} resumableEnabled={resumableUploadEnabled} /> : null}
            {purpose === "download" && operationEnabled && downloadPinRequired && !downloadPinVerified ? <DropDownloadPinGate rawToken={rawToken} /> : null}
            {purpose === "download" && operationEnabled && downloadPinVerified ? <DropSecureDownloadPanel rawToken={rawToken} files={downloadFiles} transfer={downloadTransferSummary} /> : null}
            {purpose === "report" && operationEnabled ? (
              <section className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 p-5">
                <div className="flex items-start gap-3"><FileText className="mt-0.5 shrink-0 text-teal-800" size={20} /><div><strong className="text-sm text-teal-950">Végleges PDF-riport</strong><p className="mt-1 text-xs leading-5 text-teal-900">{reportState?.note || "A végleges riport még nem érhető el."}</p></div></div>
                {reportState?.report?.fresh && reportState.report.downloadUrl ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-white p-4">
                    <div><strong className="text-sm text-slate-950">{reportState.report.pageCount || "-"} oldal · {reportState.report.fileSizeBytes ? `${Math.max(1, Math.round(reportState.report.fileSizeBytes / 1024))} KB` : "ismeretlen méret"}</strong><p className="mt-1 text-[11px] font-semibold text-slate-500">Készült: {reportState.report.generatedAt ? new Date(reportState.report.generatedAt).toLocaleString("hu-HU") : "-"}</p></div>
                    <a href={reportState.report.downloadUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-black text-white"><FileDown size={15} /> PDF-riport letöltése</a>
                  </div>
                ) : <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">A riport még készül, kézbesítésre vár, vagy a csomag új tartalma miatt újragenerálás szükséges.</p>}
              </section>
            ) : null}
            <Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">
              <ArrowLeft size={17} aria-hidden="true" /> Vissza a DIMPRO Drop kezdőlapra
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function DeniedAccess({ message, code }: { message: string; code: string }) {
  return (
    <main className="min-h-screen bg-[#eef4f8] px-5 py-8 text-slate-900 sm:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center">
        <div className="w-full rounded-[2rem] border border-rose-200 bg-white p-6 shadow-[0_30px_100px_rgba(15,23,42,0.10)] sm:p-8">
          <DropBrand />
          <div className="mt-8 grid h-16 w-16 place-items-center rounded-3xl border border-rose-200 bg-rose-50 text-rose-700"><ShieldAlert size={30} /></div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.24em] text-rose-700">Hozzáférés megtagadva</p>
          <h1 className="mt-3 text-3xl font-black text-slate-950">A hivatkozás nem használható</h1>
          <p className="mt-4 text-base leading-7 text-slate-600">{message}</p>
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><LockKeyhole className="mt-0.5 shrink-0" size={19} /><p>Hibakód: <strong>{code}</strong></p></div>
          <Link href="/open" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white"><ArrowLeft size={17} /> Csomagkód és PIN megadása</Link>
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><strong className="mt-2 block break-words text-sm text-slate-950">{value}</strong></div>;
}
