import process from "node:process";

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!baseUrl || !serviceKey) {
  console.error("DROP database readiness: FAIL – Supabase server environment is not configured.");
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  accept: "application/json",
};

const tableChecks = [
  { table: "drop_packages", select: "id" },
  { table: "drop_recipients", select: "id" },
  { table: "drop_groups", select: "id" },
  { table: "drop_access_tokens", select: "id" },
  { table: "drop_access_attempts", select: "id" },
  { table: "drop_events", select: "id" },
  { table: "drop_schema_meta", select: "component" },
];

const results = [];
for (const { table, select } of tableChecks) {
  const response = await fetch(
    `${baseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`,
    { headers },
  );

  let error = null;
  if (!response.ok) {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body);
      error = {
        code: parsed?.code || null,
        message: parsed?.message || body || null,
      };
    } catch {
      error = { code: null, message: body || null };
    }
  }

  results.push({
    table,
    status: response.status,
    ready: response.ok,
    ...(error ? { error } : {}),
  });
}

let version = {
  expected: "DROP 0.2.0",
  actual: null,
  migrationCount: null,
  bootstrapId: null,
  ready: false,
};

if (results.find((item) => item.table === "drop_schema_meta")?.ready) {
  const response = await fetch(
    `${baseUrl}/rest/v1/drop_schema_meta?component=eq.drop-core&select=schema_version,migration_count,bootstrap_id&limit=1`,
    { headers },
  );

  if (response.ok) {
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    version = {
      expected: "DROP 0.2.0",
      actual: row?.schema_version || null,
      migrationCount: row?.migration_count ?? null,
      bootstrapId: row?.bootstrap_id || null,
      ready:
        row?.schema_version === "DROP 0.2.0" &&
        row?.migration_count === 6 &&
        row?.bootstrap_id === "drop-020-atomic-package-engine-20260801",
    };
  }
}

const ready = results.every((item) => item.ready) && version.ready;
console.log(
  JSON.stringify(
    {
      ok: ready,
      provider: "supabase-postgresql",
      tables: results,
      version,
    },
    null,
    2,
  ),
);
process.exit(ready ? 0 : 2);
