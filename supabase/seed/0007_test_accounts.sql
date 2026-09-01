-- seed/0007_test_accounts.sql
-- DEV. Extra test accounts to prove sign-offs are per-user and per-job-role.
-- Run after 0005_job_roles.sql. The auth users are created separately (script
-- or dashboard); this sets up the job role and the profiles.
--
-- Accounts after this runs:
--   zeke@readyset.au        Admin,          no job role
--   zekepottage@gmail.com   Staff,          Educator      (25 SOPs), Timboon
--   test.staff@readyset.au  Staff,          Room Leader    (11 SOPs), Timboon
--   test.manager@readyset.au Manager (staff), Test - All SOPs (all),  Timboon

-- A job role that carries every SOP, so the manager test account sees the full
-- list. Marked as a placeholder-style test role.
insert into public.job_roles (organisation_id, name, is_placeholder) values
  ('a0000000-0000-4000-8000-000000000001', 'Test - All SOPs', true)
on conflict (organisation_id, name) do nothing;

delete from public.job_role_sops
where organisation_id = 'a0000000-0000-4000-8000-000000000001'
  and job_role_id = (
    select id from public.job_roles
    where organisation_id = 'a0000000-0000-4000-8000-000000000001'
      and name = 'Test - All SOPs');

insert into public.job_role_sops (organisation_id, job_role_id, sop_id)
select s.organisation_id, jr.id, s.id
from public.sops s
cross join lateral (
  select id from public.job_roles
  where organisation_id = s.organisation_id and name = 'Test - All SOPs'
) jr
where s.organisation_id = 'a0000000-0000-4000-8000-000000000001';

insert into public.profiles
  (id, organisation_id, service_id, job_role_id, full_name, email, access_tier, is_active)
select u.id,
       'a0000000-0000-4000-8000-000000000001',
       'b0000000-0000-4000-8000-000000000001',
       (select id from public.job_roles
        where organisation_id = 'a0000000-0000-4000-8000-000000000001' and name = 'Room Leader'),
       'Test Staff (Room Leader)', 'test.staff@readyset.au', 'staff', true
from auth.users u where u.email = 'test.staff@readyset.au'
on conflict (id) do update set
  organisation_id = excluded.organisation_id,
  service_id      = excluded.service_id,
  job_role_id     = excluded.job_role_id,
  full_name       = excluded.full_name,
  access_tier     = excluded.access_tier;

insert into public.profiles
  (id, organisation_id, service_id, job_role_id, full_name, email, access_tier, is_active)
select u.id,
       'a0000000-0000-4000-8000-000000000001',
       'b0000000-0000-4000-8000-000000000001',
       (select id from public.job_roles
        where organisation_id = 'a0000000-0000-4000-8000-000000000001' and name = 'Test - All SOPs'),
       'Test Manager (staff)', 'test.manager@readyset.au', 'manager_staff', true
from auth.users u where u.email = 'test.manager@readyset.au'
on conflict (id) do update set
  organisation_id = excluded.organisation_id,
  service_id      = excluded.service_id,
  job_role_id     = excluded.job_role_id,
  full_name       = excluded.full_name,
  access_tier     = excluded.access_tier;

select p.email, p.access_tier, jr.name as job_role,
       (select count(*) from public.job_role_sops x where x.job_role_id = p.job_role_id) as suite_size
from public.profiles p
left join public.job_roles jr on jr.id = p.job_role_id
where p.email like '%readyset.au' or p.email like '%gmail.com'
order by p.email;
