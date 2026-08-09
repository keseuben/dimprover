import { headers } from "next/headers";
import { redirect } from "next/navigation";
import MeetingAssistantHome from "@/components/meeting-assistant/MeetingAssistantHome";
import MeetingAssistantWorkspace from "@/components/meeting-assistant/MeetingAssistantWorkspace";
import { createMeetingAccessToken } from "@/app/lib/meeting-assistant/access";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DimproMeetingAssistantPage({ searchParams }: PageProps) {
  const headerList = await headers();
  const host = (headerList.get("host") || "").split(":")[0].toLowerCase();
  const params = await searchParams;
  const meetingId = typeof params.meetingId === "string" ? params.meetingId.trim() : "";

  if (host === "dimprover.hu" || host === "www.dimprover.hu") {
    const target = meetingId
      ? `https://app.dimpro.hu/ertekezleti-kisero?meetingId=${encodeURIComponent(meetingId)}`
      : "https://app.dimpro.hu/ertekezleti-kisero";
    redirect(target);
  }

  if (!meetingId) {
    const homeAccessToken = createMeetingAccessToken("meeting-assistant-home", "dimpro-web-preview");
    return <MeetingAssistantHome accessToken={homeAccessToken} />;
  }

  const previewAccessToken = createMeetingAccessToken(meetingId, "dimpro-web-preview");
  const participantPreviewAccessToken = createMeetingAccessToken(meetingId, "dimpro-web-participant-preview");
  return (
    <MeetingAssistantWorkspace
      meetingId={meetingId}
      previewAccessToken={previewAccessToken}
      participantPreviewAccessToken={participantPreviewAccessToken}
    />
  );
}