"use client";

import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Banknote, CircleDollarSign, ReceiptText, WalletCards } from "lucide-react";

const financeItems = [
  { title: "Bejövő számlák", Icon: ReceiptText },
  { title: "Kimenő számlák", Icon: ReceiptText },
  { title: "Díjbekérők", Icon: CircleDollarSign },
  { title: "Kifizetések", Icon: Banknote },
  { title: "Pénzügyi státuszok", Icon: WalletCards },
];

export default function FinancialRegistryPage() {
  return (
    <AppLayout>
      <div className="mb-7">
        <p className="text-sm font-medium text-slate-500">DIMPROVER modul</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Pénzügyi iktató</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Bejövő és kimenő számlák, díjbekérők, kifizetések és pénzügyi státuszok projektalapú nyilvántartása.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {financeItems.map((item) => {
          const Icon = item.Icon;
          return (
            <section key={item.title} className="rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-sm">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <Icon size={22} />
              </div>
              <h2 className="text-lg font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Előkészített modulhely a későbbi pénzügyi nyilvántartáshoz.</p>
            </section>
          );
        })}
      </div>
    </AppLayout>
  );
}
