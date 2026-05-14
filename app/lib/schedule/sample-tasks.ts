import { ScheduleTask } from "./types";

export const sampleScheduleTasks: ScheduleTask[] = [
  {
    id: 101,
    order: 1,
    name: "Felvonulási terület kialakítása",
    contractor: "Minta Kft.",
    category: "Előkészítés",
    startWeek: 1,
    duration: 1,
    contractStartWeek: 1,
    contractDuration: 1,
    actualStartWeek: 1,
    actualDuration: 1,
    startDate: "2026-05-11",
    endDate: "2026-05-17",
    contractStartDate: "2026-05-11",
    contractEndDate: "2026-05-17",
    actualStartDate: "2026-05-11",
    actualEndDate: "2026-05-17",
    progress: 80,
    predecessors: [],
  },
];
