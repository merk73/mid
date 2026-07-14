import fs from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const dataFiles = [
  "web/data.js",
  "web/featured-data.js",
  "web/client-updates.js",
  "web/incident-updates.js",
  "web/site-completion.js",
  "web/krovolunanie-research.js",
  "web/relations-data.js",
];

const context = { console };
context.window = context;
vm.createContext(context);

for (const relativePath of dataFiles) {
  const source = fs.readFileSync(new URL(relativePath, root), "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

const records = context.MIDGAS_RECORDS;
const relationPairs = context.MIDGAS_RELATIONS?.pairs || [];
const typeOrder = ["client", "anomaly", "incident"];
const expectedCounts = { client: 26, anomaly: 1, incident: 2 };

for (const type of typeOrder) {
  const actual = Object.keys(records[type] || {}).length;
  if (actual !== expectedCounts[type]) {
    throw new Error(`Unexpected ${type} count: ${actual}; expected ${expectedCounts[type]}`);
  }
}

// Store the initial graph in each publication snapshot as well as in the
// relationship table. This lets "restore original" return both text and links
// to exactly the state in which the existing registry was first published.
for (const type of typeOrder) {
  for (const [code, record] of Object.entries(records[type])) {
    const relations = context.MIDGAS_RELATIONS?.forRecord?.(type, code) || [];
    record.editorRelations = relations;
    record.editorRelationsVersion = 1;
  }
}

const quoteJson = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const sql = [];

sql.push(`-- Generated from the public MIDGAS registry by tools/generate-supabase-seed.mjs.
-- Run once, after 20260714000100_midgas_editor.sql and before publishing new records.
-- The guard deliberately refuses to run against a non-empty registry so permanent
-- record numbers can never be shifted or reused.

do $midgas_seed$
declare
  seeded_records integer;
  seeded_relations integer;
begin
  if exists (select 1 from public.records) then
    raise exception 'MIDGAS seed requires an empty public.records table';
  end if;
`);

for (const type of typeOrder) {
  const entries = Object.entries(records[type]).sort(([a], [b]) => a.localeCompare(b));
  for (const [expectedCode, record] of entries) {
    sql.push(`  insert into public.records (record_type, content, cover_path)
  values ('${type}', ${quoteJson(record)}, null);

  if not exists (
    select 1 from public.records where record_code = '${expectedCode}' and record_type = '${type}'
  ) then
    raise exception 'Unexpected permanent code while seeding ${expectedCode}';
  end if;

`);
  }
}

for (const [sourceCode, targetCode] of relationPairs) {
  sql.push(`  insert into public.relationships (source_id, target_id)
  select source_record.id, target_record.id
  from public.records source_record
  cross join public.records target_record
  where source_record.record_code = '${sourceCode}'
    and target_record.record_code = '${targetCode}';

`);
}

const totalRecords = Object.values(expectedCounts).reduce((sum, value) => sum + value, 0);
sql.push(`  select count(*) into seeded_records from public.records;
  if seeded_records <> ${totalRecords} then
    raise exception 'MIDGAS record seed count mismatch: %', seeded_records;
  end if;

  select count(*) into seeded_relations from public.relationships;
  if seeded_relations <> ${relationPairs.length} then
    raise exception 'MIDGAS relationship seed count mismatch: %', seeded_relations;
  end if;
end
$midgas_seed$;

-- Defensive synchronization: these values are the last permanently assigned numbers.
select setval('public.client_record_no_seq', 26, true);
select setval('public.anomaly_record_no_seq', 1, true);
select setval('public.incident_record_no_seq', 2, true);
`);

const output = new URL("supabase/migrations/20260714000200_seed_existing_registry.sql", root);
fs.writeFileSync(output, sql.join(""), "utf8");
console.log(`Generated ${output.pathname}: ${totalRecords} records, ${relationPairs.length} relationships`);
