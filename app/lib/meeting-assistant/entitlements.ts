export type MeetingAssistantEntitlement = {
  module: "meeting_assistant";
  enabled: boolean;
  pilotMode: boolean;
  source: "environment";
};

export async function getMeetingAssistantEntitlement(): Promise<MeetingAssistantEntitlement> {
  return {
    module: "meeting_assistant",
    enabled: process.env.MEETING_ASSISTANT_ENABLED !== "false",
    pilotMode: process.env.MEETING_ASSISTANT_PILOT_MODE !== "false",
    source: "environment",
  };
}

export async function requireMeetingAssistantEntitlement() {
  const entitlement = await getMeetingAssistantEntitlement();
  if (!entitlement.enabled) {
    throw new Error("A DIMPRO Értekezleti Asszisztens modul jelenleg nincs engedélyezve.");
  }
  return entitlement;
}
