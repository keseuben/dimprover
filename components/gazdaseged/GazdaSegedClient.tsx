"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ComponentType, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CloudUpload,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  Home,
  Layers3,
  ListChecks,
  Package,
  PawPrint,
  Plus,
  Printer,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sprout,
  Syringe,
  Tractor,
  Trash2,
  Users,
  Warehouse,
  X,
} from "lucide-react";

type RoleKey = "admin" | "manager" | "worker";
type ViewKey = "dashboard" | "daily" | "animals" | "machines" | "warehouse" | "photos" | "exports" | "settings";
type TaskStatus = "Nyitott" | "Folyamatban" | "Kész";
type MovementType = "Bevét" | "Kiadás" | "Áthelyezés" | "Leltár korrekció";

type WorkLog = {
  id: string;
  date: string;
  activity: string;
  field: string;
  crop: string;
  worker: string;
  areaHa: string;
  hours: string;
  machine: string;
  material: string;
  note: string;
  offline: boolean;
};

type AnimalRecord = {
  id: string;
  tag: string;
  species: string;
  group: string;
  status: string;
  lastEvent: string;
};

type AnimalEvent = {
  id: string;
  date: string;
  animalTag: string;
  eventType: string;
  quantity: string;
  unit: string;
  responsible: string;
  note: string;
};

type MachineRecord = {
  id: string;
  name: string;
  type: string;
  status: string;
  hourMeter: string;
};

type MachineLog = {
  id: string;
  date: string;
  machine: string;
  eventType: string;
  driver: string;
  startHour: string;
  endHour: string;
  fuelLiter: string;
  field: string;
  note: string;
};

type StockItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentStock: string;
  minStock: string;
  location: string;
};

type StockMovement = {
  id: string;
  date: string;
  itemName: string;
  type: MovementType;
  quantity: string;
  unit: string;
  partner: string;
  document: string;
  note: string;
};

type PhotoRecord = {
  id: string;
  date: string;
  module: string;
  subject: string;
  fileName: string;
  description: string;
  location: string;
  dataUrl?: string;
};

type FarmTask = {
  id: string;
  title: string;
  dueDate: string;
  owner: string;
  status: TaskStatus;
  area: string;
};

type FarmProfile = {
  name: string;
  owner: string;
  settlement: string;
  taxNumber: string;
  phone: string;
  email: string;
};

type WorkerUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: RoleKey;
  status: "Aktív" | "Inaktív";
};

type FieldRecord = {
  id: string;
  name: string;
  crop: string;
  areaHa: string;
  location: string;
  note: string;
};

type SyncState = {
  mode: "Helyi MVP" | "Felhő előkészítve";
  lastSyncAt: string;
  pendingCount: number;
  statusNote: string;
};

type AppState = {
  role: RoleKey;
  workLogs: WorkLog[];
  animals: AnimalRecord[];
  animalEvents: AnimalEvent[];
  machines: MachineRecord[];
  machineLogs: MachineLog[];
  stockItems: StockItem[];
  stockMovements: StockMovement[];
  photos: PhotoRecord[];
  tasks: FarmTask[];
  farmProfile: FarmProfile;
  workers: WorkerUser[];
  fields: FieldRecord[];
  syncState: SyncState;
};

const storageKey = "dimpro-gazdaseged-suite-v2";

const todayIso = () => new Date().toISOString().slice(0, 10);

const initialState: AppState = {
  role: "admin",
  workLogs: [
    { id: "w-1", date: "2026-07-06", activity: "Permetezés", field: "Felső-dűlő 12.", crop: "Búza", worker: "Nagy Zoltán", areaHa: "18", hours: "3,5", machine: "John Deere 6120M", material: "Gyomirtó szer", note: "Szél gyenge volt, munka elvégezve.", offline: true },
    { id: "w-2", date: "2026-07-05", activity: "Szállítás", field: "Gépudvar", crop: "", worker: "Kovács Péter", areaHa: "", hours: "2", machine: "MTZ 82", material: "Takarmány", note: "Istállóhoz beszállítva.", offline: false },
  ],
  animals: [
    { id: "a-1", tag: "HU 1234567890", species: "Szarvasmarha", group: "1. istálló", status: "Aktív", lastEvent: "Ellés / születés" },
    { id: "a-2", tag: "HU 9876543210", species: "Szarvasmarha", group: "2. istálló", status: "Aktív", lastEvent: "Oltás" },
    { id: "a-3", tag: "JUH 4451", species: "Juh", group: "Anyajuh csoport", status: "Megfigyelés", lastEvent: "Kezelés" },
  ],
  animalEvents: [
    { id: "ae-1", date: "2026-07-06", animalTag: "HU 1234567890", eventType: "Ellés / születés", quantity: "1", unit: "db", responsible: "Kovács Péter", note: "Egészséges borjú." },
    { id: "ae-2", date: "2026-07-05", animalTag: "HU 9876543210", eventType: "Oltás", quantity: "1", unit: "adag", responsible: "Szabó Anna", note: "Éves oltás rögzítve." },
  ],
  machines: [
    { id: "m-1", name: "John Deere 6120M", type: "Traktor", status: "Használható", hourMeter: "1842" },
    { id: "m-2", name: "MTZ 82", type: "Traktor", status: "Karbantartásra figyelni", hourMeter: "5240" },
    { id: "m-3", name: "Vontatott permetező", type: "Permetező", status: "Használható", hourMeter: "" },
  ],
  machineLogs: [
    { id: "ml-1", date: "2026-07-06", machine: "John Deere 6120M", eventType: "Géphasználat", driver: "Nagy Zoltán", startHour: "1842", endHour: "1845,5", fuelLiter: "32", field: "Felső-dűlő 12.", note: "Permetezési munka." },
  ],
  stockItems: [
    { id: "s-1", name: "Műtrágya", category: "Anyag", unit: "kg", currentStock: "1200", minStock: "300", location: "Fő raktár" },
    { id: "s-2", name: "Takarmány", category: "Takarmány", unit: "kg", currentStock: "820", minStock: "250", location: "Takarmány tároló" },
    { id: "s-3", name: "Gyomirtó szer", category: "Növényvédőszer", unit: "liter", currentStock: "46", minStock: "10", location: "Vegyszerszekrény" },
  ],
  stockMovements: [
    { id: "sm-1", date: "2026-07-05", itemName: "Műtrágya", type: "Bevét", quantity: "1200", unit: "kg", partner: "Beszállító Kft.", document: "SZL-2026-071", note: "Szállítólevél alapján." },
  ],
  photos: [
    { id: "p-1", date: "2026-07-06", module: "Állattartás", subject: "HU 1234567890", fileName: "borju_20260706.jpg", description: "Ellés utáni állapotfotó.", location: "1. istálló" },
  ],
  tasks: [
    { id: "task-1", title: "Borjú ellenőrzés", dueDate: "2026-07-06", owner: "Kovács Péter", status: "Nyitott", area: "1. istálló" },
    { id: "task-2", title: "Permetező gép mosása", dueDate: "2026-07-06", owner: "Nagy Zoltán", status: "Folyamatban", area: "Gépudvar" },
  ],
  farmProfile: {
    name: "Demo Gazdaság",
    owner: "Gazda Admin",
    settlement: "Püspökladány",
    taxNumber: "-",
    phone: "",
    email: "",
  },
  workers: [
    { id: "u-1", name: "Gazda Admin", email: "admin@gazdasag.hu", phone: "", role: "admin", status: "Aktív" },
    { id: "u-2", name: "Kovács Péter", email: "peter@gazdasag.hu", phone: "", role: "manager", status: "Aktív" },
    { id: "u-3", name: "Nagy Zoltán", email: "zoltan@gazdasag.hu", phone: "", role: "worker", status: "Aktív" },
  ],
  fields: [
    { id: "f-1", name: "Felső-dűlő 12.", crop: "Búza", areaHa: "18", location: "Püspökladány külterület", note: "Permetezéshez és aratáshoz használt tábla." },
    { id: "f-2", name: "Alsó-rét", crop: "Kukorica", areaHa: "11,5", location: "Telephely mellett", note: "Öntözés figyelése." },
  ],
  syncState: {
    mode: "Helyi MVP",
    lastSyncAt: "Még nem történt szinkron",
    pendingCount: 2,
    statusNote: "A demo adatok localStorage-ben vannak. A gombok működnek, szerveres szinkron a következő backend kör.",
  },
};

const roles: Record<RoleKey, { label: string; description: string; allowed: ViewKey[] }> = {
  admin: { label: "Gazda Admin", description: "Teljes hozzáférés minden modulhoz, exporthoz és beállításhoz.", allowed: ["dashboard", "daily", "animals", "machines", "warehouse", "photos", "exports", "settings"] },
  manager: { label: "Telepvezető", description: "Operatív rögzítés, feladatkövetés, állattartás, gépnapló, raktár és export.", allowed: ["dashboard", "daily", "animals", "machines", "warehouse", "photos", "exports"] },
  worker: { label: "Dolgozó", description: "Egyszerűsített terepi rögzítés: napi munka, állattartás, gépnapló és fotó.", allowed: ["dashboard", "daily", "animals", "machines", "photos"] },
};

