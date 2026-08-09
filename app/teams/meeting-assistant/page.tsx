import TeamsMeetingAssistantClient from "@/components/meeting-assistant/TeamsMeetingAssistantClient";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TeamsMeetingAssistantPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const meetingId = typeof params.meetingId === "string" ? params.meetingId : "dimpro-teams-meeting";
  const accessToken = typeof params.accessToken === "string" ? params.accessToken : "";
  return (
    <TeamsMeetingAssistantClient
      fallbackMeetingId={meetingId}
      initialRole="participant"
      accessToken={accessToken}
    />
  );
}
