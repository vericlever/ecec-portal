-- 0008_science_kinder.sql
--
-- Fills the dummy Science Kinder tenant with a small, deliberately distinctive
-- data set so cross-organisation isolation can be checked by hand: log in to
-- Science Kinder and confirm none of Ready Set Go's staff, SOPs or policies are
-- visible, and vice versa.
--
-- The two auth accounts must exist first (created via the Admin API):
--   admin@sciencekinder.test      -> Science Kinder admin
--   educator@sciencekinder.test   -> Science Kinder staff

do $$
declare
  sk_org uuid := 'a0000000-0000-4000-8000-000000000002';
  sk_service uuid;
  sk_role uuid;
  sop_a uuid;
  sop_b uuid;
  pol_pub uuid;
  admin_id uuid := (select id from auth.users where email = 'admin@sciencekinder.test');
  educ_id uuid := (select id from auth.users where email = 'educator@sciencekinder.test');
begin
  -- Service
  insert into public.services (organisation_id, name, service_type)
  values (sk_org, 'Science Kinder - Hawthorn', 'CBC')
  on conflict (organisation_id, name) do nothing;
  select id into sk_service from public.services
  where organisation_id = sk_org and name = 'Science Kinder - Hawthorn';

  -- Job role with a small SOP suite
  insert into public.job_roles (organisation_id, name, is_placeholder)
  values (sk_org, 'SK Educator', false)
  on conflict (organisation_id, name) do nothing;
  select id into sk_role from public.job_roles
  where organisation_id = sk_org and name = 'SK Educator';

  -- SOPs (names nothing like RSG's)
  insert into public.sops (organisation_id, name, target_tier, signoff_type, body, status)
  values
    (sk_org, 'SK Welcome and Sign-In', 'educator', 'self',
     'Science Kinder sample SOP A. Greet each family, confirm the sign-in sheet, note any messages for the day.', 'existing'),
    (sk_org, 'SK End of Day Handover', 'educator', 'self',
     'Science Kinder sample SOP B. Confirm every child is signed out, tidy the room, pass on notes to the closing educator.', 'existing')
  on conflict (organisation_id, target_tier, name) do nothing;

  select id into sop_a from public.sops where organisation_id = sk_org and name = 'SK Welcome and Sign-In';
  select id into sop_b from public.sops where organisation_id = sk_org and name = 'SK End of Day Handover';

  insert into public.job_role_sops (organisation_id, job_role_id, sop_id)
  values (sk_org, sk_role, sop_a), (sk_org, sk_role, sop_b)
  on conflict do nothing;

  -- Policies: one published (so the staff account sees it), one draft
  insert into public.policies (organisation_id, name, status, document_type, is_parent_facing, body)
  values
    (sk_org, 'SK Arrival and Collection', 'in_library', 'policy', true,
     'Science Kinder sample policy. Children are released only to authorised adults listed on the enrolment form.'),
    (sk_org, 'SK Sun Safety (draft)', 'in_library', 'policy', false,
     'Science Kinder draft policy, not yet published.')
  on conflict (organisation_id, name) do nothing;

  select id into pol_pub from public.policies where organisation_id = sk_org and name = 'SK Arrival and Collection';
  update public.policies
    set published_version = 1, current_version = 1,
        published_body = body, published_at = now()
  where id = pol_pub and published_version is null;

  -- Profiles for the two accounts
  insert into public.profiles
    (id, organisation_id, service_id, job_role_id, full_name, email, access_tier, is_active)
  values
    (admin_id, sk_org, null, null, 'SK Admin', 'admin@sciencekinder.test', 'admin', true),
    (educ_id, sk_org, sk_service, sk_role, 'SK Educator', 'educator@sciencekinder.test', 'staff', true)
  on conflict (id) do update
    set organisation_id = excluded.organisation_id,
        service_id = excluded.service_id,
        job_role_id = excluded.job_role_id,
        access_tier = excluded.access_tier;
end $$;

select 'Science Kinder seeded' as done,
  (select count(*) from public.services where organisation_id = 'a0000000-0000-4000-8000-000000000002') as services,
  (select count(*) from public.sops where organisation_id = 'a0000000-0000-4000-8000-000000000002') as sops,
  (select count(*) from public.policies where organisation_id = 'a0000000-0000-4000-8000-000000000002') as policies,
  (select count(*) from public.profiles where organisation_id = 'a0000000-0000-4000-8000-000000000002') as profiles;
