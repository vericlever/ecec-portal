-- seed/0002_dev_user.sql
-- Step 4: promote Zeke's account to the RSG approved provider (admin).
--
-- FIRST, in the Supabase dashboard (Authentication -> Users):
--   1. Delete the existing passwordless "zeke@readyset.au" user if present
--      (it was created by the step 3 seed; its profile cascades away).
--   2. "Add user" -> zeke@readyset.au, set your password, Auto Confirm User = on.
--
-- THEN run this. It finds that auth user by email and gives it an approved
-- provider profile at Ready Set Go. The educator test account
-- (zekepottage@gmail.com) is created afterwards through the app's
-- "Add staff member" screen, which is the real onboarding path.

insert into public.profiles
  (id, organisation_id, site_id, full_name, email, role, start_date, is_active)
select
  u.id,
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',  -- Timboon
  'Zeke Pottage',
  'zeke@readyset.au',
  'approved_provider',
  '2026-01-01',
  true
from auth.users u
where u.email = 'zeke@readyset.au'
on conflict (id) do update set
  organisation_id = excluded.organisation_id,
  site_id         = excluded.site_id,
  full_name       = excluded.full_name,
  role            = excluded.role,
  is_active       = true;

-- Confirm: should return one row with role = approved_provider.
select p.email, p.role, o.name as organisation
from public.profiles p
join public.organisations o on o.id = p.organisation_id
where p.email = 'zeke@readyset.au';
