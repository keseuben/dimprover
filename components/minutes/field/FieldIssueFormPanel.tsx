import { useState } from "react"

import type { FieldIssue } from "./FieldIssueTypes"

type FieldIssueFormPanelProps = {
  activeIssue: FieldIssue
  recordDate: string
  severityOptions: string[]
  statusOptions: string[]
  companyOptions: string[]
  contactOptions: string[]
  locationOptions: string[]
  onUpdateActiveIssue: (patch: Partial<FieldIssue>) => void
  onSetSaveMessage: (message: string) => void
  onRequestIssueDelete: (issueId: string) => void
  onAddDeadlineDays: (days: number) => void
  projectName: string
  canPersistToCore: boolean
  syncing: boolean
  onPersistActiveIssue: () => void
  canPersistAttachments: boolean
  attachmentSyncing: boolean
  attachmentTotal: number
  attachmentSynced: number
  attachmentDirty: number
  driveError: string
  onSyncAttachments: () => void
}

type PresetField = "title" | "description" | "note"

const issueTitlePresets = [
  "Sérült burkolati él a bejáratnál",
  "Hiányzó vagy sérült szegélyelem",
  "Pontatlan nyílászáró beállítás",
  "Felületi repedés vagy vakolathiba",
  "Hiányzó tömítés vagy lezárás",
  "Nem megfelelő festési javítás",
  "Gépészeti áttörés hiányzik",
  "Elektromos kiállás nem a terv szerint készült",
  "Vízszigetelési hiányosság gyanúja",
  "Takarítás vagy építési törmelék eltávolítása szükséges",
]

const issueDescriptionPresets = [
  "A hibás rész javítása és fotós visszaellenőrzése szükséges.",
  "A kivitelezés nem felel meg a helyszíni elvárásnak, javítás szükséges.",
  "A hiba átadás előtt javítandó, felelős vállalkozó kijelölése szükséges.",
  "A sérült felület javítása után ismételt ellenőrzés szükséges.",
  "A hiányzó elem pótlása és dokumentált visszajelzés szükséges.",
  "A pontos javítási módot a felelős vállalkozóval egyeztetni kell.",
  "A javítás során a kapcsolódó szerkezetek védelméről gondoskodni kell.",
  "A hiba a következő kooperáción visszaellenőrzendő.",
  "A helyszíni állapot alapján további műszaki egyeztetés szükséges.",
  "A javítás elkészültét fotóval kell igazolni.",
]

const issueNotePresets = [
  "Egyeztetve a kivitelező képviselőjével.",
  "Átadás előtt kiemelten ellenőrizendő.",
  "A javítás csak munkaidőben végezhető.",
  "A terület megközelítése előzetes egyeztetést igényel.",
  "A javítás után takarítás szükséges.",
  "A hiba több szakágat is érinthet.",
  "A felelős vállalkozó visszajelzése szükséges.",
  "A határidő kooperáción véglegesítendő.",
  "A munka csak lezárt munkaterületen végezhető.",
  "A hibát a következő bejáráson ellenőrizni kell.",
]

function formatDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getWeekNumber(dateValue: string) {
  if (!dateValue) return "-"
  const date = new Date(`${dateValue}T00:00:00`)
  const firstThursday = new Date(date.getFullYear(), 0, 4)
  const day = firstThursday.getDay() || 7
  firstThursday.setDate(firstThursday.getDate() + 4 - day)
  const target = new Date(date)
  const targetDay = target.getDay() || 7
  target.setDate(target.getDate() + 4 - targetDay)
  return String(1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000))
}

function getDayDifference(fromDateValue: string, toDateValue: string) {
  if (!fromDateValue || !toDateValue) return 0
  const fromDate = new Date(`${fromDateValue}T00:00:00`)
  const toDate = new Date(`${toDateValue}T00:00:00`)
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000)
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  helper,
  type = "text",
  onBlur,
  inputClassName = "text-slate-800",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  helper?: string
  type?: string
  onBlur?: () => void
  inputClassName?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={`h-12 w-full border border-slate-300 bg-white/95 px-3 text-[16px] font-semibold outline-none placeholder:text-slate-400 focus:border-cyan-500 md:text-sm ${inputClassName}`}
      />
      {helper ? <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-400">{helper}</p> : null}
    </label>
  )
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full border border-slate-300 bg-white/95 px-3 text-[16px] font-semibold text-slate-800 outline-none focus:border-cyan-500 md:text-sm"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  )
}

