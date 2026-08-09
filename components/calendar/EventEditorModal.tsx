"use client";

import type { CalendarEventInput } from "@/app/lib/calendar/types";
import { X } from "lucide-react";
import { eventToneOptions } from "./calendarDisplay";

export type CalendarFormState = CalendarEventInput;
export type CalendarModalState = {
  mode: "create" | "edit";
  eventId?: string;
  form: CalendarFormState;
} | null;

export function EventEditorModal({
  modal,
  onClose,
  onSave,
  onDelete,
  onChange,
  isSaving,
}: {
  modal: CalendarModalState;
  onClose: () => void;
  onSave: (form: CalendarFormState) => void;
  onDelete: () => void;
  onChange: (form: CalendarFormState) => void;
  isSaving: boolean;
}) {
  if (!modal) return null;

  const form = modal.form;

  function update<K extends keyof CalendarFormState>(
    key: K,
    value: CalendarFormState[K],
  ) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl border border-slate-300 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between border-b border-slate-200 bg-sky-50 px-5 py-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-700">
              {modal.mode === "create" ? "Új esemény" : "Esemény szerkesztése"}
            </div>
            <h3 className="mt-1 text-xl font-black text-slate-950">
              Heti szervező naptár
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50"
            aria-label="Bezárás"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
          <label className="md:col-span-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Esemény címe
            <input
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Kezdés
            <input
              type="datetime-local"
              value={form.start}
              onChange={(event) => update("start", event.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Befejezés
            <input
              type="datetime-local"
              value={form.end}
              onChange={(event) => update("end", event.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Típus
            <input
              value={form.meetingType}
              onChange={(event) => update("meetingType", event.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Résztvevő / felelős
            <input
              value={form.person}
              onChange={(event) => update("person", event.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Helyszín
            <input
              value={form.location}
              onChange={(event) => update("location", event.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Státusz
            <select
              value={form.status}
              onChange={(event) => update("status", event.target.value)}
              className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-500"
            >
              <option>Tervezett</option>
              <option>Folyamatban</option>
              <option>Lezárt</option>
              <option>Elhalasztva</option>
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Ismétlődés
            <select
              value={form.recurrence}
              onChange={(event) =>
                update(
                  "recurrence",
                  event.target.value as CalendarFormState["recurrence"],
                )
              }
              className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-500"
            >
              <option value="none">Nem ismétlődik</option>
              <option value="weekly">Hetente ismétlődik</option>
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Külső naptár
            <select
              value={form.externalProvider}
              onChange={(event) =>
                update(
                  "externalProvider",
                  event.target.value as CalendarFormState["externalProvider"],
                )
              }
              className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-500"
            >
              <option value="none">Nincs szinkron</option>
              <option value="google">Google Calendar</option>
              <option value="outlook">Outlook / Microsoft 365</option>
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Sync státusz
            <select
              value={form.syncStatus}
              onChange={(event) =>
                update(
                  "syncStatus",
                  event.target.value as CalendarFormState["syncStatus"],
                )
              }
              className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-500"
            >
              <option value="none">Nincs</option>
              <option value="pending">Függőben</option>
              <option value="synced">Szinkronizálva</option>
              <option value="failed">Hibás</option>
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Külső esemény ID
            <input
              value={form.externalEventId}
              onChange={(event) =>
                update("externalEventId", event.target.value)
              }
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Színjelölés
            <select
              value={form.className}
              onChange={(event) =>
                update(
                  "className",
                  event.target.value as CalendarFormState["className"],
                )
              }
              className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-500"
            >
              {eventToneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="md:col-span-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Leírás
            <textarea
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              rows={4}
              className="mt-1 w-full resize-none border border-slate-300 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-500"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onDelete}
            disabled={isSaving}
            className={`border border-red-200 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-red-700 hover:bg-red-50 ${modal.mode === "create" ? "invisible" : ""}`}
          >
            Törlés
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-100"
            >
              Mégse
            </button>
            <button
              type="button"
              onClick={() => onSave(form)}
              disabled={isSaving}
              className="border border-blue-700 bg-blue-700 px-5 py-2 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-blue-800"
            >
              {isSaving ? "Mentés..." : "Mentés"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
