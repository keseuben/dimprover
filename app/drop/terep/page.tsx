import TerepAccessGate from "@/components/field-capture/TerepAccessGate";
import { getFieldCaptureFeatureState } from "@/app/lib/field-capture/featureFlags";

export const dynamic = "force-dynamic";

export default function TerepPage() {
  const state = getFieldCaptureFeatureState();
  if (!state.enabled) {
    return (
      <main className="min-h-[100dvh] bg-[#f3f8f8] px-4 py-10 text-slate-900">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-amber-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[.15em] text-amber-700">DIMPRO Drop · Terep</p>
          <h1 className="mt-2 text-2xl font-black">A Terep modul jelenleg nincs aktiválva</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">A modul a FIELD_CAPTURE_ENABLED feature flag bekapcsolása után használható.</p>
        </section>
      </main>
    );
  }
  return <TerepAccessGate />;
}
