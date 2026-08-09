import MeetingArchiveClient from "@/components/meeting-assistant/MeetingArchiveClient";
import { listMeetingArchive } from "@/app/lib/meeting-assistant/store";
import { createMeetingAccessToken } from "@/app/lib/meeting-assistant/access";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Értekezletek | DIMPRO",
  description: "DIMPRO értekezleti archívum és visszakereshető meetingmunkaterek.",
};

export default async function MeetingsArchivePage() {
  const meetings = await listMeetingArchive();
  const accessToken = createMeetingAccessToken("meeting-assistant-home", "dimpro-web-preview");
  return <MeetingArchiveClient meetings={meetings} accessToken={accessToken} />;
}
