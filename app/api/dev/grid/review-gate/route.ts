import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { evaluateDeveloperGridReviewGate, type DeveloperGridReviewGateTarget } from "@/app/lib/developer-grid/review-gate";
import { getDeveloperGridVGuardReadiness, requestDeveloperGridVGuardReview } from "@/app/lib/developer-grid/vguard-review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function json(payload: unknown, status = 200) { return NextResponse.json(payload, { status, headers:{ "cache-control":"no-store", "x-dimpro-environment":"DEV", "x-dimpro-production-access":"DENY" } }); }

export async function GET(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ok:false,error:"A Developer Grid eszköz nincs párosítva."},401);
  const raw = String(request.nextUrl.searchParams.get("target") || "REVIEW").toUpperCase();
  const target: DeveloperGridReviewGateTarget = raw === "BUILD" || raw === "CLOSURE" ? raw : "REVIEW";
  const taskId = String(request.nextUrl.searchParams.get("taskId") || "").trim() || undefined;
  try {
    const gate = await evaluateDeveloperGridReviewGate({taskId,target});
    const vguard = target === "REVIEW" ? await getDeveloperGridVGuardReadiness(taskId) : null;
    return json({ok:true,gate,vguard});
  }
  catch (error) { return json({ok:false,error:error instanceof Error?error.message:"A Developer Grid review gate nem értékelhető."},500); }
}

export async function POST(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ok:false,error:"A Developer Grid eszköz nincs párosítva."},401);
  try {
    const review = await requestDeveloperGridVGuardReview(await request.json().catch(()=>({})));
    return json({ok:review.ok,review},review.ok?200:409);
  } catch (error) {
    const code=error&&typeof error==="object"&&"code" in error?String((error as {code?:unknown}).code||"DEVELOPER_GRID_VGUARD_REVIEW_FAILED"):"DEVELOPER_GRID_VGUARD_REVIEW_FAILED";
    return json({ok:false,code,error:error instanceof Error?error.message:"A V.Guard review sikertelen."},500);
  }
}
