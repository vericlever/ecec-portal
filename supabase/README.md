# Database

Multi-tenant schema for The Portal. Steps 1 and 2 of the build sequence.

## Migrations

Applied in order:

| File | Contents |
|---|---|
| `migrations/0001_init_schema.sql` | Tables, enums, `set_updated_at` trigger, and the `credential_types` / `external_providers` lookup seeds (WWCC and Gecko Training as placeholder rows) |
| `migrations/0002_rls_policies.sql` | RLS helper functions and a policy on every tenant table |
| `migrations/0003_indexes.sql` | Indexes supporting RLS organisation filtering and common lookups |
| `migrations/0004_document_import_schema.sql` | SOP role tier, per-site scoping (`site_id` null = multicampus), nullable sign-off/status, policy `document_type` and `program`, `metadata` columns, link provenance |
| `migrations/0005_import_documents_fn.sql` | `import_documents(org, jsonb)` - the generic policy/SOP/link importer every provider uses |
| `migrations/0006_policy_views.sql` | `policy_views` - a lightweight "staff viewed this policy version" record, weaker than SOP sign-off |

Then the seed and the RSG bootstrap:

| File | Contents |
|---|---|
| `seed/0001_tenants.sql` | The only hard-coded seed: Ready Set Go, Science Kinder, and RSG's Timboon and Mortlake sites |
| `import/rsg/rsg_import.sql` | Calls `import_documents()` with RSG's reviewed library (70 policies, 129 SOPs, 56 links). See `import/rsg/README.md` |

## Applying

### Supabase CLI (preferred once installed)

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Then run `seed/0001_tenants.sql` and `import/rsg/rsg_import.sql`.

### Supabase dashboard

Paste each migration (`0001`-`0006`), in order, into the SQL Editor and run it.
Then `seed/0001_tenants.sql`, then `import/rsg/rsg_import.sql`.

### Direct connection

Run the files in order against the connection string from
Project Settings and Database. Do not commit that string.

## Tenant model

- `organisations` is the tenant boundary. Every organisation-scoped table carries
  `organisation_id` and is filtered by RLS.
- `sites` are physical centres within an organisation. Site-scoped tables
  (`profiles.site_id`, `sign_offs.site_id`) carry `site_id` as well. Site and
  organisation are separate boundaries.
- A `platform_superuser` bypasses organisation scoping. Everyone else is scoped
  to the `organisation_id` on their `profiles` row.
- Composite foreign keys (for example `sign_offs (sop_id, organisation_id)` into
  `sops (id, organisation_id)`) stop a row referencing a parent in a different
  organisation.

## Verifying isolation

The step 1 acceptance test is that a query scoped to one organisation cannot
return another organisation's rows. It needs the step 2 seed data (Ready Set Go
plus the empty Science Kinder tenant). Once that is loaded, run as an
authenticated non-superuser:

```sql
-- Impersonate a Ready Set Go educator.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<rsg-educator-auth-uid>', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- Expect only Ready Set Go rows, never Science Kinder.
select distinct organisation_id from public.sops;
select distinct organisation_id from public.credentials;
select distinct organisation_id from public.profiles;
```

Repeat impersonating a Science Kinder user and confirm no Ready Set Go rows are
visible. The `postgres` and `service_role` roles bypass RLS by design, so this
check must run as `authenticated`.
