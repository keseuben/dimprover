#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv.includes("--apply") ? "apply" : "check";
const organizationId = process.env.ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID?.trim() || "";
const publicUserCode = process.env.DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_PUBLIC_CODE?.trim() || "USR-26-ARUT-WKMR";
const email = (process.env.DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_EMAIL?.trim() || "commerce-mirror-worker@dev.dimpro.invalid").toLowerCase();
const fullName = process.env.DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_NAME?.trim() || "DIMPRO Commerce Mirror Worker DEV";
const roleCode = "COMMERCE_MIRROR_WORKER";

function fail(code, message, details = {}) {
  console.error(JSON.stringify({ ok: false, mode, code, message, ...details }, null, 2));
  process.exit(2);
}

function assertDevOnly() {
  const cwd = process.cwd();
  if (os.hostname() !== "dimpro-dev" || !path.resolve(cwd).startsWith("/srv/dimpro-dev/")) {
    fail("COMMERCE_WORKER_PROVISION_DEV_ONLY", "A worker provisioning kizárólag dimpro-dev alatt futtatható.", { hostname: os.hostname(), cwd });
  }
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !key || key.includes("<") || key.includes(">")) fail("COMMERCE_WORKER_PROVISION_CONFIG_MISSING", "Hiányzik a DEV Supabase service konfiguráció.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function loadState(client) {
  if (!organizationId) fail("COMMERCE_WORKER_PROVISION_ORG_REQUIRED", "ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID kötelező.");
  const org = await client.from("dimpro_organizations").select("id,status,public_organization_code").eq("id", organizationId).maybeSingle();
  if (org.error) fail("COMMERCE_WORKER_PROVISION_ORG_QUERY_FAILED", org.error.message);
  if (!org.data || org.data.status !== "active") fail("COMMERCE_WORKER_PROVISION_ORG_NOT_ACTIVE", "A cél szervezet nem aktív.");

  const user = await client.from("dimpro_users").select("id,public_user_code,auth_user_id,status,email_normalized,full_name").or(`public_user_code.eq.${publicUserCode},email_normalized.eq.${email}`).limit(2);
  if (user.error) fail("COMMERCE_WORKER_PROVISION_USER_QUERY_FAILED", user.error.message);
  if ((user.data || []).length > 1) fail("COMMERCE_WORKER_PROVISION_USER_AMBIGUOUS", "Több technikai actor jelölt található.");
  const actor = user.data?.[0] || null;
  if (actor?.auth_user_id) fail("COMMERCE_WORKER_PROVISION_INTERACTIVE_ACTOR", "A technikai worker actorhoz nem tartozhat auth_user_id.");

  let membership = null;
  if (actor) {
    const result = await client.from("dimpro_organization_memberships").select("id,user_id,organization_id,role_code,status,access_ends_at,is_primary").eq("user_id", actor.id).eq("organization_id", organizationId).neq("status", "revoked").maybeSingle();
    if (result.error) fail("COMMERCE_WORKER_PROVISION_MEMBERSHIP_QUERY_FAILED", result.error.message);
    membership = result.data || null;
  }
  return { org: org.data, actor, membership };
}

function ready(state) {
  const actorReady = Boolean(state.actor && state.actor.auth_user_id === null && state.actor.status === "active" && state.actor.public_user_code === publicUserCode && state.actor.email_normalized === email);
  const membershipReady = Boolean(state.membership && state.membership.status === "active" && state.membership.role_code === roleCode && !state.membership.access_ends_at && state.membership.is_primary === false);
  return { actorReady, membershipReady, ready: actorReady && membershipReady };
}

async function main() {
  assertDevOnly();
  const client = admin();
  let state = await loadState(client);
  let readiness = ready(state);
  if (mode === "check") {
    console.log(JSON.stringify({ ok: true, mode, organizationId, publicUserCode, actorUserId: state.actor?.id || null, membershipId: state.membership?.id || null, ...readiness }, null, 2));
    return;
  }

  let actor = state.actor;
  if (!actor) {
    const created = await client.from("dimpro_users").insert({
      public_user_code: publicUserCode,
      auth_user_id: null,
      full_name: fullName,
      email,
      email_normalized: email,
      email_verified_at: new Date().toISOString(),
      status: "active",
    }).select("id,public_user_code,auth_user_id,status,email_normalized,full_name").single();
    if (created.error || !created.data) fail("COMMERCE_WORKER_PROVISION_USER_CREATE_FAILED", created.error?.message || "A technikai actor nem hozható létre.");
    actor = created.data;
  } else if (actor.status !== "active" || actor.full_name !== fullName) {
    const updated = await client.from("dimpro_users").update({ status: "active", full_name: fullName, updated_at: new Date().toISOString() }).eq("id", actor.id).is("auth_user_id", null).select("id,public_user_code,auth_user_id,status,email_normalized,full_name").single();
    if (updated.error || !updated.data) fail("COMMERCE_WORKER_PROVISION_USER_UPDATE_FAILED", updated.error?.message || "A technikai actor nem frissíthető.");
    actor = updated.data;
  }

  if (!state.membership) {
    const createdMembership = await client.from("dimpro_organization_memberships").insert({
      user_id: actor.id,
      organization_id: organizationId,
      role_code: roleCode,
      role_label: "Commerce Mirror Worker",
      status: "active",
      joined_at: new Date().toISOString(),
      access_ends_at: null,
      is_primary: false,
    }).select("id").single();
    if (createdMembership.error) fail("COMMERCE_WORKER_PROVISION_MEMBERSHIP_CREATE_FAILED", createdMembership.error.message);
  } else if (state.membership.role_code !== roleCode || state.membership.status !== "active" || state.membership.access_ends_at || state.membership.is_primary) {
    const updatedMembership = await client.from("dimpro_organization_memberships").update({ role_code: roleCode, role_label: "Commerce Mirror Worker", status: "active", access_ends_at: null, is_primary: false, updated_at: new Date().toISOString() }).eq("id", state.membership.id).select("id").single();
    if (updatedMembership.error) fail("COMMERCE_WORKER_PROVISION_MEMBERSHIP_UPDATE_FAILED", updatedMembership.error.message);
  }

  state = await loadState(client);
  readiness = ready(state);
  if (!readiness.ready) fail("COMMERCE_WORKER_PROVISION_NOT_READY", "A provisioning után a technikai actor nem kész.", readiness);
  console.log(JSON.stringify({ ok: true, mode, organizationId, publicUserCode, actorUserId: state.actor.id, membershipId: state.membership.id, roleCode, authUserId: null, ...readiness }, null, 2));
}

main().catch((error) => fail("COMMERCE_WORKER_PROVISION_UNEXPECTED", error instanceof Error ? error.message : "Ismeretlen provisioning hiba."));
