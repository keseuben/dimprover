import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  getDropSchemaHealth,
  createDropPackage,
} from "../app/lib/drop/dropRepository";
import {
  openDropPackageWithPin,
  validateDropAccessToken,
} from "../app/lib/drop/dropAccess";
import { parseDropCreatePackageInput } from "../app/lib/drop/dropValidation";

async function main() {
  const requiredConsent = "DROP-020-TEMPORARY-TEST";
  if (process.env.DROP_ALLOW_INTEGRATION_WRITE !== requiredConsent) {
    console.error(
      `DROP post-activation integration: SKIPPED – set DROP_ALLOW_INTEGRATION_WRITE=${requiredConsent} only after the final bootstrap activation.`,
    );
    process.exit(3);
  }

  if (process.env.DROP_RELEASE_GATE_ENABLED?.trim().toLowerCase() === "true") {
    throw new Error("DROP_INTEGRATION_REQUIRES_CLOSED_RELEASE_GATE");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(supabaseUrl && serviceKey, "A Supabase szerveroldali környezet nincs beállítva.");

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-drop/0.2.0-integration" } },
  });

  const health = await getDropSchemaHealth();
  assert.equal(health.ready, true, `A DROP 0.2.0 séma nem kész: ${health.errorCode || "ismeretlen hiba"}`);
  assert.equal(health.schemaVersion.actual, "DROP 0.2.0");
  assert.equal(health.schemaVersion.migrationCount, 6);

  const unique = Date.now().toString(36);
  const normalizedInput = parseDropCreatePackageInput({
    mode: "mixed",
    title: `DROP 0.2.0 integrációs teszt ${unique}`,
    description: "Automatikusan törlendő, fájl nélküli csomagmotor-integrációs teszt.",
    projectName: "DROP 0.2.0 activation verification",
    uploaderName: "DIMPRO integrációs teszt",
    uploaderEmail: "drop-integration@dimpro.hu",
    retentionDays: 1,
    recipients: [
      {
        name: "Teszt címzett",
        email: `drop-recipient-${unique}@example.hu`,
        receiveInvitation: false,
        receiveActivityNotifications: false,
        receiveFinalReport: false,
      },
    ],
    groups: [
      { name: "Helyszíni fotók", sequenceStart: 1 },
      { name: "Dokumentumok", sequenceStart: 10 },
    ],
  });

  let packageId: string | null = null;
  let cleaned = false;

  try {
    const created = await createDropPackage(normalizedInput, {
      userId: "drop-020-integration",
      name: "DIMPRO integrációs teszt",
      email: "drop-integration@dimpro.hu",
    });
    packageId = created.package.id;

    assert.match(created.pin, /^\d{6}$/);
    assert.equal(new Set(Object.values(created.rawTokens)).size, 4);

    const [packageResult, recipientResult, groupResult, tokenResult, eventResult] = await Promise.all([
      client.from("drop_packages").select("id,public_code,status,pin_hash,pin_salt").eq("id", packageId).single(),
      client.from("drop_recipients").select("id,email").eq("package_id", packageId),
      client.from("drop_groups").select("id,code").eq("package_id", packageId),
      client.from("drop_access_tokens").select("id,purpose,token_hash,token_hint,status,use_count").eq("package_id", packageId),
      client.from("drop_events").select("id,event_type,payload").eq("package_id", packageId),
    ]);

    for (const result of [packageResult, recipientResult, groupResult, tokenResult, eventResult]) {
      assert.equal(result.error, null, result.error?.message);
    }

    const persistedPackage = packageResult.data;
    assert.ok(persistedPackage, "A létrehozott Drop csomag nem olvasható vissza.");
    assert.equal(persistedPackage.status, "active");
    assert.notEqual(persistedPackage.pin_hash, created.pin);
    assert.equal(recipientResult.data?.length, 1);
    assert.equal(groupResult.data?.length, 2);
    assert.equal(tokenResult.data?.length, 4);
    assert.deepEqual(
      [...new Set((tokenResult.data || []).map((token) => token.purpose))].sort(),
      ["download", "report", "upload", "view"],
    );
    assert.ok(eventResult.data?.some((event) => event.event_type === "package.created"));

    const persisted = JSON.stringify({
      package: persistedPackage,
      recipients: recipientResult.data,
      groups: groupResult.data,
      tokens: tokenResult.data,
      events: eventResult.data,
    });
    assert.equal(persisted.includes(created.pin), false, "A nyers PIN adatbázisrekordban jelent meg.");
    for (const rawToken of Object.values(created.rawTokens)) {
      assert.equal(persisted.includes(rawToken), false, "Nyers capability token adatbázisrekordban jelent meg.");
    }

    const headers = new Headers({
      "x-forwarded-for": "127.0.0.1",
      "user-agent": "DIMPRO Drop 0.2.0 post-activation integration",
    });
    const pinGrant = await openDropPackageWithPin({
      publicCode: created.package.public_code,
      pin: created.pin,
      purpose: "view",
      headers,
    });
    const tokenGrant = await validateDropAccessToken({
      rawToken: pinGrant.rawToken,
      expectedPurpose: "view",
      headers,
    });
    assert.equal(tokenGrant.packageId, packageId);
    assert.equal(tokenGrant.purpose, "view");

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.2.0",
      packageCreated: true,
      packageStatus: created.package.status,
      recipientCount: recipientResult.data?.length || 0,
      groupCount: groupResult.data?.length || 0,
      initialTokenCount: tokenResult.data?.length || 0,
      pinGateValidated: true,
      viewTokenValidated: true,
      rawCredentialsPersisted: false,
      filesCreated: 0,
      releaseGateEnabled: false,
    }, null, 2));
  } finally {
    if (packageId) {
      const { error } = await client.from("drop_packages").delete().eq("id", packageId);
      if (error) throw new Error(`DROP_INTEGRATION_CLEANUP_FAILED: ${error.message}`);

      const { data, error: verifyError } = await client
        .from("drop_packages")
        .select("id")
        .eq("id", packageId)
        .maybeSingle();
      if (verifyError) throw new Error(`DROP_INTEGRATION_CLEANUP_VERIFY_FAILED: ${verifyError.message}`);
      assert.equal(data, null, "Az integrációs tesztcsomag törlése nem történt meg.");
      cleaned = true;
    }

    console.log(JSON.stringify({
      cleanupRequired: true,
      cleanupCompleted: cleaned,
      testPackageIdRetained: false,
      publicCodeRetained: false,
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
