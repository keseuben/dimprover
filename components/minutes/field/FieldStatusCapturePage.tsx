"use client"

import { useMemo, useRef, useState } from "react"

type CaptureMode = "quick" | "detailed"
type ListDensity = "detailed" | "compact" | "list"
type MobileStep = "basics" | "items" | "cooperation" | "attachments" | "export"
type SurveyNature = "Teljes körű" | "Részleges" | "Mintavételes" | "Célzott ellenőrzés"

type StatusPoint = {
  id: string
  serial: string
  title: string
  location: string
  trade: string
  state: string
  progress: number
  scheduleRelation: string
  contractor: string
  scheduleTask: string
  description: string
  cooperationNote: string
  cooperation: boolean
}

type QuickPhotoItem = {
  id: string
  serial: string
  location: string
  photoType: string
  note: string
  longNote: string
  cooperation: boolean
}

type StatusPhoto = {
  id: string
  itemId: string
  serial: string
  name: string
  type: string
  note: string
  url: string
  size: number
}

type PdfAttachment = {
  id: string
  name: string
  size: number
  note: string
}

type DeleteConfirmation =
  | { kind: "quick"; id: string; serial: string; title: string; photoCount: number }
  | { kind: "selectedQuick"; count: number; photoCount: number }
  | { kind: "status"; id: string; serial: string; title: string; photoCount: number }

const steps: { id: MobileStep; number: number; label: string; quickLabel: string; description: string }[] = [
  { id: "basics", number: 1, label: "Alapadatok", quickLabel: "Alap", description: "Projekt, dátum, rögzítés jellege" },
  { id: "items", number: 2, label: "Állapotpontok", quickLabel: "Fotók", description: "Fotók vagy részletes állapotpontok" },
  { id: "cooperation", number: 3, label: "Kooperáció", quickLabel: "Koop.", description: "Bemutatandó pontok kijelölése" },
  { id: "attachments", number: 4, label: "Mellékletek", quickLabel: "Mell.", description: "PDF tervek és háttéranyagok" },
  { id: "export", number: 5, label: "Export", quickLabel: "Export", description: "Ellenőrzés és PDF kimenetek" },
]

const locationOptions = ["A épület / földszint / főbejárat", "A épület / I. emelet", "A épület / lépcsőház", "A épület / tetőszint", "Külső terület"]
const tradeOptions = ["Burkolás", "Gépészet", "Villamosság", "Homlokzat", "Szerkezetépítés", "Külső rendezés"]
const stateOptions = ["Nem kezdődött el", "Folyamatban", "Elkészült", "Ellenőrizendő", "Eltérés látható"]
const scheduleOptions = ["Terv szerint", "Előrébb tart", "Kisebb csúszás", "Jelentős csúszás", "Nem értékelhető"]
const photoTypeOptions = ["Összkép", "Részletfotó", "Állapotfotó", "Kooperációs fotó", "Eltérés fotó", "Tervhez viszonyított fotó"]
const surveyNatures: SurveyNature[] = ["Teljes körű", "Részleges", "Mintavételes", "Célzott ellenőrzés"]

const initialStatusPoints: StatusPoint[] = [
  {
    id: "status-001",
    serial: "ÁR-001",
    title: "Burkolási munkák folyamatban a főbejáratnál",
    location: "A épület / földszint / főbejárat",
    trade: "Burkolás",
    state: "Folyamatban",
    progress: 65,
    scheduleRelation: "Terv szerint",
    contractor: "Generálkivitelező Kft.",
    scheduleTask: "A épület földszinti burkolási munkák",
    description: "A főbejárati előtér burkolása folyamatban van. A küszöbcsatlakozás kialakítása ellenőrzendő.",
    cooperationNote: "A küszöbcsatlakozás részletképzését kooperáción egyeztetni kell.",
    cooperation: true,
  },
  {
    id: "status-002",
    serial: "ÁR-002",
    title: "Lépcsőházi festés előkészítése",
    location: "A épület / lépcsőház",
    trade: "Befejező munkák",
    state: "Folyamatban",
    progress: 40,
    scheduleRelation: "Kisebb csúszás",
    contractor: "ALfa építőipar Kft.",
    scheduleTask: "Lépcsőházi felületképzés",
    description: "Glettelési javítások több szinten még folyamatban vannak.",
    cooperationNote: "A II. emeleti javítások ütemezésére visszajelzés szükséges.",
    cooperation: true,
  },
]

const initialQuickItems: QuickPhotoItem[] = [
  {
    id: "quick-001",
    serial: "FR-001",
    location: "A épület / földszint / külső burkolat",
    photoType: "Összkép",
    note: "Lábazati burkolat befejeződött.",
    longNote: "A lábazati burkolat elkészült, fugázás szemrevételezéssel rendben.",
    cooperation: false,
  },
  {
    id: "quick-002",
    serial: "FR-002",
    location: "A épület / 2. emelet / erkély",
    photoType: "Részletfotó",
    note: "Erkélykorlát rögzítése folyamatban.",
    longNote: "A rögzítési pontokat következő bejáráson vissza kell ellenőrizni.",
    cooperation: true,
  },
]

const initialPhotos: StatusPhoto[] = [
  { id: "photo-001", itemId: "quick-001", serial: "F-001", name: "lábazat-összkép.jpg", type: "Összkép", note: "Lábazati burkolat elkészült.", url: "", size: 0 },
  { id: "photo-002", itemId: "status-001", serial: "F-002", name: "fobejarat-burkolas.jpg", type: "Állapotfotó", note: "Burkolási munkák folyamatban.", url: "", size: 0 },
]

function formatFileSize(size: number) {
  if (!size) return "0 KB"
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function todayValue() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function StatusHeaderHexPattern() {
  const bands = [
    "left-[24%] -top-[170px] h-[340px] w-[340px] border-cyan-100/18",
    "left-[49%] -top-[205px] h-[410px] w-[410px] border-white/14",
    "right-[-70px] -top-[180px] h-[360px] w-[360px] border-cyan-200/16",
  ]

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">
      {bands.map((band) => (
        <div key={band} className={`absolute rotate-45 border ${band}`} />
      ))}
      <div className="absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(115deg,transparent,rgba(103,232,249,0.11),transparent)]" />
    </div>
  )
}

function BlueprintDiamond({ children = "D" }: { children?: React.ReactNode }) {
  return (
    <span className="relative inline-grid h-8 w-8 shrink-0 place-items-center">
      <span className="absolute inset-1 rotate-45 border border-cyan-100/55 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.08)]" />
      <span className="relative text-[10px] font-black uppercase tracking-tight text-slate-700">{children}</span>
    </span>
  )
}

function FieldInput({ label, value, onChange, placeholder, type = "text", helper }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; helper?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full border border-slate-200 bg-white/95 px-3 text-[16px] font-semibold text-slate-800 outline-none placeholder:text-slate-400 focus:border-cyan-500 md:text-sm"
      />
      {helper ? <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-400">{helper}</p> : null}
    </label>
  )
}

function FieldSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full border border-slate-200 bg-white/95 px-3 text-[16px] font-semibold text-slate-800 outline-none focus:border-cyan-500 md:text-sm"
      >
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  )
}

function FieldTextArea({ label, value, onChange, placeholder, minHeight = "min-h-28" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; minHeight?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${minHeight} w-full border border-slate-200 bg-white/95 px-3 py-3 text-[16px] font-semibold leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:border-cyan-500 md:text-sm`}
      />
    </label>
  )
}

function QuickButton({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-[82px] border border-cyan-200 bg-white/90 px-4 py-3 text-left shadow-sm transition active:scale-[0.99] hover:border-emerald-400 hover:bg-cyan-50">
      <div className="text-2xl leading-none">{value}</div>
      <div className="mt-2 text-xs font-black uppercase tracking-[0.1em] text-slate-600">{label}</div>
    </button>
  )
}

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "emerald" | "cyan" | "orange" | "red" }) {
  const classes = {
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    emerald: "border-cyan-200 bg-cyan-50 text-cyan-800",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    red: "border-red-200 bg-red-50 text-red-700",
  }
  return <span className={`border px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${classes[tone]}`}>{children}</span>
}

function StatCard({ value, label, tone = "slate" }: { value: string | number; label: string; tone?: "slate" | "emerald" | "cyan" | "orange" | "blue" }) {
  const classes = {
    slate: "border-slate-200 bg-white text-slate-950",
    emerald: "border-cyan-200 bg-cyan-50 text-cyan-800",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
  }
  return (
    <div className={`border px-3 py-2 text-center ${classes[tone]}`}>
      <div className="text-xl font-black">{value}</div>
      <div className="text-[10px] font-black uppercase tracking-[0.1em] opacity-80">{label}</div>
    </div>
  )
}


function DiagonalProgress({ value }: { value: number }) {
  return (
    <div className="relative h-2 overflow-hidden rounded-full border border-slate-300 bg-[repeating-linear-gradient(135deg,#eef4f1_0px,#eef4f1_7px,#dfe8e4_7px,#dfe8e4_14px)] shadow-inner">
      <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-emerald-600 transition-all duration-500" style={{ width: `${value}%` }} />
    </div>
  )
}

function ListDensityButton({ label, title, active, onClick }: { label: string; title: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} className={`grid h-8 w-8 place-items-center border text-[13px] font-black transition ${active ? "border-emerald-500 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-white hover:text-slate-700"}`}>
      {label}
    </button>
  )
}

export default function FieldStatusCapturePage({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<CaptureMode>("quick")
  const [activeStep, setActiveStep] = useState<MobileStep>("basics")
  const [project, setProject] = useState("Duna Part Lakópark")
  const [area, setArea] = useState("A épület")
  const [recordDate, setRecordDate] = useState(todayValue)
  const [recorder, setRecorder] = useState("Kovács Gáspár")
  const [surveyNature, setSurveyNature] = useState<SurveyNature>("Részleges")
  const [coverage, setCoverage] = useState(30)
  const [statusPoints, setStatusPoints] = useState<StatusPoint[]>(initialStatusPoints)
  const [quickItems, setQuickItems] = useState<QuickPhotoItem[]>(initialQuickItems)
  const [photos, setPhotos] = useState<StatusPhoto[]>(initialPhotos)
  const [attachments, setAttachments] = useState<PdfAttachment[]>([])
  const [activeStatusId, setActiveStatusId] = useState(initialStatusPoints[0].id)
  const [activeQuickId, setActiveQuickId] = useState(initialQuickItems[0].id)
  const [selectedQuickItemIds, setSelectedQuickItemIds] = useState<string[]>([])
  const [listDensity, setListDensity] = useState<ListDensity>("detailed")
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null)
  const [saveMessage, setSaveMessage] = useState("Automatikus mentés aktív")
  const [openRight, setOpenRight] = useState({ photos: true, attachments: false, export: true })
  const [showFillStatus, setShowFillStatus] = useState(true)
  const [showQuickActions, setShowQuickActions] = useState(true)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const pdfInputRef = useRef<HTMLInputElement | null>(null)

  const activeStatus = useMemo(() => statusPoints.find((item) => item.id === activeStatusId) ?? statusPoints[0], [activeStatusId, statusPoints])
  const activeQuick = useMemo(() => quickItems.find((item) => item.id === activeQuickId) ?? quickItems[0], [activeQuickId, quickItems])
  const activeItemId = mode === "quick" ? activeQuick?.id : activeStatus?.id
  const activePhotos = photos.filter((photo) => photo.itemId === activeItemId)
  const relevantItems = mode === "quick" ? quickItems : statusPoints
  const selectedQuickCount = selectedQuickItemIds.length
  const cooperationCount = mode === "quick" ? quickItems.filter((item) => item.cooperation).length : statusPoints.filter((item) => item.cooperation).length
  const recordedAverage = statusPoints.length ? Math.round(statusPoints.reduce((sum, item) => sum + item.progress, 0) / statusPoints.length) : 0
  const currentStepIndex = Math.max(0, steps.findIndex((step) => step.id === activeStep))
  const canPrev = currentStepIndex > 0
  const canNext = currentStepIndex < steps.length - 1

  const progressPercent = useMemo(() => {
    const basics = project && area && recordDate && recorder && surveyNature ? 1 : 0.35
    const items = relevantItems.length ? 1 : 0
    const coop = cooperationCount ? 1 : 0.35
    const attachment = attachments.length ? 1 : 0.6
    const exportReady = relevantItems.length && surveyNature ? 0.8 : 0
    return Math.round(((basics + items + coop + attachment + exportReady) / 5) * 100)
  }, [area, attachments.length, cooperationCount, project, recordDate, recorder, relevantItems.length, surveyNature])

  function updateStatusPoint(patch: Partial<StatusPoint>) {
    if (!activeStatus) return
    setStatusPoints((current) => current.map((item) => item.id === activeStatus.id ? { ...item, ...patch } : item))
    setSaveMessage("Állapotpont módosítva")
  }

  function updateQuickItem(patch: Partial<QuickPhotoItem>) {
    if (!activeQuick) return
    setQuickItems((current) => current.map((item) => item.id === activeQuick.id ? { ...item, ...patch } : item))
    setSaveMessage("Fotós tétel módosítva")
  }

  function toggleQuickItemSelection(itemId: string, checked: boolean) {
    setSelectedQuickItemIds((current) => checked ? Array.from(new Set([...current, itemId])) : current.filter((id) => id !== itemId))
  }

  function toggleAllQuickItems(checked: boolean) {
    setSelectedQuickItemIds(checked ? quickItems.map((item) => item.id) : [])
  }

  function performDeleteQuickItem(itemId: string) {
    const item = quickItems.find((entry) => entry.id === itemId)
    if (!item) return

    const nextItems = quickItems.filter((entry) => entry.id !== itemId)
    setQuickItems(nextItems)
    setPhotos((current) => current.filter((photo) => photo.itemId !== itemId))
    setSelectedQuickItemIds((current) => current.filter((id) => id !== itemId))

    if (activeQuickId === itemId) {
      setActiveQuickId(nextItems[0]?.id || "")
    }

    setSaveMessage(`${item.serial} törölve`)
  }

  function requestDeleteQuickItem(itemId: string) {
    const item = quickItems.find((entry) => entry.id === itemId)
    if (!item) return

    setDeleteConfirmation({
      kind: "quick",
      id: item.id,
      serial: item.serial,
      title: item.note || item.location || "Gyors fotós tétel",
      photoCount: photos.filter((photo) => photo.itemId === item.id).length,
    })
  }

  function performDeleteSelectedQuickItems() {
    if (!selectedQuickItemIds.length) {
      setSaveMessage("Nincs kijelölt fotós tétel törléshez")
      return
    }

    const selectedSet = new Set(selectedQuickItemIds)
    const deleteCount = quickItems.filter((item) => selectedSet.has(item.id)).length
    const nextItems = quickItems.filter((item) => !selectedSet.has(item.id))

    setQuickItems(nextItems)
    setPhotos((current) => current.filter((photo) => !selectedSet.has(photo.itemId)))
    setSelectedQuickItemIds([])

    if (activeQuickId && selectedSet.has(activeQuickId)) {
      setActiveQuickId(nextItems[0]?.id || "")
    }

    setSaveMessage(`${deleteCount} kijelölt fotós tétel törölve`)
  }

  function requestDeleteSelectedQuickItems() {
    if (!selectedQuickItemIds.length) {
      setSaveMessage("Nincs kijelölt fotós tétel törléshez")
      return
    }

    const selectedSet = new Set(selectedQuickItemIds)
    setDeleteConfirmation({
      kind: "selectedQuick",
      count: quickItems.filter((item) => selectedSet.has(item.id)).length,
      photoCount: photos.filter((photo) => selectedSet.has(photo.itemId)).length,
    })
  }

  function performDeleteStatusPoint(itemId: string) {
    const item = statusPoints.find((entry) => entry.id === itemId)
    if (!item) return

    const nextItems = statusPoints.filter((entry) => entry.id !== itemId)
    setStatusPoints(nextItems)
    setPhotos((current) => current.filter((photo) => photo.itemId !== itemId))

    if (activeStatusId === itemId) {
      setActiveStatusId(nextItems[0]?.id || "")
    }

    setSaveMessage(`${item.serial} törölve`)
  }

  function requestDeleteStatusPoint(itemId: string) {
    const item = statusPoints.find((entry) => entry.id === itemId)
    if (!item) return

    setDeleteConfirmation({
      kind: "status",
      id: item.id,
      serial: item.serial,
      title: item.title || item.location || "Állapotpont",
      photoCount: photos.filter((photo) => photo.itemId === item.id).length,
    })
  }

  function confirmDelete() {
    if (!deleteConfirmation) return

    if (deleteConfirmation.kind === "quick") {
      performDeleteQuickItem(deleteConfirmation.id)
    } else if (deleteConfirmation.kind === "selectedQuick") {
      performDeleteSelectedQuickItems()
    } else {
      performDeleteStatusPoint(deleteConfirmation.id)
    }

    setDeleteConfirmation(null)
  }

  function addStatusPoint() {
    const next = statusPoints.length + 1
    const item: StatusPoint = {
      id: `status-${String(next).padStart(3, "0")}`,
      serial: `ÁR-${String(next).padStart(3, "0")}`,
      title: "Új állapotpont",
      location: "",
      trade: "Burkolás",
      state: "Folyamatban",
      progress: 0,
      scheduleRelation: "Nem értékelhető",
      contractor: "",
      scheduleTask: "",
      description: "",
      cooperationNote: "",
      cooperation: false,
    }
    setStatusPoints((current) => [...current, item])
    setActiveStatusId(item.id)
    setMode("detailed")
    setActiveStep("items")
    setSaveMessage(`${item.serial} létrehozva`)
  }

  function addQuickItem() {
    const next = quickItems.length + 1
    const item: QuickPhotoItem = {
      id: `quick-${String(next).padStart(3, "0")}`,
      serial: `FR-${String(next).padStart(3, "0")}`,
      location: "",
      photoType: "Állapotfotó",
      note: "",
      longNote: "",
      cooperation: false,
    }
    setQuickItems((current) => [...current, item])
    setActiveQuickId(item.id)
    setMode("quick")
    setActiveStep("items")
    setSaveMessage(`${item.serial} létrehozva`)
  }

  function convertQuickItemToStatusPoint() {
    if (!activeQuick) return

    const next = statusPoints.length + 1
    const newStatusId = `status-${String(next).padStart(3, "0")}`
    const newSerial = `ÁR-${String(next).padStart(3, "0")}`
    const sourcePhotoCount = photos.filter((photo) => photo.itemId === activeQuick.id).length
    const titleFromQuickItem = activeQuick.note?.trim() || activeQuick.location?.trim() || "Gyors fotós tételből létrehozott állapotpont"

    const convertedStatusPoint: StatusPoint = {
      id: newStatusId,
      serial: newSerial,
      title: titleFromQuickItem,
      location: activeQuick.location,
      trade: "Burkolás",
      state: "Ellenőrizendő",
      progress: 0,
      scheduleRelation: "Nem értékelhető",
      contractor: "",
      scheduleTask: "",
      description: activeQuick.longNote || activeQuick.note,
      cooperationNote: activeQuick.cooperation ? activeQuick.note || activeQuick.longNote : "",
      cooperation: activeQuick.cooperation,
    }

    setStatusPoints((current) => [...current, convertedStatusPoint])
    setPhotos((current) => current.map((photo) => photo.itemId === activeQuick.id ? { ...photo, itemId: newStatusId, type: photo.type || activeQuick.photoType || "Állapotfotó" } : photo))
    setQuickItems((current) => current.filter((item) => item.id !== activeQuick.id))
    setSelectedQuickItemIds((current) => current.filter((id) => id !== activeQuick.id))
    setActiveStatusId(newStatusId)
    setMode("detailed")
    setActiveStep("items")
    setOpenRight((current) => ({ ...current, photos: true }))
    setSaveMessage(`${activeQuick.serial} átalakítva részletes állapotponttá: ${newSerial}${sourcePhotoCount ? ` · ${sourcePhotoCount} fotó áthelyezve` : ""}`)
  }

  function convertSelectedQuickItemsToStatusPoints() {
    const selectedItems = quickItems.filter((item) => selectedQuickItemIds.includes(item.id))
    if (!selectedItems.length) {
      setSaveMessage("Nincs kijelölt gyors fotós tétel")
      return
    }

    const convertedItems = selectedItems.map((item, index) => {
      const next = statusPoints.length + index + 1
      const newStatusId = `status-${String(next).padStart(3, "0")}`
      const newSerial = `ÁR-${String(next).padStart(3, "0")}`
      const titleFromQuickItem = item.note?.trim() || item.location?.trim() || "Gyors fotós tételből létrehozott állapotpont"

      const statusPoint: StatusPoint = {
        id: newStatusId,
        serial: newSerial,
        title: titleFromQuickItem,
        location: item.location,
        trade: "Burkolás",
        state: "Ellenőrizendő",
        progress: 0,
        scheduleRelation: "Nem értékelhető",
        contractor: "",
        scheduleTask: "",
        description: item.longNote || item.note,
        cooperationNote: item.cooperation ? item.note || item.longNote : "",
        cooperation: item.cooperation,
      }

      return { sourceId: item.id, statusPoint }
    })

    const idMap = new Map(convertedItems.map((entry) => [entry.sourceId, entry.statusPoint.id]))
    const firstConverted = convertedItems[0]?.statusPoint
    const movedPhotoCount = photos.filter((photo) => idMap.has(photo.itemId)).length

    setStatusPoints((current) => [...current, ...convertedItems.map((entry) => entry.statusPoint)])
    setPhotos((current) => current.map((photo) => {
      const targetId = idMap.get(photo.itemId)
      return targetId ? { ...photo, itemId: targetId } : photo
    }))
    setQuickItems((current) => current.filter((item) => !idMap.has(item.id)))
    setSelectedQuickItemIds([])

    if (firstConverted) setActiveStatusId(firstConverted.id)

    setMode("detailed")
    setActiveStep("items")
    setOpenRight((current) => ({ ...current, photos: true }))
    setSaveMessage(`${convertedItems.length} kijelölt fotós tétel részletes állapotponttá alakítva${movedPhotoCount ? ` · ${movedPhotoCount} fotó áthelyezve` : ""}`)
  }

  async function handlePhotoUpload(files: FileList | null) {
    if (!files?.length || !activeItemId) return
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/"))
    const dataUrls = await Promise.all(selected.map(readFileAsDataUrl))
    const nextPhotos = selected.map((file, index) => {
      const next = photos.length + index + 1
      return {
        id: `photo-${String(next).padStart(3, "0")}`,
        itemId: activeItemId,
        serial: `F-${String(next).padStart(3, "0")}`,
        name: file.name,
        type: mode === "quick" ? activeQuick?.photoType || "Állapotfotó" : "Állapotfotó",
        note: "",
        url: dataUrls[index] || "",
        size: file.size,
      }
    })
    setPhotos((current) => [...current, ...nextPhotos])
    setOpenRight((current) => ({ ...current, photos: true }))
    setActiveStep("items")
    setSaveMessage(`${nextPhotos.length} fotó hozzáadva`)
  }

  function handlePdfUpload(files: FileList | null) {
    if (!files?.length) return
    const selected = Array.from(files).filter((file) => file.type === "application/pdf")
    setAttachments((current) => [...current, ...selected.map((file, index) => ({ id: `pdf-${Date.now()}-${index}`, name: file.name, size: file.size, note: "" }))])
    setSaveMessage(`${selected.length} PDF melléklet hozzáadva`)
  }

  function markActiveForCooperation() {
    if (mode === "quick") updateQuickItem({ cooperation: true })
    else updateStatusPoint({ cooperation: true })
    setActiveStep("cooperation")
  }

  function exportPlaceholder(type: string) {
    setActiveStep("export")
    setSaveMessage(`${type} előkészítve · PDF generátor később bekötve`)
  }

  const mobileContentVisible = (step: MobileStep) => activeStep === step ? "block" : "hidden xl:block"

  return (
    <div className="min-w-0 overflow-hidden bg-[#f3f7fa] pb-16 text-slate-800 md:pb-0">
      <section className="border border-slate-200 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.055)]">
        <div className="sticky top-0 z-30 border-b border-cyan-500 bg-gradient-to-r from-[#0f2f46] via-[#0e7490] to-[#0891b2] px-3 py-2.5 text-white shadow-[0_6px_16px_rgba(8,145,178,0.18)] backdrop-blur sm:px-6 md:relative">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <button type="button" onClick={onBack} className="shrink-0 border border-white/25 bg-white/5 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-white hover:bg-white/10">← Lista</button>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-black tracking-tight text-white sm:text-3xl">Terepi állapotrögzítés</h1>
                <p className="mt-1 hidden text-sm font-semibold text-white/80 sm:block">Aktuális helyszíni állapotok, fotók, készültség és kooperációs bemutatópontok rögzítése.</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:w-[620px]">
              <select value={project} onChange={(event) => setProject(event.target.value)} className="h-10 border border-white/25 bg-white/12 px-3 text-[16px] font-bold text-white outline-none placeholder:text-white/45 focus:border-cyan-200 md:text-sm">
                <option>Duna Part Lakópark</option>
                <option>Metrodom Park</option>
              </select>
              <input value={area} onChange={(event) => setArea(event.target.value)} className="h-10 border border-white/25 bg-white/12 px-3 text-[16px] font-bold text-white outline-none placeholder:text-white/45 focus:border-cyan-200 md:text-sm" placeholder="Épület / munkaterület" />
              <input value={recordDate} onChange={(event) => setRecordDate(event.target.value)} className="h-10 border border-white/25 bg-white/12 px-3 text-[16px] font-bold text-white outline-none placeholder:text-white/45 focus:border-cyan-200 md:text-sm" type="date" />
            </div>
            <div className="hidden justify-end xl:flex">
              <span className="border border-white/25 bg-white/8 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white/90">Terepi állapot</span>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-white px-3 py-3 sm:px-6">
          <div className="mx-auto max-w-[1380px]">
            <div className="mb-4 flex items-center justify-center">
              <div className="grid w-full max-w-[680px] grid-cols-2 gap-2 border border-cyan-200 bg-white p-1 shadow-sm">
                <button type="button" onClick={() => { setMode("quick"); setActiveStep("items") }} className={`flex items-center justify-center gap-2 px-3 py-3 text-xs font-black uppercase tracking-[0.08em] transition ${mode === "quick" ? "bg-cyan-700 text-white" : "text-slate-600 hover:bg-cyan-50"}`}><span>📸</span> Gyors fotós rögzítés</button>
                <button type="button" onClick={() => { setMode("detailed"); setActiveStep("items") }} className={`flex items-center justify-center gap-2 px-3 py-3 text-xs font-black uppercase tracking-[0.08em] transition ${mode === "detailed" ? "bg-cyan-700 text-white" : "text-slate-600 hover:bg-cyan-50"}`}><span>☰</span> Részletes állapotrögzítés</button>
              </div>
            </div>

            <div className="xl:hidden">
              <div className="grid grid-cols-5 gap-0 overflow-x-auto">
                {steps.map((step, index) => {
                  const isActive = step.id === activeStep
                  const isDone = index < currentStepIndex
                  return (
                    <button key={step.id} type="button" onClick={() => setActiveStep(step.id)} className="grid min-w-[92px] grid-cols-1 justify-items-center gap-1 px-1 py-2 text-center sm:min-w-[145px] sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:justify-items-start sm:text-left">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-black transition ${isActive ? "border-cyan-700 bg-white text-cyan-800 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" : isDone ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-200 bg-white text-slate-400"}`}>{isDone ? "✓" : step.number}</span>
                      <span className="min-w-0"><span className={`block truncate text-[10px] font-black sm:text-xs ${isActive || isDone ? "text-slate-800" : "text-slate-400"}`}>{mode === "quick" ? step.quickLabel : step.label}</span><span className="mt-0.5 hidden truncate text-[10px] font-bold text-slate-500 sm:block">{step.description}</span></span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="hidden xl:block border border-cyan-200 bg-cyan-50/55 shadow-sm">
              <button type="button" onClick={() => setShowFillStatus((value) => !value)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-white/35">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-cyan-800">Kitöltési státusz</div>
                  <div className="mt-1 text-sm font-bold text-slate-500">Desktopon 3 oszlopos munkafelület, tableten adaptív hibrid, telefonon stepperes folyamat.</div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-right">
                  <div><div className="text-2xl font-black text-slate-950">{progressPercent}%</div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Előkészítettség</div></div>
                  <span className="grid h-8 w-8 place-items-center border border-slate-300 bg-white/80 text-xl font-black text-slate-600">{showFillStatus ? "−" : "+"}</span>
                </div>
              </button>
              <div className="px-4 pb-3"><DiagonalProgress value={progressPercent} /></div>
              {showFillStatus ? (
                <div className="grid grid-cols-5 gap-2 border-t border-cyan-200 px-4 py-3">
                  {steps.map((step, index) => <button key={step.id} type="button" onClick={() => setActiveStep(step.id)} className={`border px-3 py-2 text-left ${activeStep === step.id ? "border-emerald-300 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-white text-slate-600"}`}><div className="text-xs font-black uppercase tracking-[0.08em]">{index + 1}. {mode === "quick" && step.id === "items" ? "Fotók" : step.label}</div><div className="mt-0.5 truncate text-[11px] font-semibold opacity-80">{step.description}</div></button>)}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-white px-3 py-3 sm:px-6">
          <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-4 xl:grid-cols-5">
            {mode === "quick" ? <>
              <StatCard value={photos.length} label="Fotó" tone="emerald" />
              <StatCard value={quickItems.length} label="Fotós tétel" tone="cyan" />
              <StatCard value={cooperationCount} label="Kooperáció" tone="orange" />
              <StatCard value={`${coverage}%`} label="Felmérési lefedettség" tone="blue" />
              <div className="hidden xl:block"><StatCard value={surveyNature} label="Rögzítés jellege" /></div>
            </> : <>
              <StatCard value={statusPoints.length} label="Állapotpont" tone="emerald" />
              <StatCard value={`${recordedAverage}%`} label="Rögzített tételek átlaga" tone="cyan" />
              <StatCard value={`${coverage}%`} label="Felmérési lefedettség" tone="blue" />
              <StatCard value={cooperationCount} label="Kooperációs pont" tone="orange" />
              <div className="hidden xl:block"><StatCard value={photos.length} label="Fotó" /></div>
            </>}
          </div>
        </div>

        <div
          className="grid gap-4 p-3 sm:p-6 xl:grid-cols-[minmax(0,1fr)_420px]"
          style={{
            backgroundColor: "#ffffff",
            backgroundImage:
              "linear-gradient(rgba(15,23,42,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.025) 1px, transparent 1px), linear-gradient(rgba(14,165,233,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.035) 1px, transparent 1px)",
            backgroundSize: "40px 40px, 40px 40px, 160px 160px, 160px 160px",
          }}
        >
          <div className="space-y-4">
            <div className="border border-cyan-200 bg-cyan-50/55 shadow-sm">
              <button type="button" onClick={() => setShowQuickActions((value) => !value)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-cyan-50">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.1em] text-slate-700">Gyorsválasztó funkciók</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">Új tétel, fotó, galéria, megjegyzés és kooperációs jelölés.</div>
                </div>
                <span className="grid h-8 w-8 shrink-0 place-items-center border border-cyan-200 bg-cyan-50 text-xl font-black text-cyan-800">{showQuickActions ? "−" : "+"}</span>
              </button>
              {showQuickActions ? (
                <div className="grid gap-2 border-t border-emerald-100 p-3 sm:grid-cols-2 md:grid-cols-5">
                  <QuickButton label={mode === "quick" ? "Fotós tétel" : "Állapotpont"} value={mode === "quick" ? "+ 📸" : "+ 📍"} onClick={mode === "quick" ? addQuickItem : addStatusPoint} />
                  <QuickButton label="Fotó hozzáadása" value="+ 📷" onClick={() => cameraInputRef.current?.click()} />
                  <QuickButton label="Galéria" value="+ 🖼️" onClick={() => galleryInputRef.current?.click()} />
                  <QuickButton label="Megjegyzés" value="+ 📝" onClick={() => setActiveStep("items")} />
                  <QuickButton label="Kooperációra jelölés" value="+ 🤝" onClick={markActiveForCooperation} />
                </div>
              ) : null}
            </div>

            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { handlePhotoUpload(event.target.files); event.target.value = "" }} />
            <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { handlePhotoUpload(event.target.files); event.target.value = "" }} />
            <input ref={pdfInputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={(event) => { handlePdfUpload(event.target.files); event.target.value = "" }} />

            <div className={`${mobileContentVisible("basics")} border border-slate-300 bg-white/95 p-4 shadow-sm xl:block`}>
              <div className="mb-4 border-b border-slate-200 pb-3"><h2 className="text-sm font-black uppercase tracking-[0.1em] text-slate-700">Alapadatok és felmérési érvényesség</h2><p className="mt-1 text-xs font-semibold text-slate-500">A készültségi adatok nem projektkészültséget, hanem a rögzített tételeket jelölik.</p></div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FieldInput label="Rögzítő személy" value={recorder} onChange={setRecorder} placeholder="Név" />
                <FieldSelect label="Rögzítés jellege" value={surveyNature} options={surveyNatures} onChange={(value) => setSurveyNature(value as SurveyNature)} />
                <label className="block"><span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Felmérési lefedettség</span><input type="range" min={0} max={100} value={coverage} onChange={(event) => setCoverage(Number(event.target.value))} className="mt-2 w-full accent-cyan-600" /><div className="mt-2 text-sm font-black text-cyan-800">kb. {coverage}%</div></label>
                <div className="border border-orange-200 bg-orange-50 p-3 text-xs font-semibold leading-5 text-orange-800"><b className="block text-[11px] uppercase tracking-[0.1em]">PDF figyelmeztetés</b>A rögzített készültségi értékek tájékoztató jellegűek, és csak a bejárt/rögzített területekre vonatkoznak.</div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className={`${mobileContentVisible("items")} border border-slate-300 bg-white/95 shadow-sm`}>
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><h2 className="text-sm font-black uppercase tracking-[0.1em] text-slate-700">{mode === "quick" ? "Rögzített fotós tételek" : "Rögzített állapotpontok"}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{relevantItems.length} db rögzített tétel{mode === "quick" && selectedQuickCount ? ` · ${selectedQuickCount} kijelölve` : ""}</p></div>
                    <div className="flex shrink-0 items-center gap-1">
                      <ListDensityButton label="●" title="Részletes nézet" active={listDensity === "detailed"} onClick={() => setListDensity("detailed")} />
                      <ListDensityButton label="◐" title="Kompakt nézet" active={listDensity === "compact"} onClick={() => setListDensity("compact")} />
                      <ListDensityButton label="○" title="Lista nézet" active={listDensity === "list"} onClick={() => setListDensity("list")} />
                      <button type="button" onClick={mode === "quick" ? addQuickItem : addStatusPoint} className="ml-1 grid h-10 w-10 place-items-center border border-cyan-700 bg-cyan-700 text-2xl font-black leading-none text-white hover:bg-cyan-800" aria-label="Új tétel">+</button>
                    </div>
                  </div>
                  {mode === "quick" && quickItems.length ? <label className="mt-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500"><input type="checkbox" checked={selectedQuickCount === quickItems.length} onChange={(event) => toggleAllQuickItems(event.target.checked)} className="h-4 w-4 accent-cyan-600" />Összes kijelölése</label> : null}
                </div>

                <div className="max-h-[620px] overflow-auto">
                  {mode === "quick" ? quickItems.map((item) => {
                    const count = photos.filter((photo) => photo.itemId === item.id).length
                    const isSelected = selectedQuickItemIds.includes(item.id)
                    return <div key={item.id} className={`grid grid-cols-[32px_minmax(0,1fr)_32px] border-b border-slate-100 transition hover:bg-cyan-50 ${activeQuick?.id === item.id ? "bg-cyan-50" : "bg-white"}`}><label className="grid place-items-center border-r border-slate-100"><input type="checkbox" checked={isSelected} onChange={(event) => toggleQuickItemSelection(item.id, event.target.checked)} className="h-4 w-4 accent-cyan-600" aria-label={`${item.serial} kijelölése`} /></label><button type="button" onClick={() => { setActiveQuickId(item.id); setActiveStep("items") }} className={`w-full px-3 text-left transition active:bg-emerald-100 ${listDensity === "detailed" ? "py-4" : listDensity === "compact" ? "py-2" : "py-1"}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-black text-slate-900">{item.serial}</span><Badge tone={item.cooperation ? "orange" : "cyan"}>{item.cooperation ? "Kooperáció" : item.photoType}</Badge></div>{listDensity !== "list" ? <div className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-slate-800">{item.location || "Helyszín nincs megadva"}</div> : null}{listDensity === "detailed" ? <div className="mt-1 truncate text-xs font-semibold text-slate-500">{item.note || "Rövid megjegyzés nincs megadva"}</div> : null}<div className={`${listDensity === "list" ? "ml-2 inline" : "mt-2 block"} text-[11px] font-black uppercase tracking-[0.08em] text-slate-400`}>📸 {count}</div></button><button type="button" onClick={() => requestDeleteQuickItem(item.id)} className="grid place-items-center border-l border-slate-100 text-lg font-black text-red-500 hover:bg-red-50 hover:text-red-700" title="Fotós tétel törlése" aria-label={`${item.serial} törlése`}>×</button></div>
                  }) : statusPoints.map((item) => {
                    const count = photos.filter((photo) => photo.itemId === item.id).length
                    return <div key={item.id} className={`grid grid-cols-[minmax(0,1fr)_32px] border-b border-slate-100 transition hover:bg-cyan-50 ${activeStatus?.id === item.id ? "bg-cyan-50" : "bg-white"}`}><button type="button" onClick={() => { setActiveStatusId(item.id); setActiveStep("items") }} className={`w-full px-3 text-left transition active:bg-emerald-100 ${listDensity === "detailed" ? "py-4" : listDensity === "compact" ? "py-2" : "py-1"}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-black text-slate-900">{item.serial}</span><Badge tone={item.cooperation ? "orange" : item.scheduleRelation.includes("csúszás") ? "red" : "emerald"}>{item.cooperation ? "Kooperáció" : item.scheduleRelation}</Badge></div>{listDensity !== "list" ? <div className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-slate-800">{item.title}</div> : null}{listDensity === "detailed" ? <div className="mt-1 truncate text-xs font-semibold text-slate-500">📍 {item.location || "Helyszín nincs megadva"}</div> : null}<div className={`${listDensity === "list" ? "ml-2 inline" : "mt-2 flex"} items-center justify-between gap-2 text-[11px] font-black uppercase tracking-[0.08em]`}><span className="text-cyan-800">{item.progress}%</span><span className="text-slate-400">📸 {count}</span></div></button><button type="button" onClick={() => requestDeleteStatusPoint(item.id)} className="grid place-items-center border-l border-slate-100 text-lg font-black text-red-500 hover:bg-red-50 hover:text-red-700" title="Állapotpont törlése" aria-label={`${item.serial} törlése`}>×</button></div>
                  })}
                </div>
                {mode === "quick" ? (
                  <div className="border-t border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.08em] text-slate-600">
                      <span>{selectedQuickCount} kijelölt fotós tétel</span>
                      {selectedQuickCount ? <button type="button" onClick={() => setSelectedQuickItemIds([])} className="text-slate-400 hover:text-slate-700">Kijelölés törlése</button> : null}
                    </div>
                    <div className="grid gap-2">
                      <button type="button" onClick={convertSelectedQuickItemsToStatusPoints} disabled={!selectedQuickCount} className="w-full border border-cyan-700 bg-cyan-700 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-cyan-800 disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-400">Kijelöltek részletes állapotponttá alakítása</button>
                      <button type="button" onClick={requestDeleteSelectedQuickItems} disabled={!selectedQuickCount} className="w-full border border-red-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">Kijelöltek törlése</button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={`${mobileContentVisible("items")} border border-slate-300 bg-white/95 p-4 shadow-sm`}>
                {mode === "quick" && activeQuick ? <>
                  <div className="mb-4 flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black uppercase tracking-[0.12em] text-cyan-800">Aktív fotós tétel</div><h2 className="mt-1 text-2xl font-black text-slate-950">{activeQuick.serial}</h2></div><button type="button" onClick={markActiveForCooperation} className="border border-cyan-700 bg-cyan-700 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-cyan-800">Kooperációra jelöl</button></div>
                  <div className="grid gap-4 md:grid-cols-2"><FieldInput label="Helyszín" value={activeQuick.location} onChange={(value) => updateQuickItem({ location: value })} placeholder="Pl.: A épület / földszint" /><FieldSelect label="Fotó típusa" value={activeQuick.photoType} options={photoTypeOptions} onChange={(value) => updateQuickItem({ photoType: value })} /></div>
                  <div className="mt-4"><FieldInput label="Rövid megjegyzés" value={activeQuick.note} onChange={(value) => updateQuickItem({ note: value })} placeholder="1 soros megjegyzés" /></div>
                  <div className="mt-4"><FieldTextArea label="Bővebb leírás" value={activeQuick.longNote} onChange={(value) => updateQuickItem({ longNote: value })} placeholder="Opcionális részletesebb leírás" /></div>
                  <label className="mt-4 flex items-center gap-3 border border-orange-200 bg-orange-50 p-3 text-sm font-bold text-orange-800"><input type="checkbox" checked={activeQuick.cooperation} onChange={(event) => updateQuickItem({ cooperation: event.target.checked })} className="h-5 w-5 accent-cyan-600" />Kooperáción bemutatandó tétel</label>
                  <div className="mt-4 border border-cyan-200 bg-cyan-50 p-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.12em] text-cyan-700">Részletesíthető gyors tétel</div>
                    <p className="mt-2 text-sm font-semibold leading-5 text-cyan-950">A gyors fotós rögzítésből egy kattintással részletes állapotpont készíthető. A helyszín, megjegyzések, kooperációs jelölés és az aktív tétel fotói átkerülnek az új ÁR tételbe.</p>
                    <button type="button" onClick={convertQuickItemToStatusPoint} className="mt-3 w-full border border-cyan-700 bg-cyan-700 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-cyan-800">Részletes állapotponttá alakítás</button>
                  </div>
                </> : activeStatus ? <>
                  <div className="mb-4 flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black uppercase tracking-[0.12em] text-cyan-800">Aktív állapotpont</div><h2 className="mt-1 text-2xl font-black text-slate-950">{activeStatus.serial}</h2></div><div className="grid grid-cols-2 gap-2 sm:flex"><button type="button" onClick={() => setSaveMessage("Mentve · helyi vázlat")} className="border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50">Mentés</button><button type="button" onClick={markActiveForCooperation} className="border border-cyan-700 bg-cyan-700 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-cyan-800">Kooperációra jelöl</button></div></div>
                  <div className="grid gap-4 md:grid-cols-2"><FieldInput label="Állapotpont megnevezése" value={activeStatus.title} onChange={(value) => updateStatusPoint({ title: value })} placeholder="Pl.: Burkolási munkák folyamatban" /><FieldSelect label="Helyszín" value={activeStatus.location} options={["", ...locationOptions]} onChange={(value) => updateStatusPoint({ location: value })} /><FieldSelect label="Munkanem" value={activeStatus.trade} options={tradeOptions} onChange={(value) => updateStatusPoint({ trade: value })} /><FieldSelect label="Aktuális állapot" value={activeStatus.state} options={stateOptions} onChange={(value) => updateStatusPoint({ state: value })} />
                    <label className="block"><span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Készültség %</span><input type="range" min={0} max={100} value={activeStatus.progress} onChange={(event) => updateStatusPoint({ progress: Number(event.target.value) })} className="mt-2 w-full accent-cyan-600" /><div className="mt-2 text-sm font-black text-cyan-800">{activeStatus.progress}% · rögzített állapotpont alapján</div></label>
                    <FieldSelect label="Ütemtervhez képest" value={activeStatus.scheduleRelation} options={scheduleOptions} onChange={(value) => updateStatusPoint({ scheduleRelation: value })} /><FieldInput label="Érintett vállalkozó" value={activeStatus.contractor} onChange={(value) => updateStatusPoint({ contractor: value })} placeholder="Pl.: Generálkivitelező Kft." /><FieldInput label="Kapcsolódó ütemtervi feladat" value={activeStatus.scheduleTask} onChange={(value) => updateStatusPoint({ scheduleTask: value })} placeholder="Pl.: A épület burkolás" /></div>
                  <div className="mt-4"><FieldTextArea label="Leírás" value={activeStatus.description} onChange={(value) => updateStatusPoint({ description: value })} placeholder="Aktuális helyszíni állapot leírása" /></div>
                  <div className="mt-4"><FieldTextArea label="Kooperáción bemutatandó megjegyzés" value={activeStatus.cooperationNote} onChange={(value) => updateStatusPoint({ cooperationNote: value })} placeholder="Milyen döntés, visszajelzés vagy egyeztetés szükséges?" /></div>
                </> : null}
              </div>
            </div>

            <div className={`${mobileContentVisible("cooperation")} border border-slate-300 bg-white/95 p-4 shadow-sm xl:hidden`}>
              <h2 className="text-sm font-black uppercase tracking-[0.1em] text-slate-700">Kooperációra jelölt pontok</h2>
              <div className="mt-3 grid gap-2">{(mode === "quick" ? quickItems : statusPoints).map((item) => <label key={item.id} className="flex items-start gap-3 border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={item.cooperation} onChange={(event) => mode === "quick" ? setQuickItems((current) => current.map((x) => x.id === item.id ? { ...x, cooperation: event.target.checked } : x)) : setStatusPoints((current) => current.map((x) => x.id === item.id ? { ...x, cooperation: event.target.checked } : x))} className="mt-0.5 h-5 w-5 accent-cyan-600" /><span><b className="block text-slate-950">{item.serial}</b>{"title" in item ? item.title : item.note || item.location}</span></label>)}</div>
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <div className={`${activeStep === "export" ? "block" : "hidden xl:block"} overflow-hidden border border-cyan-200 bg-cyan-50/60 shadow-sm xl:sticky xl:top-4 xl:z-20 xl:shadow-lg`}>
              <div className="bg-gradient-to-r from-[#0f2f46] via-[#0e7490] to-[#0891b2] px-4 py-3 text-white"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-black uppercase tracking-[0.1em] text-white">Ellenőrzés / export</h2><p className="mt-1 text-xs font-semibold text-white/85">Készültség csak rögzített tételek alapján.</p></div><div className="text-right"><div className="text-2xl font-black text-emerald-100">{progressPercent}%</div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-white/80">kész</div></div></div></div>
              <div className="px-4 pt-3"><DiagonalProgress value={progressPercent} /></div>
              <div className="mx-4 mt-3 border border-orange-200 bg-orange-50 p-3 text-xs font-semibold leading-5 text-orange-800">A jelen állapotrögzítés a bejárás során megtekintett és rögzített munkaterületekre vonatkozik. Nem minősül teljes projektkészültségnek.</div>
              <div className="mx-4 mt-3 grid gap-2"><button type="button" onClick={() => exportPlaceholder("PDF állapotrögzítés")} className="border border-cyan-700 bg-cyan-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white hover:bg-cyan-800">PDF állapotrögzítés</button><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => exportPlaceholder("Kooperációs kivonat")} className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 hover:bg-white">Kooperációs kivonat</button><button type="button" onClick={() => exportPlaceholder("Fotódokumentáció export")} className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 hover:bg-white">Fotódokumentáció</button></div></div>
              <div className="mx-4 mt-3 border-t border-[#c8d2cd] pb-3 pt-2 text-[11px] font-bold text-slate-600">{saveMessage}</div>
            </div>

            <div className={`${activeStep === "items" ? "block" : "hidden xl:block"} border border-cyan-200 bg-cyan-50/55 shadow-sm`}>
              <button type="button" onClick={() => setOpenRight((current) => ({ ...current, photos: !current.photos }))} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-cyan-50"><span><span className="block text-sm font-black uppercase tracking-[0.1em] text-slate-700">Fotómelléklet</span><span className="mt-1 block text-xs font-semibold text-slate-500">Aktív tétel · {activePhotos.length} db fotó</span></span><span className="text-xl font-black text-cyan-800">{openRight.photos ? "−" : "+"}</span></button>
              {openRight.photos && <div className="border-t border-emerald-100 p-4"><button type="button" onClick={() => cameraInputRef.current?.click()} className="w-full border border-cyan-700 bg-cyan-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white hover:bg-cyan-800">Fotó hozzáadása</button><div className="mt-4 grid gap-2">{activePhotos.map((photo) => <div key={photo.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 border border-slate-200 bg-slate-50 p-2"><div className="grid h-14 place-items-center bg-white bg-cover bg-center text-2xl" style={photo.url ? { backgroundImage: `url(${photo.url})` } : undefined}>{!photo.url && "📸"}</div><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-xs font-black text-slate-900">{photo.serial}</span><Badge tone="cyan">{photo.type}</Badge></div><div className="mt-1 truncate text-xs font-semibold text-slate-500">{photo.name}</div><div className="mt-1 text-[11px] font-bold text-slate-400">{formatFileSize(photo.size)}</div></div></div>)}{!activePhotos.length && <div className="border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">Még nincs fotó az aktív tételhez.</div>}</div></div>}
            </div>

            <div className={`${activeStep === "attachments" ? "block" : "hidden xl:block"} border border-slate-300 bg-white/95 shadow-sm`}>
              <button type="button" onClick={() => setOpenRight((current) => ({ ...current, attachments: !current.attachments }))} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"><span><span className="block text-sm font-black uppercase tracking-[0.1em] text-slate-700">PDF tervek / mellékletek</span><span className="mt-1 block text-xs font-semibold text-slate-500">{attachments.length} db · opcionális</span></span><span className="text-xl font-black text-slate-500">{openRight.attachments ? "−" : "+"}</span></button>
              {openRight.attachments && <div className="border-t border-slate-100 p-4"><button type="button" onClick={() => pdfInputRef.current?.click()} className="w-full border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white hover:bg-slate-900">PDF terv csatolása</button><div className="mt-3 grid gap-2">{attachments.map((item) => <div key={item.id} className="border border-slate-200 bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><div className="truncate text-sm font-black text-slate-800">{item.name}</div><div className="text-xs font-bold text-slate-500">{formatFileSize(item.size)}</div></div><input value={item.note} onChange={(event) => setAttachments((current) => current.map((x) => x.id === item.id ? { ...x, note: event.target.value } : x))} placeholder="Megjegyzés a melléklethez" className="mt-2 h-10 w-full border border-slate-200 bg-white px-3 text-sm font-semibold outline-none placeholder:text-slate-400 focus:border-cyan-500" /></div>)}{!attachments.length && <div className="border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">Még nincs PDF terv csatolva.</div>}</div></div>}
            </div>
          </aside>
        </div>

        <div className="sticky bottom-[45px] z-30 border-t border-emerald-100 bg-white/95 px-3 py-2 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] xl:hidden">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><button type="button" onClick={() => canPrev && setActiveStep(steps[currentStepIndex - 1].id)} disabled={!canPrev} className="h-11 border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-[0.08em] text-slate-700 disabled:opacity-35">← Vissza</button><div className="text-center text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{currentStepIndex + 1} / {steps.length}</div><button type="button" onClick={() => canNext && setActiveStep(steps[currentStepIndex + 1].id)} disabled={!canNext} className="h-11 border border-cyan-700 bg-cyan-700 px-3 text-xs font-black uppercase tracking-[0.08em] text-white disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">Tovább →</button></div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-[80] grid grid-cols-5 border-t border-cyan-200 bg-white/95 text-center text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 shadow-[0_-10px_30px_rgba(15,23,42,0.16)] backdrop-blur md:hidden">
          {steps.map((step) => <button key={step.id} type="button" onClick={() => setActiveStep(step.id)} className={`px-2 py-3 ${activeStep === step.id ? "bg-cyan-50 text-cyan-800" : ""}`}>{mode === "quick" ? step.quickLabel : step.label}</button>)}
        </div>

        <button type="button" onClick={mode === "quick" ? addQuickItem : addStatusPoint} className="fixed bottom-16 right-4 z-[85] h-14 w-14 rounded-full bg-cyan-700 text-3xl font-black leading-none text-white shadow-[0_12px_30px_rgba(16,185,129,0.35)] md:hidden" aria-label="Új terepi állapotrögzítés">+</button>
      </section>

      {deleteConfirmation ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/45 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
          <div className="w-full max-w-[520px] border border-red-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.35)]">
            <div className="border-b border-red-100 bg-red-50 px-5 py-4">
              <div className="inline-flex border border-red-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-red-700">Törlés megerősítése</div>
              <h2 id="delete-confirm-title" className="mt-3 text-xl font-black text-slate-950">Biztosan törlöd?</h2>
              <p className="mt-1 text-sm font-semibold leading-5 text-slate-600">A törlés a kapcsolódó fotókat is eltávolítja ebből a rögzítésből.</p>
            </div>

            <div className="px-5 py-4">
              <div className="border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">Érintett tartalom</div>
                {deleteConfirmation.kind === "selectedQuick" ? (
                  <div className="mt-2 text-base font-black text-slate-900">{deleteConfirmation.count} kijelölt fotós tétel</div>
                ) : (
                  <div className="mt-2">
                    <div className="text-base font-black text-slate-900">{deleteConfirmation.serial}</div>
                    <div className="mt-1 line-clamp-2 text-sm font-semibold text-slate-600">{deleteConfirmation.title}</div>
                  </div>
                )}
                <div className="mt-3 text-xs font-bold text-red-700">Kapcsolódó fotók száma: {deleteConfirmation.photoCount} db</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => setDeleteConfirmation(null)} className="border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-100">Mégsem</button>
              <button type="button" onClick={confirmDelete} className="border border-red-700 bg-red-700 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-red-800">Törlés</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed left-3 right-3 top-3 z-[90] border border-cyan-200 bg-white/95 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-cyan-800 shadow-sm md:hidden">{saveMessage}</div>
    </div>
  )
}
