import { ScheduleLocation, ScheduleTask } from "@/app/lib/schedule/types";

function task(
  id: number,
  order: number,
  name: string,
  contractor: string,
  category: string,
  startWeek: number,
  duration: number,
  startDate: string,
  endDate: string,
  progress: number,
  predecessors: number[] = [],
  contractOffsetDays = 0,
  contractExtraDays = 0
): ScheduleTask {
  const contractStart = new Date(startDate);
  contractStart.setDate(contractStart.getDate() + contractOffsetDays);

  const contractEnd = new Date(endDate);
  contractEnd.setDate(contractEnd.getDate() + contractOffsetDays + contractExtraDays);

  const toIso = (date: Date) => date.toISOString().split("T")[0];

  return {
    id,
    order,
    name,
    contractor,
    category,
    startWeek,
    duration,
    contractStartWeek: startWeek,
    contractDuration: Math.max(1, duration + Math.ceil(contractExtraDays / 7)),
    actualStartWeek: startWeek,
    actualDuration: duration,
    startDate,
    endDate,
    contractStartDate: toIso(contractStart),
    contractEndDate: toIso(contractEnd),
    actualStartDate: startDate,
    actualEndDate: endDate,
    progress,
    predecessors,
  };
}

export const initialSchedule: ScheduleLocation[] = [
  {
    id: "location-1",
    name: "I. ütem / Északi terület",
    type: "location",
    buildings: [
      {
        id: "building-1",
        name: "A épület - lakószárny",
        type: "building",
        categories: [
          {
            id: "category-1",
            name: "Előkészítés",
            color: "bg-slate-600",
            lightColor: "bg-slate-200",
            tasks: [
              task(1, 1, "Felvonulás és ideiglenes közművek", "Generálkivitelező Kft.", "Előkészítés", 1, 2, "2026-05-05", "2026-05-18", 100),
              task(2, 2, "Munkaterület átadás-átvétel", "Beruházó / Műszaki ellenőr", "Előkészítés", 3, 1, "2026-05-19", "2026-05-25", 70, [1]),
              task(3, 3, "Organizációs terv véglegesítése", "Projektvezetés", "Előkészítés", 4, 2, "2026-05-26", "2026-06-08", 30, [2]),
            ],
          },
          {
            id: "category-2",
            name: "Földmunka",
            color: "bg-amber-600",
            lightColor: "bg-amber-200",
            tasks: [
              task(4, 4, "Humuszleszedés és tereprendezés", "Földgép 2000 Kft.", "Földmunka", 6, 2, "2026-06-09", "2026-06-22", 10, [3]),
              task(5, 5, "Alapkiemelés", "Földgép 2000 Kft.", "Földmunka", 8, 3, "2026-06-23", "2026-07-13", 0, [4]),
            ],
          },
          {
            id: "category-3",
            name: "Szerkezetépítés",
            color: "bg-orange-600",
            lightColor: "bg-orange-200",
            tasks: [
              task(6, 6, "Sávalap és alaplemez betonozás", "Beton-Projekt Kft.", "Szerkezetépítés", 11, 3, "2026-07-14", "2026-08-03", 0, [5]),
              task(7, 7, "Földszinti teherhordó falak", "Falazó Bau Kft.", "Szerkezetépítés", 14, 4, "2026-08-04", "2026-08-31", 0, [6]),
              task(8, 8, "Födémszerkezet készítése", "Beton-Projekt Kft.", "Szerkezetépítés", 18, 3, "2026-09-01", "2026-09-21", 0, [7]),
            ],
          },
        ],
      },
      {
        id: "building-2",
        name: "B épület - kiszolgáló szárny",
        type: "building",
        categories: [
          {
            id: "category-4",
            name: "Kivitelezés",
            color: "bg-blue-600",
            lightColor: "bg-blue-200",
            tasks: [
              task(9, 9, "B épület alapozás", "Beton-Projekt Kft.", "Kivitelezés", 10, 3, "2026-07-07", "2026-07-27", 0, [5]),
              task(10, 10, "B épület szerkezetépítés", "Szerkezet Plusz Kft.", "Kivitelezés", 13, 5, "2026-07-28", "2026-08-31", 0, [9]),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "location-2",
    name: "II. ütem / Déli terület",
    type: "location",
    buildings: [
      {
        id: "building-3",
        name: "Külső közmű és útépítés",
        type: "building",
        categories: [
          {
            id: "category-5",
            name: "Közmű",
            color: "bg-emerald-600",
            lightColor: "bg-emerald-200",
            tasks: [
              task(11, 11, "Csapadékvíz elvezetés", "Közmű Generál Kft.", "Közmű", 15, 4, "2026-08-11", "2026-09-07", 0, [4]),
              task(12, 12, "Ideiglenes út és depónia rendezés", "Útépítő Kft.", "Közmű", 19, 3, "2026-09-08", "2026-09-28", 0, [11]),
            ],
          },
          {
            id: "category-6",
            name: "Átadás",
            color: "bg-purple-600",
            lightColor: "bg-purple-200",
            tasks: [
              task(13, 13, "Műszaki ellenőri bejárás", "Műszaki ellenőr", "Átadás", 23, 1, "2026-10-06", "2026-10-12", 0, [8, 10, 12]),
              task(14, 14, "I. ütem részátadás", "Projektvezetés", "Átadás", 24, 1, "2026-10-13", "2026-10-19", 0, [13]),
            ],
          },
        ],
      },
    ],
  },
];
