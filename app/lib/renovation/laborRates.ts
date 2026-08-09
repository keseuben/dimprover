import type { CostDiscipline } from "./costDatabase";
export type LaborRateMode = "official" | "dimpro" | "internal";
export type HourlyRateProfile = { id: string; year: number; label: string; hourlyRate: number; official: boolean; note: string; warning?: string };
export type LaborNormProfile = { itemId: string; laborHoursPerUnit: number; difficultyMultiplier: number; note: string };
export const hourlyRateProfiles: HourlyRateProfile[] = [
  { id: "official-2026-placeholder", year: 2026, label: "EVOSZ ajanlott minimalis epitoipari rezsioradij 2026", hourlyRate: 0, official: true, note: "Az erteket kezzel kell rogziteni a hivatalos rendelet alapjan.", warning: "Nincs kitoltve hivatalos ertekkel." },
  { id: "dimpro-demo-2026", year: 2026, label: "DIMPRO demo oradij", hourlyRate: 9500, official: false, note: "Demo/mintaertek, nem hivatalos adat." },
  { id: "internal-2026", year: 2026, label: "Belso sajat oradij", hourlyRate: 12500, official: false, note: "Admin/ajanlatkeszito mintaertek." },
];
export const disciplineRateMultipliers: Record<CostDiscipline, number> = {
  demolition_preparation: 0.95, masonry_drywall: 1, concrete_foundation: 1.05, roof: 1.15, insulation: 1, openings: 1.05, tiling: 1, painting: 0.9, electrical: 1.2, mechanical: 1.2, renewable_energy: 1.35, external_works: 1, other: 1,
};
export const laborNormProfiles: LaborNormProfile[] = [
  { itemId: "demolition", laborHoursPerUnit: 0.45, difficultyMultiplier: 1.15, note: "Felujitasi bontas." },
  { itemId: "waste", laborHoursPerUnit: 1.2, difficultyMultiplier: 1, note: "Hulladekkezeles." },
  { itemId: "floor_tiling", laborHoursPerUnit: 0.55, difficultyMultiplier: 1.1, note: "Padloburkolas." },
  { itemId: "wall_tiling", laborHoursPerUnit: 0.68, difficultyMultiplier: 1.15, note: "Falburkolas." },
  { itemId: "painting", laborHoursPerUnit: 0.28, difficultyMultiplier: 1, note: "Belso festes." },
  { itemId: "electric_rewire", laborHoursPerUnit: 0.75, difficultyMultiplier: 1.25, note: "Vezetekcsere." },
  { itemId: "mechanical", laborHoursPerUnit: 1.15, difficultyMultiplier: 1.25, note: "Gepeszeti kiallasok." },
  { itemId: "bathroom", laborHoursPerUnit: 72, difficultyMultiplier: 1.2, note: "Komplex furdoszoba csomag." },
  { itemId: "kitchen", laborHoursPerUnit: 38, difficultyMultiplier: 1.1, note: "Konyhai elokeszites." },
  { itemId: "windows", laborHoursPerUnit: 3.8, difficultyMultiplier: 1.05, note: "Nyilaszarocsere." },
  { itemId: "insulation_facade", laborHoursPerUnit: 0.75, difficultyMultiplier: 1.1, note: "Homlokzati hoszigeteles." },
  { itemId: "roof", laborHoursPerUnit: 0.95, difficultyMultiplier: 1.2, note: "Tetofelujitas." },
  { itemId: "fence_build", laborHoursPerUnit: 0.9, difficultyMultiplier: 1.15, note: "Kerites epites." },
  { itemId: "driveway", laborHoursPerUnit: 0.55, difficultyMultiplier: 1.1, note: "Terburkolat." },
  { itemId: "landscaping", laborHoursPerUnit: 0.2, difficultyMultiplier: 1, note: "Kerti tereprendezes." },
  { itemId: "lawn", laborHoursPerUnit: 0.16, difficultyMultiplier: 1, note: "Fuvesites." },
  { itemId: "irrigation", laborHoursPerUnit: 0.45, difficultyMultiplier: 1.15, note: "Ontozorendszer." },
  { itemId: "tree_planting", laborHoursPerUnit: 1.2, difficultyMultiplier: 1, note: "Novenytelepites." },
  { itemId: "ac_install_5m", laborHoursPerUnit: 5.5, difficultyMultiplier: 1.15, note: "Klima alapszereles." },
  { itemId: "ac_install_plus", laborHoursPerUnit: 7.2, difficultyMultiplier: 1.25, note: "Klima bovitet szereles." },
  { itemId: "solar_pv", laborHoursPerUnit: 4.5, difficultyMultiplier: 1.25, note: "PV rendszer telepites." },
  { itemId: "solar_collector", laborHoursPerUnit: 34, difficultyMultiplier: 1.25, note: "Melegviz rendszer csomag." },
  { itemId: "heat_pump", laborHoursPerUnit: 62, difficultyMultiplier: 1.35, note: "Futesi rendszer csomag." },
  { itemId: "other", laborHoursPerUnit: 12, difficultyMultiplier: 1, note: "Jarulekos munkaido." },
];
export function getHourlyRateProfile(mode: LaborRateMode = "dimpro") {
  if (mode === "official") return hourlyRateProfiles[0];
  if (mode === "internal") return hourlyRateProfiles[2];
  return hourlyRateProfiles[1];
}
export function getLaborNormProfile(itemId: string) { return laborNormProfiles.find((item) => item.itemId === itemId); }
export function calculateLaborUnitPriceFromHourlyRate(input: { itemId: string; discipline: CostDiscipline; fallbackLaborUnitPrice: number; mode?: LaborRateMode }) {
  const rate = getHourlyRateProfile(input.mode ?? "dimpro");
  const norm = getLaborNormProfile(input.itemId);
  const disciplineMultiplier = disciplineRateMultipliers[input.discipline] ?? 1;
  if (!norm || rate.hourlyRate <= 0) {
    return { baseHourlyRate: rate.hourlyRate, disciplineMultiplier, difficultyMultiplier: 1, laborHoursPerUnit: 0, calculatedLaborUnitPrice: input.fallbackLaborUnitPrice, sourceNote: "Demo price used." };
  }
  const price = Math.round(norm.laborHoursPerUnit * rate.hourlyRate * disciplineMultiplier * norm.difficultyMultiplier);
  return { baseHourlyRate: rate.hourlyRate, disciplineMultiplier, difficultyMultiplier: norm.difficultyMultiplier, laborHoursPerUnit: norm.laborHoursPerUnit, calculatedLaborUnitPrice: price, sourceNote: "Hourly calculation." };
}
