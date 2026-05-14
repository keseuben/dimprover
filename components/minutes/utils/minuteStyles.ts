export function statusClass(status: string) {
  if (status === "Végleges") return "bg-emerald-50 text-emerald-700"
  if (status === "Folyamatban") return "bg-amber-50 text-amber-700"
  if (status === "Archivált") return "bg-slate-100 text-slate-600"
  return "bg-blue-50 text-blue-700"
}

export function rowTypeClass(type: string) {
  if (type === "Beruházói jegyzőkönyv") return "bg-violet-100"
  if (type === "Kooperációs jegyzőkönyv") return "bg-blue-100"
  if (type === "Tervezői jegyzőkönyv") return "bg-cyan-100"
  if (type === "Helyszíni jegyzőkönyv") return "bg-orange-100"
  if (type === "Egyéb feljegyzések") return "bg-slate-200"
  if (type === "Hibajegyzék") return "bg-red-100"
  if (type === "Emlékeztető") return "bg-yellow-100"
  if (type === "Fotós melléklet") return "bg-emerald-100"
  return "bg-white"
}

export function typeCardClass(type: string) {
  if (type === "Beruházói jegyzőkönyv") return "border-violet-300 bg-violet-100 hover:bg-violet-200"
  if (type === "Kooperációs jegyzőkönyv") return "border-blue-300 bg-blue-100 hover:bg-blue-200"
  if (type === "Tervezői jegyzőkönyv") return "border-cyan-300 bg-cyan-100 hover:bg-cyan-200"
  if (type === "Helyszíni jegyzőkönyv") return "border-orange-300 bg-orange-100 hover:bg-orange-200"
  if (type === "Egyéb feljegyzések") return "border-slate-300 bg-slate-200 hover:bg-slate-300"
  if (type === "Hibajegyzék") return "border-red-300 bg-red-100 hover:bg-red-200"
  if (type === "Emlékeztető") return "border-yellow-300 bg-yellow-100 hover:bg-yellow-200"
  if (type === "Fotós melléklet") return "border-emerald-300 bg-emerald-100 hover:bg-emerald-200"
  return "border-slate-200 bg-slate-50 hover:bg-slate-100"
}

export function typeStripClass(type: string) {
  if (type === "Beruházói jegyzőkönyv") return "bg-violet-600"
  if (type === "Kooperációs jegyzőkönyv") return "bg-blue-600"
  if (type === "Tervezői jegyzőkönyv") return "bg-cyan-600"
  if (type === "Helyszíni jegyzőkönyv") return "bg-orange-600"
  if (type === "Egyéb feljegyzések") return "bg-slate-600"
  if (type === "Hibajegyzék") return "bg-red-600"
  if (type === "Emlékeztető") return "bg-yellow-600"
  if (type === "Fotós melléklet") return "bg-emerald-600"
  return "bg-slate-500"
}

export function typeBorderClass(type: string) {
  if (type === "Beruházói jegyzőkönyv") return "border-l-violet-600"
  if (type === "Kooperációs jegyzőkönyv") return "border-l-blue-600"
  if (type === "Tervezői jegyzőkönyv") return "border-l-cyan-600"
  if (type === "Helyszíni jegyzőkönyv") return "border-l-orange-600"
  if (type === "Egyéb feljegyzések") return "border-l-slate-600"
  if (type === "Hibajegyzék") return "border-l-red-600"
  if (type === "Emlékeztető") return "border-l-yellow-600"
  if (type === "Fotós melléklet") return "border-l-emerald-600"
  return "border-l-slate-400"
}

export function groupHeaderClass(type: string) {
  return typeCardClass(type)
}