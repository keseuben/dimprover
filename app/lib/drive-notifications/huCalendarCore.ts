import type { IsWorkingDay } from "./scheduling";

export type ApprovedDayRecord = {
  calendarDate: string;
  isWorkingDay: boolean;
  sourceReference: string;
  approvedBy: string;
  approvedAt: string;
};

function dateKeyUTC(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
export function enumerateCalendarDates(from: string, to: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("HU_CALENDAR_INVALID_RANGE_FORMAT");
  }
  const start = Date.parse(from + "T12:00:00Z");
  const end = Date.parse(to + "T12:00:00Z");
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end
    || end - start > 40 * 86400000) throw new Error("HU_CALENDAR_INVALID_RANGE");
  const result: string[] = [];
  for (let time = start; time <= end; time += 86400000) {
    const date = new Date(time);
    const iso = dateKeyUTC(date.getUTCFullYear(), date.getUTCMonth()+1, date.getUTCDate());
    result.push(iso);
  }
  if (result[0]!==from || result[result.length-1]!==to) throw new Error("HU_CALENDAR_INVALID_CIVIL_DATE");
  return result;
}
export function calendarWindowMonths(now: Date): {start: string; end: string}[] {
  if(!Number.isFinite(now.getTime())) throw new Error("HU_CALENDAR_DATE_INVALID");
  // Support maximum 36-day monthly catch-up window + one-day guard.
  const from = new Date(now.getTime()-37*86400000);
  const months = new Map<string,{start:string;end:string}>();
  for(const at of [from,now]){
    const year=at.getUTCFullYear(),month=at.getUTCMonth()+1;
    const lastDay = new Date(Date.UTC(year,month,0)).getUTCDate();
    const start=dateKeyUTC(year,month,1);
    months.set(start,{start,end:dateKeyUTC(year,month,lastDay)});
  }
  // An interval spanning two month changes (e.g. March 1 back to January) needs February too.
  const cursor=new Date(Date.UTC(from.getUTCFullYear(),from.getUTCMonth(),1));
  const final = Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1);
  for(;cursor.getTime()<=final;cursor.setUTCMonth(cursor.getUTCMonth()+1)){
    const year=cursor.getUTCFullYear(),month=cursor.getUTCMonth()+1;
    const start=dateKeyUTC(year,month,1);
    const end=dateKeyUTC(year,month,new Date(Date.UTC(year,month,0)).getUTCDate());
    months.set(start,{start,end});
  }
  return [...months.values()].sort((a,b)=>a.start.localeCompare(b.start));
}

/** Completely missing, unreviewed, duplicate or invalid dates fail CLOSED.
 * No "weekends are non-working" inference: HU swapped Saturdays are legal workdays.
 */
export function createApprovedHuCalendar(
  months:readonly {start:string;end:string}[],
  rows:readonly ApprovedDayRecord[],
):IsWorkingDay {
  if (!months.length)throw new Error("HU_CALENDAR_MONTHS_REQUIRED");
  const byDate=new Map<string,boolean>();
  for(const row of rows){
    if(byDate.has(row.calendarDate))throw new Error("HU_CALENDAR_DUPLICATE_DATE");
    if(!row.sourceReference?.trim() || !row.approvedBy?.trim()
      || !row.approvedAt || !Number.isFinite(Date.parse(row.approvedAt))
      || typeof row.isWorkingDay!=="boolean")
      throw new Error("HU_CALENDAR_UNAPPROVED_RECORD");
    byDate.set(row.calendarDate,row.isWorkingDay);
  }
  for(const month of months){
    const days=enumerateCalendarDates(month.start,month.end);
    if (days[0]?.slice(8)!=="01" || month.start.slice(0,7)!==month.end.slice(0,7)
      || new Date(month.end+"T12:00:00Z").getUTCDate()!==days.length){
      throw new Error("HU_CALENDAR_INCOMPLETE_MONTH_RANGE");
    }
    for(const day of days){
      if(!byDate.has(day))throw new Error("HU_CALENDAR_MONTH_INCOMPLETE:"+day);
    }
  }
  return (day)=>{
    if(!byDate.has(day))throw new Error("HU_CALENDAR_OUTSIDE_APPROVED_WINDOW:"+day);
    return byDate.get(day)===true;
  };
}
