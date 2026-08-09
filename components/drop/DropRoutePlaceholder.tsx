import Link from "next/link";
import { ArrowLeft, Construction, ShieldCheck } from "lucide-react";
import DropBrand from "./DropBrand";

export default function DropRoutePlaceholder({
  title,
  description,
  reference,
}: {
  title: string;
  description: string;
  reference?: string;
}) {
  return (
    <main className="min-h-screen bg-[#eef4f8] px-5 py-8 text-slate-900">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center">
        <div className="w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.10)]">
          <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_38%),linear-gradient(135deg,#f8fbfd,#eef7fa)] p-6 sm:p-8">
            <DropBrand />
            <div className="mt-8 grid h-16 w-16 place-items-center rounded-3xl border border-cyan-200 bg-white text-cyan-700 shadow-sm">
              <Construction size={30} aria-hidden="true" />
            </div>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.24em] text-cyan-700">Biztonságos előkészítési állapot</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{description}</p>
          </div>
          <div className="p-6 sm:p-8">
            {reference ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Hivatkozás: <strong className="break-all text-slate-900">{reference}</strong>
              </div>
            ) : null}
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-lime-200 bg-lime-50 p-4 text-sm leading-6 text-lime-950">
              <ShieldCheck className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
              <p>A rendszer nem fogad fájlt és nem dolgoz fel hozzáférési adatot, amíg a teljes backend, tárhely, adatkezelés és biztonsági tesztelés nincs kiadva.</p>
            </div>
            <Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">
              <ArrowLeft size={17} aria-hidden="true" /> Vissza a DIMPRO Drop kezdőlapra
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
