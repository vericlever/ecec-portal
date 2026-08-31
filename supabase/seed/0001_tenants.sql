-- seed/0001_tenants.sql
-- The only hard-coded seed: the two tenants and RSG's two sites. Everything else
-- (policies, SOPs, staff) comes through an importer or the app.
--
-- Fixed UUIDs so this is idempotent and so the import scripts can reference the
-- RSG organisation directly. Safe to re-run.

-- Ready Set Go: the real first customer.
insert into public.organisations (id, name, is_test_tenant) values
  ('a0000000-0000-4000-8000-000000000001', 'Ready Set Go', false)
on conflict (id) do update set
  name = excluded.name,
  is_test_tenant = excluded.is_test_tenant;

-- Science Kinder: dummy tenant, exists only to prove organisation-level RLS
-- isolation holds. No real staff, no real content.
insert into public.organisations (id, name, is_test_tenant) values
  ('a0000000-0000-4000-8000-000000000002', 'Science Kinder', true)
on conflict (id) do update set
  name = excluded.name,
  is_test_tenant = excluded.is_test_tenant;

-- RSG sites.
insert into public.sites (id, organisation_id, name) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Timboon'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Mortlake')
on conflict (id) do update set
  organisation_id = excluded.organisation_id,
  name = excluded.name;
