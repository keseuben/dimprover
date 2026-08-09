import MeetingCaptureWorkspace from "@/components/meeting-assistant/MeetingCaptureWorkspace";
import { meetingTokenAllowsOrganizer, verifyMeetingAccessToken } from "@/app/lib/meeting-assistant/access";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MeetingCapturePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const meetingId = typeof params.meetingId === "string" ? params.meetingId : "";
  const accessToken = typeof params.accessToken === "string" ? params.accessToken : "";
  const payload = verifyMeetingAccessToken(accessToken, meetingId);

  if (!payload || !meetingTokenAllowsOrganizer(payload)) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
        <div className="max-w-lg rounded-3xl border border-rose-300/20 bg-white/10 p-8 text-center shadow-2xl">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="mx-auto h-11 w-11 text-rose-300" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <h1 className="mt-5 text-2xl font-black">A képernyőrögzítő csak a szervező számára érhető el</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">Nyisd meg a funkciót a párosított DIMPRO Értekezleti Kísérő szervezői paneljéből.</p>
        </div>
      </main>
    );
  }

  return <MeetingCaptureWorkspace meetingId={meetingId} accessToken={accessToken} />;
}