const workActivities = ["Talajmunka", "Vetés", "Permetezés", "Aratás", "Öntözés", "Szállítás", "Rakodás", "Ellenőrzés", "Karbantartás"];
const animalEventTypes = ["Ellés / születés", "Oltás", "Kezelés", "Termékenyítés", "Elhullás / selejtezés", "Etetés", "Megfigyelés"];
const machineEventTypes = ["Géphasználat", "Üzemóra rögzítés", "Tankolás", "Géphiba", "Javítás", "Karbantartás"];
const stockCategories = ["Termény", "Takarmány", "Műtrágya", "Növényvédőszer", "Alkatrész", "Egyéb anyag"];
const photoModules = ["Napi munka", "Állattartás", "Gépnapló", "Raktár", "Káresemény", "Bizonylat"];

function cls(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Array<Record<string, string | number | boolean | undefined>>) {
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
  return [headers, ...rows.map((row) => headers.map((key) => row[key] ?? ""))]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
    .join("\n");
}

function BrandMark() {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-900/10 bg-white shadow-[0_14px_38px_rgba(21,128,61,0.14)]">
      <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-50 to-lime-100">
        <Sprout className="absolute left-1/2 top-1 h-6 w-6 -translate-x-1/2 text-emerald-800" />
        <div className="absolute bottom-1 left-1 right-1 h-4 rounded-t-full border-t-4 border-emerald-800" />
      </div>
    </div>
  );
}

function Pill({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return <span className={cls("rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.11em]", active ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>{children}</span>;
}

function Input({ label, value, onChange, placeholder = "", type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.10em] text-slate-500">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-500" />
    </label>
  );
}

function Select<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: readonly T[] }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.10em] text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-900 outline-none transition focus:border-emerald-500">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.10em] text-slate-500">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} placeholder={placeholder} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-500" />
    </label>
  );
}

function StatCard({ icon: Icon, label, value, note }: { icon: ComponentType<React.SVGProps<SVGSVGElement>>; label: string; value: string; note: string }) {
  return (
    <article className="rounded-[1.45rem] border border-slate-200 bg-white p-4 shadow-[0_14px_42px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><Icon className="h-6 w-6" /></div>
        <Activity className="h-5 w-5 text-slate-300" />
      </div>
      <p className="mt-4 text-4xl font-black tracking-[-0.06em] text-slate-950">{value}</p>
      <p className="text-sm font-black text-slate-900">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{note}</p>
    </article>
  );
}

