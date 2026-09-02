-- 0024_sop_authoring.sql
--
-- Step 7. SOPs get the same publish and versioning as policies (0019): a
-- working copy that an editor changes freely, then a published snapshot that
-- staff read and sign. Re-publishing bumps the version, which makes every
-- prior sign-off stale so staff must re-sign.

-- 1. Publish + versioning columns.
alter table public.sops
  add column published_version integer,
  add column published_at timestamptz,
  add column published_body text,
  add column published_by uuid references public.profiles(id) on delete set null,
  add column source_document_id uuid references public.documents(id) on delete set null,
  add column updated_by uuid references public.profiles(id) on delete set null;

comment on column public.sops.published_version is
  'Null until first published. Bumped on each publish; a new value makes every prior sign_off stale so staff must re-sign.';

-- 2. A SOP belongs to whichever job roles need it (job_role_sops), not to one
--    fixed tier. target_tier stays as an optional category only.
alter table public.sops alter column target_tier drop not null;

-- 3. Two SOPs were imported once per tier. Neither has a body or a sign-off;
--    keep one, point it at both roles and any policy links, drop the other.
do $$
declare
  org uuid := 'a0000000-0000-4000-8000-000000000001';
  pairs uuid[][] := array[
    array['87fd798d-b61f-47ef-875c-25e5c624826e', '6880de2c-c8fb-466f-b2cb-6857b1d4a55c'], -- Cultural Partnerships: keep educator, drop director
    array['92f876c9-ba48-4e97-834b-5071c3a43600', '6d665d68-c0a0-44cd-bdbe-3b01e99d0598']  -- Using NQAITS: keep director, drop finance_admin
  ];
  pair uuid[];
  keep uuid;
  drp uuid;
  r record;
begin
  foreach pair slice 1 in array pairs loop
    keep := pair[1];
    drp := pair[2];
    for r in select job_role_id from public.job_role_sops where sop_id = drp loop
      insert into public.job_role_sops (organisation_id, job_role_id, sop_id)
      values (org, r.job_role_id, keep)
      on conflict do nothing;
    end loop;
    for r in select policy_id from public.policy_sop_links where sop_id = drp loop
      insert into public.policy_sop_links (organisation_id, policy_id, sop_id)
      values (org, r.policy_id, keep)
      on conflict do nothing;
    end loop;
    delete from public.sops where id = drp;
  end loop;
end $$;

-- 4. SOP name unique per organisation, not per (tier, name).
alter table public.sops drop constraint sops_organisation_id_target_tier_name_key;
alter table public.sops add constraint sops_organisation_id_name_key unique (organisation_id, name);

-- 5. Countersignature timestamp for self_and_manager SOPs. verified_by already
--    exists; this records when.
alter table public.sign_offs add column verified_at timestamptz;

-- 6. SOPs that already have text are published at their current version, so the
--    existing sign-offs stay valid and staff keep seeing them.
update public.sops
  set published_version = current_version,
      published_body = body,
      published_at = now()
where body is not null and btrim(body) <> '';