function CompactLookupField({
  label,
  value,
  options,
  placeholder,
  helper,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  placeholder: string
  helper?: string
  onChange: (value: string) => void
}) {
  const isCustom = value && !options.includes(value)
  return (
    <div>
      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <div className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-2">
        <select
          value={isCustom ? "Egyéb / kézi megadás" : value || ""}
          onChange={(event) => {
            if (event.target.value === "Egyéb / kézi megadás") return
            onChange(event.target.value)
          }}
          className="h-11 border border-slate-200 bg-slate-50 px-2 text-[13px] font-bold text-slate-700 outline-none focus:border-cyan-500"
        >
          <option value="">Lista</option>
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-11 w-full border border-slate-300 bg-white/95 px-3 text-[16px] font-semibold text-slate-800 outline-none placeholder:text-slate-400 focus:border-cyan-500 md:text-sm"
        />
      </div>
      {helper ? <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-400">{helper}</p> : null}
    </div>
  )
}

function PresetStrip({
  label,
  options,
  onSelect,
}: {
  label: string
  options: string[]
  onSelect: (value: string) => void
}) {
  const [query, setQuery] = useState("")
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className="mb-2 border border-slate-200 bg-slate-50/80 p-2">
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label} mintaszövegek</div>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <label className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl font-black leading-none text-slate-500">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Keresés mintaszövegben"
            className="h-10 w-full border border-slate-300 bg-white pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-cyan-500"
          />
        </label>
        <select
          value=""
          onChange={(event) => {
            if (!event.target.value) return
            onSelect(event.target.value)
            setQuery("")
          }}
          className="h-10 border border-cyan-200 bg-white px-3 text-sm font-bold text-cyan-900 outline-none focus:border-cyan-500"
        >
          <option value="">Válassz mintaszöveget...</option>
          {filteredOptions.map((option, index) => (
            <option key={option} value={option}>{index + 1}. {option}</option>
          ))}
        </select>
      </div>
      {!filteredOptions.length ? <div className="mt-1 text-[11px] font-semibold text-slate-400">Nincs találat. Később adatbázisból is bővíthető lesz.</div> : null}
    </div>
  )
}

