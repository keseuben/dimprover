"use client";

import React from "react";
import { CalendarDays, BarChart3, FileText } from "lucide-react";

type RightSidebarProps = {
  collapsed?: boolean;
  onOpen?: () => void;
};

export default function RightSidebar({
  collapsed = false,
  onOpen,
}: RightSidebarProps) {
  if (collapsed) {
    return (
      <aside className="h-full w-[72px] overflow-hidden bg-white px-3 py-16">
        <div className="flex flex-col items-center gap-4">
          <button
            title="Naptár"
            onClick={onOpen}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          >
            <CalendarDays size={19} />
          </button>

          <button
            title="Éves heti áttekintő"
            onClick={onOpen}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          >
            <BarChart3 size={19} />
          </button>

          <button
            title="Dokumentumstatisztika"
            onClick={onOpen}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          >
            <FileText size={19} />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="h-full w-[300px] overflow-y-auto bg-white px-5 py-7">
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Május 2026</h3>
          <CalendarDays size={18} className="text-slate-400" />
        </div>

        <div className="grid grid-cols-8 gap-2 text-center text-xs">
          <div className="font-medium text-slate-400">Hét</div>

          {["H", "K", "SZE", "CS", "P", "SZO", "V"].map((d) => (
            <div key={d} className="font-medium text-slate-400">
              {d}
            </div>
          ))}

          {[
            { week: 18, days: ["", "", "", "", "1", "2", "3"] },
            { week: 19, days: ["4", "5", "6", "7", "8", "9", "10"] },
            { week: 20, days: ["11", "12", "13", "14", "15", "16", "17"] },
            { week: 21, days: ["18", "19", "20", "21", "22", "23", "24"] },
            { week: 22, days: ["25", "26", "27", "28", "29", "30", "31"] },
          ].map((row) => (
            <React.Fragment key={row.week}>
              <div className="rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white">
                {row.week}
              </div>

              {row.days.map((day, index) => (
                <div
                  key={`${row.week}-${index}`}
                  className={`rounded-lg py-2 ${
                    day === "12"
                      ? "bg-slate-900 text-white"
                      : day
                      ? "text-slate-700 hover:bg-white"
                      : "text-slate-300"
                  }`}
                >
                  {day}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-5">
        <h3 className="mb-4 font-semibold text-slate-900">
          Éves heti áttekintő
        </h3>

        <div className="space-y-2 text-xs">
          {[
            { month: "JAN", weeks: [1, 2, 3, 4, 5] },
            { month: "FEB", weeks: [6, 7, 8, 9] },
            { month: "MÁRC", weeks: [10, 11, 12, 13] },
            { month: "ÁPR", weeks: [14, 15, 16, 17, 18] },
            { month: "MÁJ", weeks: [19, 20, 21, 22] },
            { month: "JÚN", weeks: [23, 24, 25, 26] },
            { month: "JÚL", weeks: [27, 28, 29, 30, 31] },
            { month: "AUG", weeks: [32, 33, 34, 35] },
            { month: "SZEPT", weeks: [36, 37, 38, 39] },
            { month: "OKT", weeks: [40, 41, 42, 43, 44] },
            { month: "NOV", weeks: [45, 46, 47, 48] },
            { month: "DEC", weeks: [49, 50, 51, 52, 53] },
          ].map((item) => (
            <div
              key={item.month}
              className="grid grid-cols-[48px_1fr] items-center gap-2"
            >
              <div className="text-[11px] font-semibold text-slate-500">
                {item.month}
              </div>

              <div className="flex flex-wrap gap-1">
                {item.weeks.map((week) => (
                  <div
                    key={week}
                    className={`flex h-7 min-w-7 items-center justify-center rounded-md text-[11px] font-medium ${
                      week === 20
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-700 shadow-sm"
                    }`}
                  >
                    {week}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-5">
        <h3 className="mb-4 font-semibold text-slate-900">
          Dokumentumstatisztika
        </h3>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Dokumentumok</span>
            <span className="font-medium">248 db</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-500">PDF</span>
            <span className="font-medium">132 db</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-500">Fotó</span>
            <span className="font-medium">86 db</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-500">Excel</span>
            <span className="font-medium">14 db</span>
          </div>

          <div className="border-t border-slate-200 pt-3">
            <div className="flex justify-between font-semibold">
              <span>Összes méret</span>
              <span>18,4 GB</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}