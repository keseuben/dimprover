import MeetingAiDocumentStudio from "@/components/meeting-assistant/MeetingAiDocumentStudio";
import "@/components/meeting-assistant/teams-meeting-theme.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TeamsMeetingAiStudioPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const meetingId = typeof params.meetingId === "string" ? params.meetingId : "dimpro-teams-meeting";
  const accessToken = typeof params.accessToken === "string" ? params.accessToken : "";

  return (
    <main className="dimpro-meeting-theme meeting-web-shell min-h-screen bg-[#edf3f2] p-3 sm:p-5" data-theme="default">
      <MeetingAiDocumentStudio meetingId={meetingId} accessToken={accessToken} />
    </main>
  );
}
