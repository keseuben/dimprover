export type DigestFrequency = "FOUR_HOURLY" | "EIGHT_HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "NONE";
type LocalBudapestTime = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

export function budapestTime(at: Date): LocalBudapestTime {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Budapest",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
    minute: "2-digit", weekday: "short", hourCycle: "h23",
  });
  const fields = Object.fromEntries(formatter.formatToParts(at).map((piece) => [piece.type, piece.value]));
  const days: Record<string,number> = { Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7 };
  return { year:Number(fields.year),month:Number(fields.month),day:Number(fields.day),
    hour:Number(fields.hour),minute:Number(fields.minute),weekday:days[fields.weekday] || 0 };
}

export function localDateKey(date: Pick<LocalBudapestTime,"year"|"month"|"day">) {
  return `${date.year}-${String(date.month).padStart(2,"0")}-${String(date.day).padStart(2,"0")}`;
}

/**
 * Must be supplied from an authoritative HU working-day calendar.
 * No implicit public-holiday or working-Saturday guessing for monthly digests.
 */
export type IsWorkingDay = (localDate: string) => boolean;

export function digestScheduleSlot(
  frequency: DigestFrequency,
  at: Date,
  isWorkingDay?: IsWorkingDay,
): string | null {
  const p = budapestTime(at);
  if (!p.weekday || p.minute !== 0 || frequency === "NONE") return null;
  const dateKey = localDateKey(p);
  const slot = `${dateKey}T${String(p.hour).padStart(2,"0")}:00-Europe/Budapest`;
  if (frequency === "FOUR_HOURLY") return p.hour % 4 === 0 ? slot : null;
  if (frequency === "EIGHT_HOURLY") return p.hour % 8 === 0 ? slot : null;
  if (p.hour !== 7) return null;
  if (frequency === "DAILY") return slot;
  if (frequency === "WEEKLY") return p.weekday === 1 ? slot : null;
  if (frequency === "MONTHLY") {
    if (!isWorkingDay || !isWorkingDay(dateKey)) return null; // fail closed absent authoritative calendar
    for (let day = 1; day < p.day; day++) {
      if (isWorkingDay(localDateKey({year:p.year,month:p.month,day}))) return null;
    }
    return slot;
  }
  return null;
}
