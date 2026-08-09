import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LegacyMeetingAssistantRedirect({ searchParams }: PageProps) {
  const params = await searchParams;
  const meetingId = typeof params.meetingId === "string" ? params.meetingId : "dimpro-demo-meeting";
  redirect(`https://app.dimpro.hu/ertekezleti-kisero?meetingId=${encodeURIComponent(meetingId)}`);
}