export default function FieldIssueFormPanel({
  activeIssue,
  recordDate,
  severityOptions,
  statusOptions,
  companyOptions,
  contactOptions,
  locationOptions,
  onUpdateActiveIssue,
  onAddDeadlineDays,
  projectName,
  canPersistToCore,
  syncing,
  onPersistActiveIssue,
  canPersistAttachments,
  attachmentSyncing,
  attachmentTotal,
  attachmentSynced,
  attachmentDirty,
  driveError,
  onSyncAttachments,
}: FieldIssueFormPanelProps) {
  const [presetFields, setPresetFields] = useState<Partial<Record<PresetField, boolean>>>({})

  function applyPreset(field: PresetField, value: string) {
    onUpdateActiveIssue({ [field]: value } as Partial<FieldIssue>)
    setPresetFields((current) => ({ ...current, [field]: true }))
  }

  function handleFieldChange(field: PresetField, value: string) {
    onUpdateActiveIssue({ [field]: value } as Partial<FieldIssue>)
    setPresetFields((current) => ({ ...current, [field]: false }))
  }

  function confirmPresetField(field: PresetField) {
    if (!presetFields[field]) return
    setPresetFields((current) => ({ ...current, [field]: false }))
  }

  return (
    <div className="border border-slate-300 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.12em] text-cyan-800">Aktív hiba</div>
          <h2 className="mt-1 text-2xl font-black text-slate-950">{activeIssue.serial}</h2>
        </div>
        <div className={`border px-3 py-2 text-right ${activeIssue.syncState === "ERROR" ? "border-rose-200 bg-rose-50" : activeIssue.coreIssueId ? "border-emerald-200 bg-emerald-50" : "border-cyan-200 bg-cyan-50/70"}`}>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">Project Issue Core</div>
          <div className="mt-0.5 text-sm font-black text-slate-800">
            {activeIssue.coreSerial ? `${activeIssue.coreSerial} · v${activeIssue.coreVersion || 1}` : "Helyi terepi vázlat"}
          </div>
          <div className="mt-0.5 text-[10px] font-bold text-slate-500">
            {activeIssue.syncState === "SYNCING" ? "Központi mentés folyamatban…" : activeIssue.syncState === "DIRTY" ? "Helyi változás · újramentés szükséges" : activeIssue.syncState === "ERROR" ? "Mentési hiba" : activeIssue.syncState === "SYNCED" ? "Központi HJ szinkronban" : "Még nincs központi HJ"}
          </div>
        </div>
      </div>

      <div data-field-core-sync className={`mb-4 border p-3 ${activeIssue.syncState === "ERROR" ? "border-rose-200 bg-rose-50" : "border-cyan-200 bg-cyan-50/55"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-800">Központi Hibajegyzék · {projectName}</div>
            <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-600">
              {activeIssue.coreIssueId ? "A terepi tétel már központi HJ. A gomb a helyi változásokat verzióvédetten frissíti." : "A gomb központi HJ-azonosítót készít. A fotó- és tervkapcsolatok helyi munkapéldánya megmarad."}
            </p>
            {activeIssue.syncError ? <p className="mt-1 text-[11px] font-bold text-rose-700">{activeIssue.syncError}</p> : null}
          </div>
          <button
            type="button"
            onClick={onPersistActiveIssue}
            disabled={!canPersistToCore || syncing || !activeIssue.title.trim()}
            className="min-h-11 shrink-0 border border-cyan-700 bg-cyan-700 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
          >
            {syncing ? "HJ mentése…" : activeIssue.coreIssueId ? "Központi HJ frissítése" : "Központi HJ mentése"}
          </button>
        </div>
        {!canPersistToCore ? <div className="mt-2 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700">Csak olvasás · issue.write jogosultság szükséges</div> : null}
      </div>

      <div data-field-attachment-sync="0.4.0" className="mb-4 border border-emerald-200 bg-emerald-50/55 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-800">HJ mellékletek · DIMPRO Drive</div>
            <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-600">
              Fotók és tervkapcsolatok valódi Drive dokumentumhoz/verzióhoz kapcsolódnak. A fizikai fájl nem kerül a HJ adatbázisába.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.07em]">
              <span className="border border-slate-200 bg-white px-2 py-1 text-slate-600">Összes: {attachmentTotal}</span>
              <span className="border border-emerald-200 bg-white px-2 py-1 text-emerald-700">Szinkron: {attachmentSynced}</span>
              <span className={`border bg-white px-2 py-1 ${attachmentDirty ? "border-amber-200 text-amber-700" : "border-slate-200 text-slate-500"}`}>Frissítendő/hiba: {attachmentDirty}</span>
            </div>
            {driveError ? <p className="mt-2 text-[11px] font-bold text-rose-700">Drive: {driveError}</p> : null}
          </div>
          <button
            type="button"
            onClick={onSyncAttachments}
            disabled={!activeIssue.coreIssueId || !canPersistAttachments || attachmentSyncing || attachmentTotal === 0}
            className="min-h-11 shrink-0 border border-emerald-700 bg-emerald-700 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
          >
            {attachmentSyncing ? "Mellékletek mentése…" : "HJ mellékletek szinkronizálása"}
          </button>
        </div>
        {!activeIssue.coreIssueId ? <div className="mt-2 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700">Előbb készíts központi HJ-t.</div> : null}
        {activeIssue.coreIssueId && !canPersistAttachments ? <div className="mt-2 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700">issue.write + document.read + document.write jogosultság szükséges.</div> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <PresetStrip label="Hiba megnevezése" options={issueTitlePresets} onSelect={(value) => applyPreset("title", value)} />
          <FieldInput label="Hiba megnevezése" value={activeIssue.title} onChange={(value) => handleFieldChange("title", value)} onBlur={() => confirmPresetField("title")} inputClassName={presetFields.title ? "text-slate-400" : "text-slate-800"} placeholder="Pl.: Sérült burkolati él a bejáratnál" helper="Rövid, konkrét cím: mi a hiba és hol látható." />
        </div>
        <CompactLookupField label="Helyszín" value={activeIssue.location} options={locationOptions} onChange={(value) => onUpdateActiveIssue({ location: value })} placeholder="Pl.: A épület / földszint / főbejárat" helper="Épület, szint, helyiség vagy pontos terepi pozíció." />
        <FieldSelect label="Súlyosság" value={activeIssue.severity} options={severityOptions} onChange={(value) => onUpdateActiveIssue({ severity: value })} />
        <FieldSelect label="Státusz" value={activeIssue.status} options={statusOptions} onChange={(value) => onUpdateActiveIssue({ status: value })} />
        <CompactLookupField label="Érintett vállalkozó" value={activeIssue.responsible} options={companyOptions} onChange={(value) => onUpdateActiveIssue({ responsible: value })} placeholder="Pl.: Generálkivitelező Kft." helper="Az a cég vagy vállalkozó, akinek a hibát javítania vagy kezelnie kell." />
        <CompactLookupField label="Érintett személy / kapcsolattartó" value={activeIssue.contractorRepresentative} options={contactOptions} onChange={(value) => onUpdateActiveIssue({ contractorRepresentative: value })} placeholder="Pl.: Kovács Péter művezető" helper="A vállalkozó részéről érintett vagy aláírásra jogosult személy." />
        <div>
          <FieldInput label="Határidő" value={activeIssue.deadline} onChange={(value) => onUpdateActiveIssue({ deadline: value })} type="date" />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
            <button type="button" onClick={() => onAddDeadlineDays(3)} className="border border-cyan-200 bg-cyan-50 px-2 py-1 font-black uppercase text-cyan-800">+3 nap</button>
            <button type="button" onClick={() => onAddDeadlineDays(7)} className="border border-cyan-200 bg-cyan-50 px-2 py-1 font-black uppercase text-cyan-800">+7 nap</button>
            <button type="button" onClick={() => onUpdateActiveIssue({ deadline: recordDate || formatDateValue(new Date()) })} className="border border-slate-200 bg-slate-50 px-2 py-1 font-black uppercase text-slate-600">Jkv. napja</button>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
            <span>Jkv. hét: {getWeekNumber(recordDate)}</span>
            <span>Határidő hét: {getWeekNumber(activeIssue.deadline)}</span>
            <span>Eltérés: {getDayDifference(recordDate, activeIssue.deadline)} nap</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <PresetStrip label="Leírás" options={issueDescriptionPresets} onSelect={(value) => applyPreset("description", value)} />
        <label className="block">
          <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Leírás</span>
          <textarea
            value={activeIssue.description}
            onChange={(event) => handleFieldChange("description", event.target.value)}
            onBlur={() => confirmPresetField("description")}
            className={`min-h-32 w-full border border-slate-300 bg-white/95 px-3 py-3 text-[16px] font-semibold leading-6 outline-none placeholder:text-slate-400 focus:border-cyan-500 md:text-sm ${presetFields.description ? "text-slate-400" : "text-slate-800"}`}
            placeholder="Pl.: A küszöbnél lepattant a burkolati él. Javítás és fotós visszaellenőrzés szükséges."
          />
        </label>
      </div>

      <div className="mt-4">
        <PresetStrip label="Megjegyzés" options={issueNotePresets} onSelect={(value) => applyPreset("note", value)} />
        <label className="block">
          <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Megjegyzés</span>
          <textarea
            value={activeIssue.note}
            onChange={(event) => handleFieldChange("note", event.target.value)}
            onBlur={() => confirmPresetField("note")}
            className={`min-h-24 w-full border border-slate-300 bg-white/95 px-3 py-3 text-[16px] font-semibold leading-6 outline-none placeholder:text-slate-400 focus:border-cyan-500 md:text-sm ${presetFields.note ? "text-slate-400" : "text-slate-800"}`}
            placeholder="Pl.: Átadás előtt javítandó. Egyeztetve a kivitelező képviselőjével."
          />
        </label>
      </div>
    </div>
  )
}