function SectionHeader({ pill, title, text, action }: { pill: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <Pill>{pill}</Pill>
        <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-slate-950">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{text}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return <tr><td colSpan={colSpan} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">Nincs megjeleníthető tétel.</td></tr>;
}

export default function GazdaSegedClient() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<AppState>(initialState);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");

  const [workForm, setWorkForm] = useState<Omit<WorkLog, "id">>({ date: todayIso(), activity: "Talajmunka", field: "", crop: "", worker: "", areaHa: "", hours: "", machine: "", material: "", note: "", offline: true });
  const [animalForm, setAnimalForm] = useState<Omit<AnimalRecord, "id" | "lastEvent">>({ tag: "", species: "Szarvasmarha", group: "", status: "Aktív" });
  const [animalEventForm, setAnimalEventForm] = useState<Omit<AnimalEvent, "id">>({ date: todayIso(), animalTag: "", eventType: "Ellés / születés", quantity: "", unit: "db", responsible: "", note: "" });
  const [machineForm, setMachineForm] = useState<Omit<MachineRecord, "id">>({ name: "", type: "Traktor", status: "Használható", hourMeter: "" });
  const [machineLogForm, setMachineLogForm] = useState<Omit<MachineLog, "id">>({ date: todayIso(), machine: "", eventType: "Géphasználat", driver: "", startHour: "", endHour: "", fuelLiter: "", field: "", note: "" });
  const [stockForm, setStockForm] = useState<Omit<StockItem, "id">>({ name: "", category: "Termény", unit: "kg", currentStock: "", minStock: "", location: "" });
  const [stockMovementForm, setStockMovementForm] = useState<Omit<StockMovement, "id">>({ date: todayIso(), itemName: "", type: "Bevét", quantity: "", unit: "kg", partner: "", document: "", note: "" });
  const [photoForm, setPhotoForm] = useState<Omit<PhotoRecord, "id">>({ date: todayIso(), module: "Napi munka", subject: "", fileName: "", description: "", location: "", dataUrl: "" });
  const [taskTitle, setTaskTitle] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setState({ ...initialState, ...(JSON.parse(raw) as Partial<AppState>) });
    } catch {
      // Hibás localStorage esetén demo adatok maradnak.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [loaded, state]);

  const allowedViews = roles[state.role].allowed;

  useEffect(() => {
    const requestedView = searchParams.get("view") as ViewKey | null;
    if (requestedView && roles[state.role].allowed.includes(requestedView)) {
      setView(requestedView);
    }
  }, [searchParams, state.role]);

  useEffect(() => {
    if (!allowedViews.includes(view)) setView("dashboard");
  }, [allowedViews, view]);

  const q = query.trim().toLowerCase();
  const workLogs = useMemo(() => state.workLogs.filter((item) => !q || `${item.date} ${item.activity} ${item.field} ${item.crop} ${item.worker} ${item.machine} ${item.material} ${item.note}`.toLowerCase().includes(q)), [q, state.workLogs]);
  const animalEvents = useMemo(() => state.animalEvents.filter((item) => !q || `${item.date} ${item.animalTag} ${item.eventType} ${item.responsible} ${item.note}`.toLowerCase().includes(q)), [q, state.animalEvents]);
  const machineLogs = useMemo(() => state.machineLogs.filter((item) => !q || `${item.date} ${item.machine} ${item.eventType} ${item.driver} ${item.field} ${item.note}`.toLowerCase().includes(q)), [q, state.machineLogs]);
  const stockMovements = useMemo(() => state.stockMovements.filter((item) => !q || `${item.date} ${item.itemName} ${item.type} ${item.partner} ${item.document} ${item.note}`.toLowerCase().includes(q)), [q, state.stockMovements]);
  const photos = useMemo(() => state.photos.filter((item) => !q || `${item.date} ${item.module} ${item.subject} ${item.fileName} ${item.description} ${item.location}`.toLowerCase().includes(q)), [q, state.photos]);

  function updateRole(role: RoleKey) {
    setState((current) => ({ ...current, role }));
  }

  function addWorkLog() {
    if (!workForm.activity || !workForm.field) return;
    setState((current) => ({ ...current, workLogs: [{ ...workForm, id: `w-${Date.now()}` }, ...current.workLogs] }));
    setWorkForm({ ...workForm, field: "", crop: "", areaHa: "", hours: "", machine: "", material: "", note: "" });
  }

  function addAnimal() {
    if (!animalForm.tag) return;
    setState((current) => ({ ...current, animals: [{ ...animalForm, id: `a-${Date.now()}`, lastEvent: "Új állat" }, ...current.animals] }));
    setAnimalForm({ tag: "", species: animalForm.species, group: "", status: "Aktív" });
  }

  function addAnimalEvent() {
    if (!animalEventForm.animalTag || !animalEventForm.eventType) return;
    setState((current) => ({
      ...current,
      animalEvents: [{ ...animalEventForm, id: `ae-${Date.now()}` }, ...current.animalEvents],
      animals: current.animals.map((animal) => animal.tag === animalEventForm.animalTag ? { ...animal, lastEvent: animalEventForm.eventType } : animal),
    }));
    setAnimalEventForm({ ...animalEventForm, quantity: "", responsible: "", note: "" });
  }

  function addMachine() {
    if (!machineForm.name) return;
    setState((current) => ({ ...current, machines: [{ ...machineForm, id: `m-${Date.now()}` }, ...current.machines] }));
    setMachineForm({ name: "", type: machineForm.type, status: "Használható", hourMeter: "" });
  }

  function addMachineLog() {
    if (!machineLogForm.machine || !machineLogForm.eventType) return;
    setState((current) => ({
      ...current,
      machineLogs: [{ ...machineLogForm, id: `ml-${Date.now()}` }, ...current.machineLogs],
      machines: current.machines.map((machine) => machine.name === machineLogForm.machine && machineLogForm.endHour ? { ...machine, hourMeter: machineLogForm.endHour } : machine),
    }));
    setMachineLogForm({ ...machineLogForm, startHour: "", endHour: "", fuelLiter: "", field: "", note: "" });
  }

  function addStockItem() {
    if (!stockForm.name) return;
    setState((current) => ({ ...current, stockItems: [{ ...stockForm, id: `s-${Date.now()}` }, ...current.stockItems] }));
    setStockForm({ name: "", category: stockForm.category, unit: stockForm.unit, currentStock: "", minStock: "", location: "" });
  }

  function addStockMovement() {
    if (!stockMovementForm.itemName || !stockMovementForm.quantity) return;
    const movementQuantity = Number(String(stockMovementForm.quantity).replace(",", ".")) || 0;
    setState((current) => ({
      ...current,
      stockMovements: [{ ...stockMovementForm, id: `sm-${Date.now()}` }, ...current.stockMovements],
      stockItems: current.stockItems.map((item) => {
        if (item.name !== stockMovementForm.itemName) return item;
        const currentStock = Number(String(item.currentStock).replace(",", ".")) || 0;
        const nextStock = stockMovementForm.type === "Kiadás" ? currentStock - movementQuantity : stockMovementForm.type === "Bevét" ? currentStock + movementQuantity : currentStock;
        return { ...item, currentStock: String(nextStock).replace(".", ",") };
      }),
    }));
    setStockMovementForm({ ...stockMovementForm, quantity: "", partner: "", document: "", note: "" });
  }

  function addPhoto() {
    if (!photoForm.fileName && !photoForm.description) return;
    setState((current) => ({ ...current, photos: [{ ...photoForm, id: `p-${Date.now()}` }, ...current.photos] }));
    setPhotoForm({ date: todayIso(), module: photoForm.module, subject: "", fileName: "", description: "", location: "", dataUrl: "" });
  }

  function addTaskFromModule(title: string, area: string, owner = "Kijelölésre vár") {
    setState((current) => ({ ...current, tasks: [{ id: `task-${Date.now()}`, title, dueDate: todayIso(), owner, status: "Nyitott", area }, ...current.tasks] }));
  }

  function addManualTask() {
    if (!taskTitle.trim()) return;
    addTaskFromModule(taskTitle.trim(), "GazdaSegéd", "Kijelölésre vár");
    setTaskTitle("");
  }

  function toggleTaskStatus(id: string) {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id !== id ? task : { ...task, status: task.status === "Nyitott" ? "Folyamatban" : task.status === "Folyamatban" ? "Kész" : "Nyitott" }),
    }));
  }

  function removeFrom<K extends keyof AppState>(key: K, id: string) {
    setState((current) => ({ ...current, [key]: (current[key] as Array<{ id: string }>).filter((item) => item.id !== id) }));
  }

  function handlePhotoFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoForm((current) => ({ ...current, fileName: file.name, dataUrl: typeof reader.result === "string" ? reader.result : "" }));
    reader.readAsDataURL(file);
  }

  function exportJson() {
    downloadTextFile(`dimpro-gazdaseged-teljes-export-${todayIso()}.json`, JSON.stringify(state, null, 2), "application/json;charset=utf-8");
  }

  function exportCsv(name: string, rows: Array<Record<string, string | number | boolean | undefined>>) {
    downloadTextFile(`dimpro-gazdaseged-${name}-${todayIso()}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  }

  const navItems: Array<{ key: ViewKey; label: string; icon: ComponentType<React.SVGProps<SVGSVGElement>> }> = [
    { key: "dashboard", label: "Áttekintés", icon: Home },
    { key: "daily", label: "Napi munka", icon: ClipboardList },
    { key: "animals", label: "Állattartás", icon: PawPrint },
    { key: "machines", label: "Gépnapló", icon: Tractor },
    { key: "warehouse", label: "Raktár", icon: Warehouse },
    { key: "photos", label: "Fotók", icon: Camera },
    { key: "exports", label: "Export", icon: Download },
    { key: "settings", label: "Beállítás", icon: Settings },
  ];

  const today = todayIso();
  const todayWorkCount = state.workLogs.filter((item) => item.date === today).length;
  const openTasks = state.tasks.filter((task) => task.status !== "Kész").length;
  const lowStockCount = state.stockItems.filter((item) => (Number(String(item.currentStock).replace(",", ".")) || 0) <= (Number(String(item.minStock).replace(",", ".")) || 0)).length;

  return (
    <main className="min-h-screen bg-[#f5fbf4] text-slate-950">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_15%_12%,rgba(34,197,94,0.16),transparent_28%),radial-gradient(circle_at_82%_20%,rgba(20,184,166,0.12),transparent_28%),linear-gradient(180deg,#f8fff7_0%,#f5fbf4_48%,#eef8eb_100%)]" />
      <div className="fixed inset-0 -z-10 opacity-[0.34] [background-image:linear-gradient(rgba(21,128,61,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(21,128,61,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />

      <header className="sticky top-0 z-30 border-b border-emerald-900/10 bg-[#f8fff7]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1540px] flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-8">
          <Link href="/account/modules" className="flex items-center gap-4">
            <BrandMark />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">DIMPRO modul app</p>
              <h1 className="text-2xl font-black tracking-[-0.05em] text-emerald-950">GazdaSegéd</h1>
            </div>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(roles) as RoleKey[]).map((item) => (
              <button key={item} type="button" onClick={() => updateRole(item)} className={cls("rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.10em] transition", state.role === item ? "bg-emerald-700 text-white" : "border border-emerald-200 bg-white text-emerald-800 hover:border-emerald-500")}>{roles[item].label}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1540px] gap-5 px-4 py-5 lg:grid-cols-[300px_1fr] lg:px-8">
        <aside className="rounded-[1.8rem] border border-white bg-white/86 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)] lg:overflow-y-auto">
          <div className="rounded-[1.4rem] border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-10 w-10 rounded-2xl bg-emerald-700 p-2 text-white" />
              <div>
                <p className="text-sm font-black text-emerald-950">{roles[state.role].label}</p>
                <p className="text-xs font-semibold leading-5 text-emerald-900/75">{roles[state.role].description}</p>
              </div>
            </div>
          </div>

          <nav className="mt-4 space-y-2">
            {navItems.map((item) => {
              const enabled = allowedViews.includes(item.key);
              return (
                <button key={item.key} type="button" disabled={!enabled} onClick={() => setView(item.key)} className={cls("flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-black transition", view === item.key ? "bg-emerald-700 text-white" : enabled ? "bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-800" : "cursor-not-allowed bg-slate-50 text-slate-300")}>
                  <span className="flex items-center gap-3"><item.icon className="h-5 w-5" />{item.label}</span>
                  {enabled ? <ChevronRight className="h-4 w-4" /> : <X className="h-4 w-4" />}
                </button>
              );
            })}
          </nav>

          <div className="mt-5 rounded-[1.4rem] border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-5 text-amber-900">
            MVP üzemmód: az adatok most böngésző localStorage-ben mentődnek. Következő körben Supabase/PostgreSQL adatmodell szükséges.
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          {view === "dashboard" ? (
            <Dashboard
              todayWorkCount={todayWorkCount}
              animalCount={state.animals.length}
              machineCount={state.machines.length}
              lowStockCount={lowStockCount}
              openTasks={openTasks}
              photoCount={state.photos.length}
              setView={setView}
              tasks={state.tasks}
              toggleTaskStatus={toggleTaskStatus}
              taskTitle={taskTitle}
              setTaskTitle={setTaskTitle}
              addManualTask={addManualTask}
            />
          ) : null}

          {view === "daily" ? (
            <DailyWorkModule form={workForm} setForm={setWorkForm} logs={workLogs} add={addWorkLog} remove={(id) => removeFrom("workLogs", id)} addTask={addTaskFromModule} />
          ) : null}

          {view === "animals" ? (
            <AnimalsModule animalForm={animalForm} setAnimalForm={setAnimalForm} eventForm={animalEventForm} setEventForm={setAnimalEventForm} animals={state.animals} events={animalEvents} addAnimal={addAnimal} addEvent={addAnimalEvent} removeAnimal={(id) => removeFrom("animals", id)} removeEvent={(id) => removeFrom("animalEvents", id)} addTask={addTaskFromModule} />
          ) : null}

          {view === "machines" ? (
            <MachinesModule machineForm={machineForm} setMachineForm={setMachineForm} logForm={machineLogForm} setLogForm={setMachineLogForm} machines={state.machines} logs={machineLogs} addMachine={addMachine} addLog={addMachineLog} removeMachine={(id) => removeFrom("machines", id)} removeLog={(id) => removeFrom("machineLogs", id)} addTask={addTaskFromModule} />
          ) : null}

          {view === "warehouse" ? (
            <WarehouseModule itemForm={stockForm} setItemForm={setStockForm} movementForm={stockMovementForm} setMovementForm={setStockMovementForm} items={state.stockItems} movements={stockMovements} addItem={addStockItem} addMovement={addStockMovement} removeItem={(id) => removeFrom("stockItems", id)} removeMovement={(id) => removeFrom("stockMovements", id)} addTask={addTaskFromModule} />
          ) : null}

          {view === "photos" ? (
            <PhotosModule form={photoForm} setForm={setPhotoForm} photos={photos} add={addPhoto} remove={(id) => removeFrom("photos", id)} handleFile={handlePhotoFile} addTask={addTaskFromModule} />
          ) : null}

          {view === "exports" ? (
            <ExportsModule query={query} setQuery={setQuery} state={state} exportJson={exportJson} exportCsv={exportCsv} />
          ) : null}

          {view === "settings" ? <SettingsModule state={state} setState={setState} exportJson={exportJson} /> : null}
        </section>
      </div>
    </main>
  );
}

function Dashboard({ todayWorkCount, animalCount, machineCount, lowStockCount, openTasks, photoCount, setView, tasks, toggleTaskStatus, taskTitle, setTaskTitle, addManualTask }: { todayWorkCount: number; animalCount: number; machineCount: number; lowStockCount: number; openTasks: number; photoCount: number; setView: (view: ViewKey) => void; tasks: FarmTask[]; toggleTaskStatus: (id: string) => void; taskTitle: string; setTaskTitle: (value: string) => void; addManualTask: () => void }) {
  const moduleCards: Array<{ view: ViewKey; icon: ComponentType<React.SVGProps<SVGSVGElement>>; title: string; text: string }> = [
    { view: "daily", icon: ClipboardList, title: "Napi munka", text: "Napi munkanapló, tábla, dolgozó, gép, anyag, munkaidő." },
    { view: "animals", icon: PawPrint, title: "Állattartás", text: "Állatnyilvántartás, ellés, oltás, kezelés, etetés." },
    { view: "machines", icon: Tractor, title: "Gépnapló", text: "Gépek, üzemóra, tankolás, hiba, karbantartás." },
    { view: "warehouse", icon: Warehouse, title: "Raktár", text: "Készletek, bevét, kiadás, minimum készlet figyelés." },
    { view: "photos", icon: Camera, title: "Fotók", text: "Fotó és bizonylat csatolás modulhoz, helyhez, témához." },
    { view: "exports", icon: Download, title: "Export", text: "CSV, JSON, nyomtatás / PDF előkészítés." },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-white bg-white/88 p-5 shadow-[0_22px_80px_rgba(15,23,42,0.07)] lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Pill active>Mobil első terepi adatgyűjtés</Pill>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] text-emerald-950">A GazdaSegéd fő moduljai használható MVP szinten.</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">A hat fő kártya már külön rögzítő, lista, törlés, feladat és export logikával rendelkezik.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard icon={ClipboardList} label="Mai munkák" value={String(todayWorkCount)} note="Napi munka modul" />
        <StatCard icon={PawPrint} label="Állatok" value={String(animalCount)} note="Nyilvántartott tétel" />
        <StatCard icon={Tractor} label="Gépek" value={String(machineCount)} note="Gépnapló törzs" />
        <StatCard icon={Warehouse} label="Minimum alatt" value={String(lowStockCount)} note="Raktár figyelés" />
        <StatCard icon={ListChecks} label="Feladat" value={String(openTasks)} note="Nyitott / folyamatban" />
        <StatCard icon={Camera} label="Fotó" value={String(photoCount)} note="Csatolt fotórekord" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {moduleCards.map((card) => (
          <button key={card.title} type="button" onClick={() => setView(card.view)} className="group rounded-[1.6rem] border border-slate-200 bg-white p-6 text-left shadow-[0_18px_52px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:border-emerald-300">
            <card.icon className="h-12 w-12 rounded-2xl bg-emerald-700 p-3 text-white" />
            <h3 className="mt-5 text-2xl font-black tracking-[-0.04em] text-slate-950">{card.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{card.text}</p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-emerald-700">Megnyitás <ChevronRight className="h-4 w-4" /></span>
          </button>
        ))}
      </div>

      <TaskPanel tasks={tasks} toggleTaskStatus={toggleTaskStatus} taskTitle={taskTitle} setTaskTitle={setTaskTitle} addManualTask={addManualTask} />
    </div>
  );
}

function DailyWorkModule({ form, setForm, logs, add, remove, addTask }: { form: Omit<WorkLog, "id">; setForm: (value: Omit<WorkLog, "id">) => void; logs: WorkLog[]; add: () => void; remove: (id: string) => void; addTask: (title: string, area: string, owner?: string) => void }) {
  return (
    <ModuleShell icon={ClipboardList} pill="Napi munka" title="Napi munkanapló használható rögzítővel" text="Tábla, kultúra, dolgozó, gép, anyag, munkaidő, terület és megjegyzés rögzíthető.">
      <FormGrid action={<button type="button" onClick={add} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_38px_rgba(21,128,61,0.18)] transition hover:bg-emerald-800"><Save className="h-5 w-5" /> Mentés</button>}>
        <Input label="Dátum" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
        <Select label="Munka típusa" value={form.activity} onChange={(value) => setForm({ ...form, activity: value })} options={workActivities} />
        <Input label="Tábla / helyszín" value={form.field} onChange={(value) => setForm({ ...form, field: value })} placeholder="pl. Felső-dűlő 12." />
        <Input label="Kultúra" value={form.crop} onChange={(value) => setForm({ ...form, crop: value })} placeholder="búza, kukorica..." />
        <Input label="Dolgozó" value={form.worker} onChange={(value) => setForm({ ...form, worker: value })} />
        <Input label="Terület (ha)" value={form.areaHa} onChange={(value) => setForm({ ...form, areaHa: value })} />
        <Input label="Munkaidő (óra)" value={form.hours} onChange={(value) => setForm({ ...form, hours: value })} />
        <Input label="Gép" value={form.machine} onChange={(value) => setForm({ ...form, machine: value })} />
        <Input label="Anyag / termény" value={form.material} onChange={(value) => setForm({ ...form, material: value })} />
        <Textarea label="Megjegyzés" value={form.note} onChange={(value) => setForm({ ...form, note: value })} />
      </FormGrid>
      <DataTable title="Napi munkák" count={logs.length} headers={["Dátum", "Munka", "Tábla", "Dolgozó", "Gép", "Mennyiség", "Megjegyzés", "Művelet"]}>
        {logs.map((item) => <tr key={item.id}><Td>{item.date}</Td><Td strong>{item.activity}</Td><Td>{item.field}</Td><Td>{item.worker || "-"}</Td><Td>{item.machine || "-"}</Td><Td>{item.areaHa || "-"} ha / {item.hours || "-"} óra</Td><Td>{item.note || "-"}</Td><ActionTd onRemove={() => remove(item.id)} onTask={() => addTask(`${item.activity} ellenőrzése`, item.field, item.worker)} /></tr>)}
        {logs.length === 0 ? <EmptyRow colSpan={8} /> : null}
      </DataTable>
    </ModuleShell>
  );
}

function AnimalsModule({ animalForm, setAnimalForm, eventForm, setEventForm, animals, events, addAnimal, addEvent, removeAnimal, removeEvent, addTask }: { animalForm: Omit<AnimalRecord, "id" | "lastEvent">; setAnimalForm: (value: Omit<AnimalRecord, "id" | "lastEvent">) => void; eventForm: Omit<AnimalEvent, "id">; setEventForm: (value: Omit<AnimalEvent, "id">) => void; animals: AnimalRecord[]; events: AnimalEvent[]; addAnimal: () => void; addEvent: () => void; removeAnimal: (id: string) => void; removeEvent: (id: string) => void; addTask: (title: string, area: string, owner?: string) => void }) {
  const tags = animals.map((animal) => animal.tag);
  return (
    <ModuleShell icon={PawPrint} pill="Állattartás" title="Állatnyilvántartás és állatesemények" text="Ellés, születés, oltás, kezelés, termékenyítés, elhullás és etetés rögzítése.">
      <div className="grid gap-4 xl:grid-cols-2">
        <FormGrid title="Új állat" action={<button type="button" onClick={addAnimal} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_38px_rgba(21,128,61,0.18)] transition hover:bg-emerald-800"><Plus className="h-5 w-5" /> Állat felvétele</button>}>
          <Input label="Azonosító / fülszám" value={animalForm.tag} onChange={(value) => setAnimalForm({ ...animalForm, tag: value })} />
          <Input label="Faj" value={animalForm.species} onChange={(value) => setAnimalForm({ ...animalForm, species: value })} />
          <Input label="Csoport / istálló" value={animalForm.group} onChange={(value) => setAnimalForm({ ...animalForm, group: value })} />
          <Input label="Státusz" value={animalForm.status} onChange={(value) => setAnimalForm({ ...animalForm, status: value })} />
        </FormGrid>
        <FormGrid title="Új állatesemény" action={<button type="button" onClick={addEvent} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_38px_rgba(21,128,61,0.18)] transition hover:bg-emerald-800"><Syringe className="h-5 w-5" /> Esemény mentése</button>}>
          <Input label="Dátum" type="date" value={eventForm.date} onChange={(value) => setEventForm({ ...eventForm, date: value })} />
          <Select label="Állat" value={eventForm.animalTag || tags[0] || ""} onChange={(value) => setEventForm({ ...eventForm, animalTag: value })} options={tags.length ? tags : [""]} />
          <Select label="Esemény" value={eventForm.eventType} onChange={(value) => setEventForm({ ...eventForm, eventType: value })} options={animalEventTypes} />
          <Input label="Mennyiség" value={eventForm.quantity} onChange={(value) => setEventForm({ ...eventForm, quantity: value })} />
          <Input label="Egység" value={eventForm.unit} onChange={(value) => setEventForm({ ...eventForm, unit: value })} />
          <Input label="Felelős" value={eventForm.responsible} onChange={(value) => setEventForm({ ...eventForm, responsible: value })} />
          <Textarea label="Megjegyzés" value={eventForm.note} onChange={(value) => setEventForm({ ...eventForm, note: value })} />
        </FormGrid>
      </div>
      <DataTable title="Állatok" count={animals.length} headers={["Azonosító", "Faj", "Csoport", "Státusz", "Utolsó esemény", "Művelet"]}>
        {animals.map((item) => <tr key={item.id}><Td strong>{item.tag}</Td><Td>{item.species}</Td><Td>{item.group}</Td><Td><Pill>{item.status}</Pill></Td><Td>{item.lastEvent}</Td><ActionTd onRemove={() => removeAnimal(item.id)} onTask={() => addTask(`${item.tag} ellenőrzése`, item.group)} /></tr>)}
        {animals.length === 0 ? <EmptyRow colSpan={6} /> : null}
      </DataTable>
      <DataTable title="Állatesemények" count={events.length} headers={["Dátum", "Állat", "Esemény", "Mennyiség", "Felelős", "Megjegyzés", "Művelet"]}>
        {events.map((item) => <tr key={item.id}><Td>{item.date}</Td><Td strong>{item.animalTag}</Td><Td>{item.eventType}</Td><Td>{item.quantity || "-"} {item.unit}</Td><Td>{item.responsible || "-"}</Td><Td>{item.note || "-"}</Td><ActionTd onRemove={() => removeEvent(item.id)} onTask={() => addTask(`${item.eventType}: ${item.animalTag}`, item.animalTag, item.responsible)} /></tr>)}
        {events.length === 0 ? <EmptyRow colSpan={7} /> : null}
      </DataTable>
    </ModuleShell>
  );
}

function MachinesModule({ machineForm, setMachineForm, logForm, setLogForm, machines, logs, addMachine, addLog, removeMachine, removeLog, addTask }: { machineForm: Omit<MachineRecord, "id">; setMachineForm: (value: Omit<MachineRecord, "id">) => void; logForm: Omit<MachineLog, "id">; setLogForm: (value: Omit<MachineLog, "id">) => void; machines: MachineRecord[]; logs: MachineLog[]; addMachine: () => void; addLog: () => void; removeMachine: (id: string) => void; removeLog: (id: string) => void; addTask: (title: string, area: string, owner?: string) => void }) {
  const machineNames = machines.map((machine) => machine.name);
  return (
    <ModuleShell icon={Tractor} pill="Gépnapló" title="Gépek, üzemóra, hiba és karbantartás" text="Géptörzs és napi gépnapló rögzítés tankolással, üzemórával, sofőrrel, hibával.">
      <div className="grid gap-4 xl:grid-cols-2">
        <FormGrid title="Új gép" action={<button type="button" onClick={addMachine} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_38px_rgba(21,128,61,0.18)] transition hover:bg-emerald-800"><Plus className="h-5 w-5" /> Gép felvétele</button>}>
          <Input label="Gép neve" value={machineForm.name} onChange={(value) => setMachineForm({ ...machineForm, name: value })} />
          <Input label="Típus" value={machineForm.type} onChange={(value) => setMachineForm({ ...machineForm, type: value })} />
          <Input label="Státusz" value={machineForm.status} onChange={(value) => setMachineForm({ ...machineForm, status: value })} />
          <Input label="Üzemóra" value={machineForm.hourMeter} onChange={(value) => setMachineForm({ ...machineForm, hourMeter: value })} />
        </FormGrid>
        <FormGrid title="Gépnapló bejegyzés" action={<button type="button" onClick={addLog} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_38px_rgba(21,128,61,0.18)] transition hover:bg-emerald-800"><Save className="h-5 w-5" /> Bejegyzés mentése</button>}>
          <Input label="Dátum" type="date" value={logForm.date} onChange={(value) => setLogForm({ ...logForm, date: value })} />
          <Select label="Gép" value={logForm.machine || machineNames[0] || ""} onChange={(value) => setLogForm({ ...logForm, machine: value })} options={machineNames.length ? machineNames : [""]} />
          <Select label="Esemény" value={logForm.eventType} onChange={(value) => setLogForm({ ...logForm, eventType: value })} options={machineEventTypes} />
          <Input label="Gépkezelő" value={logForm.driver} onChange={(value) => setLogForm({ ...logForm, driver: value })} />
          <Input label="Kezdő üzemóra" value={logForm.startHour} onChange={(value) => setLogForm({ ...logForm, startHour: value })} />
          <Input label="Záró üzemóra" value={logForm.endHour} onChange={(value) => setLogForm({ ...logForm, endHour: value })} />
          <Input label="Tankolás (liter)" value={logForm.fuelLiter} onChange={(value) => setLogForm({ ...logForm, fuelLiter: value })} />
          <Input label="Tábla / hely" value={logForm.field} onChange={(value) => setLogForm({ ...logForm, field: value })} />
          <Textarea label="Megjegyzés" value={logForm.note} onChange={(value) => setLogForm({ ...logForm, note: value })} />
        </FormGrid>
      </div>
      <DataTable title="Géptörzs" count={machines.length} headers={["Gép", "Típus", "Státusz", "Üzemóra", "Művelet"]}>
        {machines.map((item) => <tr key={item.id}><Td strong>{item.name}</Td><Td>{item.type}</Td><Td><Pill>{item.status}</Pill></Td><Td>{item.hourMeter || "-"}</Td><ActionTd onRemove={() => removeMachine(item.id)} onTask={() => addTask(`${item.name} karbantartás ellenőrzése`, "Gépudvar")} /></tr>)}
        {machines.length === 0 ? <EmptyRow colSpan={5} /> : null}
      </DataTable>
      <DataTable title="Gépnapló" count={logs.length} headers={["Dátum", "Gép", "Esemény", "Gépkezelő", "Üzemóra", "Üzemanyag", "Hely", "Művelet"]}>
        {logs.map((item) => <tr key={item.id}><Td>{item.date}</Td><Td strong>{item.machine}</Td><Td>{item.eventType}</Td><Td>{item.driver || "-"}</Td><Td>{item.startHour || "-"} → {item.endHour || "-"}</Td><Td>{item.fuelLiter || "-"} l</Td><Td>{item.field || "-"}</Td><ActionTd onRemove={() => removeLog(item.id)} onTask={() => addTask(`${item.machine} - ${item.eventType}`, item.field || "Gépudvar", item.driver)} /></tr>)}
        {logs.length === 0 ? <EmptyRow colSpan={8} /> : null}
      </DataTable>
    </ModuleShell>
  );
}

function WarehouseModule({ itemForm, setItemForm, movementForm, setMovementForm, items, movements, addItem, addMovement, removeItem, removeMovement, addTask }: { itemForm: Omit<StockItem, "id">; setItemForm: (value: Omit<StockItem, "id">) => void; movementForm: Omit<StockMovement, "id">; setMovementForm: (value: Omit<StockMovement, "id">) => void; items: StockItem[]; movements: StockMovement[]; addItem: () => void; addMovement: () => void; removeItem: (id: string) => void; removeMovement: (id: string) => void; addTask: (title: string, area: string, owner?: string) => void }) {
  const itemNames = items.map((item) => item.name);
  return (
    <ModuleShell icon={Warehouse} pill="Raktár" title="Készlet, bevét, kiadás és minimum szint" text="Termény, takarmány, műtrágya, növényvédőszer, alkatrész és bizonylatos mozgások kezelése.">
      <div className="grid gap-4 xl:grid-cols-2">
        <FormGrid title="Új készletcikk" action={<button type="button" onClick={addItem} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_38px_rgba(21,128,61,0.18)] transition hover:bg-emerald-800"><Package className="h-5 w-5" /> Cikk felvétele</button>}>
          <Input label="Cikk neve" value={itemForm.name} onChange={(value) => setItemForm({ ...itemForm, name: value })} />
          <Select label="Kategória" value={itemForm.category} onChange={(value) => setItemForm({ ...itemForm, category: value })} options={stockCategories} />
          <Input label="Mértékegység" value={itemForm.unit} onChange={(value) => setItemForm({ ...itemForm, unit: value })} />
          <Input label="Aktuális készlet" value={itemForm.currentStock} onChange={(value) => setItemForm({ ...itemForm, currentStock: value })} />
          <Input label="Minimum készlet" value={itemForm.minStock} onChange={(value) => setItemForm({ ...itemForm, minStock: value })} />
          <Input label="Hely" value={itemForm.location} onChange={(value) => setItemForm({ ...itemForm, location: value })} />
        </FormGrid>
        <FormGrid title="Készletmozgás" action={<button type="button" onClick={addMovement} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_38px_rgba(21,128,61,0.18)] transition hover:bg-emerald-800"><Save className="h-5 w-5" /> Mozgás mentése</button>}>
          <Input label="Dátum" type="date" value={movementForm.date} onChange={(value) => setMovementForm({ ...movementForm, date: value })} />
          <Select label="Cikk" value={movementForm.itemName || itemNames[0] || ""} onChange={(value) => setMovementForm({ ...movementForm, itemName: value })} options={itemNames.length ? itemNames : [""]} />
          <Select label="Mozgás típusa" value={movementForm.type} onChange={(value) => setMovementForm({ ...movementForm, type: value })} options={["Bevét", "Kiadás", "Áthelyezés", "Leltár korrekció"]} />
          <Input label="Mennyiség" value={movementForm.quantity} onChange={(value) => setMovementForm({ ...movementForm, quantity: value })} />
          <Input label="Egység" value={movementForm.unit} onChange={(value) => setMovementForm({ ...movementForm, unit: value })} />
          <Input label="Partner / forrás" value={movementForm.partner} onChange={(value) => setMovementForm({ ...movementForm, partner: value })} />
          <Input label="Bizonylat" value={movementForm.document} onChange={(value) => setMovementForm({ ...movementForm, document: value })} />
          <Textarea label="Megjegyzés" value={movementForm.note} onChange={(value) => setMovementForm({ ...movementForm, note: value })} />
        </FormGrid>
      </div>
      <DataTable title="Készletek" count={items.length} headers={["Cikk", "Kategória", "Készlet", "Minimum", "Hely", "Állapot", "Művelet"]}>
        {items.map((item) => {
          const current = Number(String(item.currentStock).replace(",", ".")) || 0;
          const min = Number(String(item.minStock).replace(",", ".")) || 0;
          const low = current <= min;
          return <tr key={item.id}><Td strong>{item.name}</Td><Td>{item.category}</Td><Td>{item.currentStock} {item.unit}</Td><Td>{item.minStock || "-"} {item.unit}</Td><Td>{item.location || "-"}</Td><Td><Pill active={!low}>{low ? "Rendelni kell" : "Rendben"}</Pill></Td><ActionTd onRemove={() => removeItem(item.id)} onTask={() => addTask(`${item.name} készlet ellenőrzése`, item.location || "Raktár")} /></tr>;
        })}
        {items.length === 0 ? <EmptyRow colSpan={7} /> : null}
      </DataTable>
      <DataTable title="Készletmozgások" count={movements.length} headers={["Dátum", "Cikk", "Típus", "Mennyiség", "Partner", "Bizonylat", "Megjegyzés", "Művelet"]}>
        {movements.map((item) => <tr key={item.id}><Td>{item.date}</Td><Td strong>{item.itemName}</Td><Td>{item.type}</Td><Td>{item.quantity} {item.unit}</Td><Td>{item.partner || "-"}</Td><Td>{item.document || "-"}</Td><Td>{item.note || "-"}</Td><ActionTd onRemove={() => removeMovement(item.id)} onTask={() => addTask(`${item.itemName} bizonylat ellenőrzése`, "Raktár")} /></tr>)}
        {movements.length === 0 ? <EmptyRow colSpan={8} /> : null}
      </DataTable>
    </ModuleShell>
  );
}

function PhotosModule({ form, setForm, photos, add, remove, handleFile, addTask }: { form: Omit<PhotoRecord, "id">; setForm: (value: Omit<PhotoRecord, "id">) => void; photos: PhotoRecord[]; add: () => void; remove: (id: string) => void; handleFile: (file: File | null) => void; addTask: (title: string, area: string, owner?: string) => void }) {
  return (
    <ModuleShell icon={Camera} pill="Fotók" title="Fotó és bizonylat csatolás" text="A fotó modul most önállóan rögzít képet, fájlnevet, kapcsolódó modult, tárgyat, helyet és leírást.">
      <FormGrid action={<button type="button" onClick={add} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_38px_rgba(21,128,61,0.18)] transition hover:bg-emerald-800"><CloudUpload className="h-5 w-5" /> Fotó mentése</button>}>
        <Input label="Dátum" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
        <Select label="Kapcsolódó modul" value={form.module} onChange={(value) => setForm({ ...form, module: value })} options={photoModules} />
        <Input label="Tárgy / azonosító" value={form.subject} onChange={(value) => setForm({ ...form, subject: value })} placeholder="pl. tábla, gép, állat, bizonylat" />
        <Input label="Helyszín" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.10em] text-slate-500">Képfájl</span>
          <input type="file" accept="image/*" onChange={(event) => handleFile(event.target.files?.[0] ?? null)} className="mt-1 w-full rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900" />
        </label>
        <Input label="Fájlnév" value={form.fileName} onChange={(value) => setForm({ ...form, fileName: value })} />
        <Textarea label="Leírás" value={form.description} onChange={(value) => setForm({ ...form, description: value })} />
        {form.dataUrl ? <img src={form.dataUrl} alt="Fotó előnézet" className="h-40 w-full rounded-2xl object-cover" /> : null}
      </FormGrid>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {photos.map((photo) => (
          <article key={photo.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_42px_rgba(15,23,42,0.06)]">
            {photo.dataUrl ? <img src={photo.dataUrl} alt={photo.fileName || photo.subject} className="h-44 w-full rounded-xl object-cover" /> : <div className="flex h-44 w-full items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Camera className="h-12 w-12" /></div>}
            <h3 className="mt-4 text-lg font-black text-slate-950">{photo.subject || photo.fileName || "Fotórekord"}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">{photo.date} · {photo.module} · {photo.location || "-"}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{photo.description || "-"}</p>
            <div className="mt-4 flex gap-2"><button type="button" onClick={() => addTask(`${photo.subject || photo.fileName} fotó ellenőrzése`, photo.location || photo.module)} className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100">Feladat</button><button type="button" onClick={() => remove(photo.id)} className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100"><Trash2 className="h-4 w-4" /></button></div>
          </article>
        ))}
      </div>
    </ModuleShell>
  );
}

function ExportsModule({ query, setQuery, state, exportJson, exportCsv }: { query: string; setQuery: (value: string) => void; state: AppState; exportJson: () => void; exportCsv: (name: string, rows: Array<Record<string, string | number | boolean | undefined>>) => void }) {
  return (
    <ModuleShell icon={Download} pill="Export" title="CSV, JSON és nyomtatás / PDF előkészítés" text="Minden fő modul adatát külön vagy együtt lehet menteni. A szerveroldali Excel/PDF export a következő backend körben készülhet.">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <label className="relative block">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés export előtt..." className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm font-semibold outline-none focus:border-emerald-500" />
          </label>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ExportCard icon={ClipboardList} title="Napi munka" count={state.workLogs.length} onClick={() => exportCsv("napi-munka", state.workLogs)} />
            <ExportCard icon={PawPrint} title="Állattartás" count={state.animalEvents.length + state.animals.length} onClick={() => exportCsv("allattartas-esemenyek", state.animalEvents)} />
            <ExportCard icon={Tractor} title="Gépnapló" count={state.machineLogs.length + state.machines.length} onClick={() => exportCsv("gepnaplo", state.machineLogs)} />
            <ExportCard icon={Warehouse} title="Raktár" count={state.stockItems.length + state.stockMovements.length} onClick={() => exportCsv("raktar-mozgasok", state.stockMovements)} />
            <ExportCard icon={Camera} title="Fotók" count={state.photos.length} onClick={() => exportCsv("fotok", state.photos.map((photo) => ({ id: photo.id, date: photo.date, module: photo.module, subject: photo.subject, fileName: photo.fileName, description: photo.description, location: photo.location })))} />
            <ExportCard icon={FileJson} title="Teljes JSON" count={1} onClick={exportJson} />
          </div>
        </div>
        <aside className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <button type="button" onClick={exportJson} className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-4 text-left text-sm font-black text-emerald-900 transition hover:bg-emerald-50"><span className="flex items-center gap-3"><FileJson className="h-6 w-6" />Teljes JSON mentés</span><Download className="h-5 w-5" /></button>
          <button type="button" onClick={() => window.print()} className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-4 text-left text-sm font-black text-emerald-900 transition hover:bg-emerald-50"><span className="flex items-center gap-3"><Printer className="h-6 w-6" />Nyomtatás / PDF</span><FileText className="h-5 w-5" /></button>
          <div className="rounded-2xl border border-emerald-200 bg-white/70 p-4 text-sm font-semibold leading-6 text-emerald-950">A CSV magyar Excelhez pontosvesszővel tagolt. A fotók base64 előnézete csak a JSON mentésben szerepel.</div>
        </aside>
      </div>
    </ModuleShell>
  );
}

function SettingsModule({ state, setState, exportJson }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; exportJson: () => void }) {
  const [workerForm, setWorkerForm] = useState<Omit<WorkerUser, "id">>({ name: "", email: "", phone: "", role: "worker", status: "Aktív" });
  const [fieldForm, setFieldForm] = useState<Omit<FieldRecord, "id">>({ name: "", crop: "", areaHa: "", location: "", note: "" });
  const [importMessage, setImportMessage] = useState("");

  const roleSummary = useMemo(() => ({
    admin: state.workers.filter((worker) => worker.role === "admin" && worker.status === "Aktív").length,
    manager: state.workers.filter((worker) => worker.role === "manager" && worker.status === "Aktív").length,
    worker: state.workers.filter((worker) => worker.role === "worker" && worker.status === "Aktív").length,
  }), [state.workers]);

  const offlineCount = state.workLogs.filter((log) => log.offline).length;
  const totalRecords = state.workLogs.length + state.animalEvents.length + state.machineLogs.length + state.stockMovements.length + state.photos.length + state.tasks.length;

  function updateFarmProfile(key: keyof FarmProfile, value: string) {
    setState((current) => ({ ...current, farmProfile: { ...current.farmProfile, [key]: value } }));
  }

  function addWorker() {
    if (!workerForm.name.trim()) return;
    setState((current) => ({ ...current, workers: [{ ...workerForm, id: `u-${Date.now()}` }, ...current.workers] }));
    setWorkerForm({ name: "", email: "", phone: "", role: "worker", status: "Aktív" });
  }

  function updateWorker(id: string, patch: Partial<WorkerUser>) {
    setState((current) => ({ ...current, workers: current.workers.map((worker) => worker.id === id ? { ...worker, ...patch } : worker) }));
  }

  function removeWorker(id: string) {
    setState((current) => ({ ...current, workers: current.workers.filter((worker) => worker.id !== id) }));
  }

  function addField() {
    if (!fieldForm.name.trim()) return;
    setState((current) => ({ ...current, fields: [{ ...fieldForm, id: `f-${Date.now()}` }, ...current.fields] }));
    setFieldForm({ name: "", crop: "", areaHa: "", location: "", note: "" });
  }

  function updateField(id: string, patch: Partial<FieldRecord>) {
    setState((current) => ({ ...current, fields: current.fields.map((field) => field.id === id ? { ...field, ...patch } : field) }));
  }

  function removeField(id: string) {
    setState((current) => ({ ...current, fields: current.fields.filter((field) => field.id !== id) }));
  }

  function runLocalSync() {
    const syncedAt = new Date().toLocaleString("hu-HU");
    setState((current) => ({
      ...current,
      workLogs: current.workLogs.map((log) => ({ ...log, offline: false })),
      syncState: {
        mode: "Helyi MVP",
        lastSyncAt: syncedAt,
        pendingCount: 0,
        statusNote: "Helyi MVP szinkron lefutott: az offline napi munka bejegyzések szinkron státuszra kerültek.",
      },
    }));
  }

  function markCloudPrepared() {
    setState((current) => ({
      ...current,
      syncState: {
        ...current.syncState,
        mode: "Felhő előkészítve",
        statusNote: "A felület backend-ready állapotban van. Következő lépés: Supabase/PostgreSQL táblák és szerveroldali jogosultság.",
      },
    }));
  }

  function resetDemoData() {
    setState(initialState);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(initialState));
    } catch {
      // A localStorage mentés tiltása esetén az aktuális React state visszaállítása elég.
    }
  }

  function handleImport(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result)) as Partial<AppState>;
        setState((current) => ({ ...current, ...imported }));
        setImportMessage("Import sikeres. A beolvasott adatok bekerültek a helyi MVP tárba.");
      } catch {
        setImportMessage("Import sikertelen. Csak a GazdaSegéd teljes JSON export tölthető vissza.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <ModuleShell icon={Settings} pill="Admin beállítások" title="Gazdaság, szerepkörök, törzsadatok és szinkron" text="Ez a Beállítás modul már működő helyi admin felület: felhasználók, szerepkörök, gazdasági alapadatok, táblák és helyi szinkron kezelhető benne.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Aktív felhasználók" value={String(state.workers.filter((worker) => worker.status === "Aktív").length)} note={`Admin: ${roleSummary.admin}, Telepvezető: ${roleSummary.manager}, Dolgozó: ${roleSummary.worker}`} />
        <StatCard icon={Layers3} label="Törzsadat tábla" value={String(state.fields.length)} note="Gazdasági terület / tábla" />
        <StatCard icon={CloudUpload} label="Szinkronra vár" value={String(offlineCount)} note="Offline napi munka bejegyzés" />
        <StatCard icon={FileJson} label="Összes rekord" value={String(totalRecords)} note="MVP helyi adattár" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <SectionHeader pill="Törzsadatok" title="Gazdaság alapadatai" text="Ezek az adatok később a szerveroldali gazdaság/projekt rekord alapjai lesznek." />
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <Input label="Gazdaság neve" value={state.farmProfile.name} onChange={(value) => updateFarmProfile("name", value)} />
          <Input label="Tulajdonos / admin" value={state.farmProfile.owner} onChange={(value) => updateFarmProfile("owner", value)} />
          <Input label="Település" value={state.farmProfile.settlement} onChange={(value) => updateFarmProfile("settlement", value)} />
          <Input label="Adószám / azonosító" value={state.farmProfile.taxNumber} onChange={(value) => updateFarmProfile("taxNumber", value)} />
          <Input label="Telefon" value={state.farmProfile.phone} onChange={(value) => updateFarmProfile("phone", value)} />
          <Input label="E-mail" value={state.farmProfile.email} onChange={(value) => updateFarmProfile("email", value)} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <SectionHeader pill="Szerepkörök" title="Felhasználók és hozzáférési szerepek" text="Itt már felvehető, módosítható, inaktiválható és törölhető a helyi felhasználói lista. A felső szerepkör gombok csak demo nézetváltók, ez a táblázat a valódi jogosultsági törzsadat előképe." action={<button type="button" onClick={addWorker} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white"><Plus className="h-5 w-5" /> Felhasználó mentése</button>} />
        <div className="mt-5 grid gap-4 lg:grid-cols-5">
          <Input label="Név" value={workerForm.name} onChange={(value) => setWorkerForm({ ...workerForm, name: value })} />
          <Input label="E-mail" value={workerForm.email} onChange={(value) => setWorkerForm({ ...workerForm, email: value })} />
          <Input label="Telefon" value={workerForm.phone} onChange={(value) => setWorkerForm({ ...workerForm, phone: value })} />
          <Select label="Szerepkör" value={workerForm.role} onChange={(value) => setWorkerForm({ ...workerForm, role: value })} options={["admin", "manager", "worker"] as const} />
          <Select label="Státusz" value={workerForm.status} onChange={(value) => setWorkerForm({ ...workerForm, status: value })} options={["Aktív", "Inaktív"] as const} />
        </div>
        <DataTable title="Felhasználói szerepkörök" count={state.workers.length} headers={["Név", "E-mail", "Telefon", "Szerepkör", "Státusz", "Művelet"]}>
          {state.workers.map((worker) => (
            <tr key={worker.id}>
              <Td strong><input value={worker.name} onChange={(event) => updateWorker(worker.id, { name: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-black outline-none focus:border-emerald-500" /></Td>
              <Td><input value={worker.email} onChange={(event) => updateWorker(worker.id, { email: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold outline-none focus:border-emerald-500" /></Td>
              <Td><input value={worker.phone} onChange={(event) => updateWorker(worker.id, { phone: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold outline-none focus:border-emerald-500" /></Td>
              <Td><select value={worker.role} onChange={(event) => updateWorker(worker.id, { role: event.target.value as RoleKey })} className="rounded-xl border border-slate-200 px-3 py-2 font-black outline-none focus:border-emerald-500"><option value="admin">Gazda Admin</option><option value="manager">Telepvezető</option><option value="worker">Dolgozó</option></select></Td>
              <Td><button type="button" onClick={() => updateWorker(worker.id, { status: worker.status === "Aktív" ? "Inaktív" : "Aktív" })}><Pill active={worker.status === "Aktív"}>{worker.status}</Pill></button></Td>
              <td className="px-4 py-3"><button type="button" onClick={() => removeWorker(worker.id)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700"><Trash2 className="h-4 w-4" /></button></td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <SectionHeader pill="Törzsadatok" title="Táblák / területek kezelése" text="A Napi munka, Fotók és későbbi térképes modulok ezekből a törzsadatokból tudnak majd választani." action={<button type="button" onClick={addField} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white"><Plus className="h-5 w-5" /> Tábla mentése</button>} />
        <div className="mt-5 grid gap-4 lg:grid-cols-5">
          <Input label="Tábla / terület neve" value={fieldForm.name} onChange={(value) => setFieldForm({ ...fieldForm, name: value })} />
          <Input label="Kultúra" value={fieldForm.crop} onChange={(value) => setFieldForm({ ...fieldForm, crop: value })} />
          <Input label="Terület (ha)" value={fieldForm.areaHa} onChange={(value) => setFieldForm({ ...fieldForm, areaHa: value })} />
          <Input label="Hely" value={fieldForm.location} onChange={(value) => setFieldForm({ ...fieldForm, location: value })} />
          <Input label="Megjegyzés" value={fieldForm.note} onChange={(value) => setFieldForm({ ...fieldForm, note: value })} />
        </div>
        <DataTable title="Gazdasági táblák / területek" count={state.fields.length} headers={["Név", "Kultúra", "Terület", "Hely", "Megjegyzés", "Művelet"]}>
          {state.fields.map((field) => (
            <tr key={field.id}>
              <Td strong><input value={field.name} onChange={(event) => updateField(field.id, { name: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-black outline-none focus:border-emerald-500" /></Td>
              <Td><input value={field.crop} onChange={(event) => updateField(field.id, { crop: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold outline-none focus:border-emerald-500" /></Td>
              <Td><input value={field.areaHa} onChange={(event) => updateField(field.id, { areaHa: event.target.value })} className="w-28 rounded-xl border border-slate-200 px-3 py-2 font-semibold outline-none focus:border-emerald-500" /> ha</Td>
              <Td><input value={field.location} onChange={(event) => updateField(field.id, { location: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold outline-none focus:border-emerald-500" /></Td>
              <Td><input value={field.note} onChange={(event) => updateField(field.id, { note: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold outline-none focus:border-emerald-500" /></Td>
              <td className="px-4 py-3"><button type="button" onClick={() => removeField(field.id)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700"><Trash2 className="h-4 w-4" /></button></td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <SectionHeader pill="Szinkron" title="Helyi mentés, import/export és szinkron előkészítés" text="MVP-ben ez helyi szinkron-szimuláció: az offline rekordokat szinkron státuszra állítja, a teljes adatcsomagot JSON-ba menti, illetve vissza tudja tölteni." />
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
          <article className="rounded-2xl border border-emerald-200 bg-white p-5">
            <h3 className="text-xl font-black text-slate-950">Szinkron állapot</h3>
            <div className="mt-4 space-y-3 text-sm font-semibold text-slate-700">
              <p><b>Mód:</b> {state.syncState.mode}</p>
              <p><b>Utolsó szinkron:</b> {state.syncState.lastSyncAt}</p>
              <p><b>Várakozó rekord:</b> {offlineCount}</p>
              <p className="leading-6 text-slate-600">{state.syncState.statusNote}</p>
            </div>
          </article>
          <article className="rounded-2xl border border-emerald-200 bg-white p-5">
            <h3 className="text-xl font-black text-slate-950">Műveletek</h3>
            <div className="mt-4 grid gap-3">
              <button type="button" onClick={runLocalSync} className="inline-flex items-center justify-between rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white"><span className="flex items-center gap-2"><CloudUpload className="h-5 w-5" /> Helyi szinkron indítása</span></button>
              <button type="button" onClick={markCloudPrepared} className="inline-flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800"><span className="flex items-center gap-2"><Layers3 className="h-5 w-5" /> Backend-ready jelölés</span></button>
              <button type="button" onClick={exportJson} className="inline-flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800"><span className="flex items-center gap-2"><FileJson className="h-5 w-5" /> Teljes JSON export</span></button>
            </div>
          </article>
          <article className="rounded-2xl border border-emerald-200 bg-white p-5">
            <h3 className="text-xl font-black text-slate-950">Import / visszaállítás</h3>
            <label className="mt-4 block rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
              JSON import
              <input type="file" accept="application/json,.json" onChange={(event) => handleImport(event.target.files?.[0] ?? null)} className="mt-3 block w-full text-xs" />
            </label>
            {importMessage ? <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{importMessage}</p> : null}
            <button type="button" onClick={resetDemoData} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700"><Trash2 className="h-5 w-5" /> Demo adatok visszaállítása</button>
          </article>
        </div>
      </section>
    </ModuleShell>
  );
}

function ModuleShell({ icon: Icon, pill, title, text, children }: { icon: ComponentType<React.SVGProps<SVGSVGElement>>; pill: string; title: string; text: string; children: ReactNode }) {
  return (
    <section className="space-y-5 rounded-[2rem] border border-white bg-white/90 p-5 shadow-[0_22px_80px_rgba(15,23,42,0.07)] lg:p-7">
      <SectionHeader pill={pill} title={title} text={text} action={<div className="hidden h-16 w-16 items-center justify-center rounded-2xl bg-emerald-700 text-white lg:flex"><Icon className="h-9 w-9" /></div>} />
      {children}
    </section>
  );
}

function FormGrid({ title, children, action }: { title?: string; children: ReactNode; action: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">{title ? <h3 className="text-lg font-black text-slate-950">{title}</h3> : <span />} {action}</div>
      <div className="grid gap-4 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function DataTable({ title, count, headers, children }: { title: string; count: number; headers: string[]; children: ReactNode }) {
  return (
    <article className="overflow-hidden rounded-[1.55rem] border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="flex items-center gap-2 text-lg font-black text-slate-950"><Filter className="h-5 w-5 text-emerald-700" /> {title}</h3>
        <span className="text-sm font-black text-slate-500">{count} tétel</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-white text-xs font-black uppercase tracking-[0.08em] text-slate-500"><tr>{headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-200">{children}</tbody>
        </table>
      </div>
    </article>
  );
}

function Td({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <td className={cls("px-4 py-3 align-top", strong ? "font-black text-slate-950" : "font-semibold text-slate-700")}>{children}</td>;
}

function ActionTd({ onRemove, onTask }: { onRemove: () => void; onTask: () => void }) {
  return (
    <td className="px-4 py-3 align-top">
      <div className="flex gap-2">
        <button type="button" onClick={onTask} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Feladat</button>
        <button type="button" onClick={onRemove} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700"><Trash2 className="h-4 w-4" /></button>
      </div>
    </td>
  );
}

function TaskPanel({ tasks, toggleTaskStatus, taskTitle, setTaskTitle, addManualTask }: { tasks: FarmTask[]; toggleTaskStatus: (id: string) => void; taskTitle: string; setTaskTitle: (value: string) => void; addManualTask: () => void }) {
  return (
    <section className="rounded-[2rem] border border-white bg-white/90 p-5 shadow-[0_22px_80px_rgba(15,23,42,0.07)] lg:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><Pill>Saját feladatok</Pill><h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">Dolgozói és telepi feladatlista</h2></div>
        <div className="flex gap-2"><input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Új feladat..." className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500" /><button type="button" onClick={addManualTask} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_38px_rgba(21,128,61,0.18)] transition hover:bg-emerald-800"><Plus className="h-5 w-5" />Hozzáadás</button></div>
      </div>
      <div className="mt-6 grid gap-3">
        {tasks.map((task) => <button key={task.id} type="button" onClick={() => toggleTaskStatus(task.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-emerald-300"><span className="flex items-center gap-3"><CheckCircle2 className={cls("h-7 w-7", task.status === "Kész" ? "text-emerald-700" : "text-slate-400")} /><span><b className="block text-base text-slate-950">{task.title}</b><span className="text-sm font-semibold text-slate-500">{task.area} · {task.owner} · {task.dueDate}</span></span></span><Pill active={task.status === "Kész"}>{task.status}</Pill></button>)}
      </div>
    </section>
  );
}

function ExportCard({ icon: Icon, title, count, onClick }: { icon: ComponentType<React.SVGProps<SVGSVGElement>>; title: string; count: number; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-300 hover:shadow-[0_14px_42px_rgba(15,23,42,0.06)]"><Icon className="h-10 w-10 rounded-xl bg-emerald-700 p-2 text-white" /><h3 className="mt-3 text-base font-black text-slate-950">{title}</h3><p className="mt-1 text-sm font-semibold text-slate-500">{count} exportálható tétel</p><span className="mt-3 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.10em] text-emerald-700"><FileSpreadsheet className="h-4 w-4" /> CSV mentés</span></button>;
}

function InfoCard({ icon: Icon, title, text }: { icon: ComponentType<React.SVGProps<SVGSVGElement>>; title: string; text: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><Icon className="h-10 w-10 rounded-2xl bg-emerald-700 p-2 text-white" /><h3 className="mt-4 text-xl font-black text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>;
}
