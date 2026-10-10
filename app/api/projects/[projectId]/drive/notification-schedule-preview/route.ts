import { NextResponse, type NextRequest } from "next/server";
import { getDatabaseClient } from "@/app/lib/drive-core/databaseRepository";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { planDigestScheduler, type DigestSchedulerSubscription } from "@/app/lib/drive-notifications/schedulerPlan";
import { loadApprovedHuWorkdays } from "@/app/lib/drive-notifications/huCalendarRepository";
import type { DigestCategory } from "@/app/lib/drive-notifications/digestCore";
import type { DigestFrequency } from "@/app/lib/drive-notifications/scheduling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ projectId: string }> };
const noStore = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

type DbPreference = {
  user_id: string; category: DigestCategory; enabled: boolean; digest_frequency: DigestFrequency;
};

/** A read-only admin tool. No SMTP transport and no queue insertion.
 * All output consists of counts + scheduled slots, not recipient identities.
 */
export async function GET(request: NextRequest, context: Context) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "audit.read");
  if (!access.ok) return NextResponse.json({ ok:false,error:access.error },{status:access.status,headers:noStore});
  if (!access.access.permissions.includes("project.manage_members")) {
    return NextResponse.json({ ok:false,error:"ADMIN_PERMISSION_REQUIRED" },{status:403,headers:noStore});
  }
  try {
    const { data, error } = await getDatabaseClient()
      .from("drive_core_notification_preferences")
      .select("user_id,category,enabled,digest_frequency")
      .eq("project_id",projectId).limit(2001);
    if (error) throw new Error("PREFERENCES_SCHEMA_NOT_READY");
    const prefs = (data || []) as DbPreference[];
    if (prefs.length > 2000) {
      return NextResponse.json({ ok:false,error:"SCHEDULE_PREVIEW_LIMIT_EXCEEDED" },{status:409,headers:noStore});
    }
    const now = new Date();
    let calendarReady = true;
    let calendar;
    if (prefs.some((p) => p.enabled && p.digest_frequency === "MONTHLY")) {
      try { calendar = await loadApprovedHuWorkdays(now); }
      catch { calendarReady = false; }
    }
    const subscriptions: DigestSchedulerSubscription[] = prefs.map((p) => ({
      projectId,userId:p.user_id,category:p.category,enabled:p.enabled,frequency:p.digest_frequency,
    }));
    const plan = planDigestScheduler({ subscriptions, now, isWorkingDay: calendar, maxCandidates: 500 });
    const aggregate = new Map<string,number>();
    for (const candidate of plan.candidates) {
      const key = candidate.category + ":" + candidate.scheduledSlot;
      aggregate.set(key,(aggregate.get(key) || 0) + 1);
    }
    const windows = [...aggregate].map(([key,count])=>{
      const split=key.indexOf(":");
      return { category:key.slice(0,split) as DigestCategory,scheduledSlot:key.slice(split+1),count };
    });
    return NextResponse.json({ok:true,now:now.toISOString(),calendarReady,
      examined:plan.examined,disabled:plan.disabled,notDue:plan.notDue,
      duplicates:plan.duplicates,truncated:plan.truncated,candidateCount:plan.candidates.length,
      windows,note:"Olvasási előnézet, nem engedély és nem kézbesítés. A jogosultságokat a tényleges producer később újraellenőrzi."},
      {headers:noStore});
  }catch {
    return NextResponse.json({ok:false,error:"SCHEDULE_PREVIEW_UNAVAILABLE"},{status:503,headers:noStore});
  }
}
