import "server-only";
import { getDatabaseClient } from "@/app/lib/drive-core/databaseRepository";
import { calendarWindowMonths, createApprovedHuCalendar, type ApprovedDayRecord } from "./huCalendarCore";
import type { IsWorkingDay } from "./scheduling";

type Row = {
  calendar_date:string;is_working_day:boolean;source_reference:string;
  approved_by:string;approved_at:string;
};

/** This lookup reads only. Monthly delivery remains unavailable without full,
 * explicitly human-approved, provenance-bearing HU calendar records.
 */
export async function loadApprovedHuWorkdays(at:Date):Promise<IsWorkingDay>{
  const months=calendarWindowMonths(at);
  const from=months[0].start,to=months[months.length-1].end;
  const {data,error}=await getDatabaseClient()
    .from("drive_notification_hu_calendar")
    .select("calendar_date,is_working_day,source_reference,approved_by,approved_at")
    .gte("calendar_date",from).lte("calendar_date",to)
    .order("calendar_date",{ascending:true}).limit(120);
  if(error)throw new Error("HU_CALENDAR_DATA_NOT_AVAILABLE");
  const entries:ApprovedDayRecord[] = ((data||[]) as Row[]).map((r)=>({
    calendarDate:r.calendar_date,isWorkingDay:r.is_working_day,
    sourceReference:r.source_reference,approvedBy:r.approved_by,approvedAt:r.approved_at,
  }));
  return createApprovedHuCalendar(months,entries);
}
