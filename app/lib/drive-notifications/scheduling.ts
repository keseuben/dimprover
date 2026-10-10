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


/**
 * Hour-granularity recovery if a scheduled execution is a few minutes late.
 * A scheduler must not silently lose a 07:00 slot when its run starts at 07:05.
 * Maximum catch-up is intentionally bounded; caller decides overdue policy.
 */
export function latestDueDigestSlot(
  frequency: DigestFrequency,
  now: Date,
  isWorkingDay?: IsWorkingDay,
): {slot: string; scheduledAt: Date; latenessMinutes: number}|null {
  if (!Number.isFinite(now.getTime()) || frequency === "NONE") return null;
  const maximumHours:Record<Exclude<DigestFrequency,"NONE">,number>={
    FOUR_HOURLY:5,EIGHT_HOURLY:9,DAILY:26,WEEKLY:8*24,MONTHLY:36*24,
  };
  const rounded=new Date(Math.floor(now.getTime()/3600000)*3600000);
  for(let ago=0;ago<maximumHours[frequency];ago++){
    const point=new Date(rounded.getTime()-ago*3600000);
    const slot=digestScheduleSlot(frequency,point,isWorkingDay);
    if(slot){
      return {slot,scheduledAt:point,latenessMinutes:Math.floor((now.getTime()-point.getTime())/60000)};
    }
  }
  return null;
}
