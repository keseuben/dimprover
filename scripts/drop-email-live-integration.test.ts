import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createDropPackage } from "../app/lib/drop/dropRepository";
import { parseDropCreatePackageInput } from "../app/lib/drop/dropValidation";
import { getMailProfilesSafeConfig } from "../app/lib/license/mail-profiles";
import { sendDropPackageInvitations } from "../app/lib/drop/dropEmail";

async function main() {
  const requiredConsent = "DROP-EMAIL-TEMPORARY-TEST";
  if (process.env.DROP_ALLOW_EMAIL_INTEGRATION !== requiredConsent) {
    throw new Error(`A teszthez szükséges: DROP_ALLOW_EMAIL_INTEGRATION=${requiredConsent}`);
  }
  assert.equal(process.env.DROP_EMAIL_NOTIFICATIONS_ENABLED?.trim().toLowerCase(), "true");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(supabaseUrl && serviceKey, "A Supabase szerveroldali környezet nincs beállítva.");

  const mailConfig = await getMailProfilesSafeConfig();
  const driveProfile = mailConfig.profiles.find((profile) => profile.id === "drive");
  assert.equal(driveProfile?.enabled, true);
  assert.equal(driveProfile?.smtpConfigured, true);
  const testRecipient = mailConfig.testRecipients[0];
  assert.ok(testRecipient, "Nincs biztonságos SMTP tesztcímzett beállítva.");

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-drop-email-live-test" } },
  });

  const unique = Date.now().toString(36);
  let packageId: string | null = null;
  let cleanupCompleted = false;
  try {
    const input = parseDropCreatePackageInput({
      mode: "file",
      title: `DIMPRO Drop e-mail integrációs teszt ${unique}`,
      description: "Automatikus, ideiglenes teszt. A csomag a futás végén törlődik.",
      projectName: "DIMPRO Drop e-mail ellenőrzés",
      uploaderName: "DIMPRO rendszerellenőrzés",
      uploaderEmail: "info@dimpro.hu",
      retentionDays: 1,
      recipients: [{
        name: "DIMPRO tesztcímzett",
        email: testRecipient,
        receiveInvitation: true,
        receiveActivityNotifications: true,
        receiveFinalReport: false,
      }],
      groups: [],
    });
    const created = await createDropPackage(input, {
      userId: "drop-email-live-test",
      name: "DIMPRO e-mail integrációs teszt",
      email: "info@dimpro.hu",
    });
    packageId = created.package.id;

    const summary = await sendDropPackageInvitations(created);
    assert.equal(summary.enabled, true);
    assert.equal(summary.configured, true);
    assert.equal(summary.attempted, 1);
    assert.equal(summary.sent, 1);
    assert.equal(summary.failed, 0);

    const [recipientResult, eventResult] = await Promise.all([
      client.from("drop_recipients").select("email,invitation_sent_at").eq("package_id", packageId).single(),
      client.from("drop_events").select("event_type,payload").eq("package_id", packageId).eq("event_type", "email.invitation.sent"),
    ]);
    assert.equal(recipientResult.error, null, recipientResult.error?.message);
    assert.ok(recipientResult.data?.invitation_sent_at, "A meghívó kiküldési időpontja nem került mentésre.");
    assert.equal(eventResult.error, null, eventResult.error?.message);
    assert.equal(eventResult.data?.length, 1, "Az e-mail audit esemény hiányzik.");

    console.log(JSON.stringify({
      ok: true,
      smtpProfile: "drive",
      recipientCount: 1,
      invitationSent: summary.sent,
      invitationFailed: summary.failed,
      invitationTimestampPersisted: true,
      auditEventPersisted: true,
      rawCredentialsLogged: false,
    }, null, 2));
  } finally {
    if (packageId) {
      const { error } = await client.from("drop_packages").delete().eq("id", packageId);
      if (error) throw new Error(`DROP_EMAIL_TEST_CLEANUP_FAILED: ${error.message}`);
      const { data, error: verifyError } = await client.from("drop_packages").select("id").eq("id", packageId).maybeSingle();
      if (verifyError) throw new Error(`DROP_EMAIL_TEST_CLEANUP_VERIFY_FAILED: ${verifyError.message}`);
      assert.equal(data, null);
      cleanupCompleted = true;
    }
    console.log(JSON.stringify({ cleanupCompleted, testPackageRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
