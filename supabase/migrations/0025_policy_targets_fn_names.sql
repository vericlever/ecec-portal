-- 0025_policy_targets_fn_names.sql
--
-- Step 8. The staff record page now lists the specific policies a person still
-- has to view, so the target-policy helpers return the policy name and type as
-- well as the id and version. Both stay SECURITY DEFINER so a manager can read
-- the figures for a staff member whose targeted policies they would not see
-- directly through RLS.

drop function if exists public.visible_published_policies(uuid);
drop function if exists public.org_published_policies();

create or replace function public.visible_published_policies(p_profile uuid)
returns table (
  id uuid,
  published_version integer,
  name text,
  document_type text
)
language sql
stable
security definer
set search_path = ''
as $$
  with subj as (
    select organisation_id, job_role_id, service_id
    from public.profiles
    where profiles.id = p_profile
  )
  select p.id, p.published_version, p.name, p.document_type
  from public.policies p, subj
  where p.organisation_id = subj.organisation_id
    and public.in_org(subj.organisation_id)  -- caller must share the org
    and p.published_version is not null
    and (p.service_id is null or p.service_id = subj.service_id)
    and (
      not exists (select 1 from public.policy_audiences a where a.policy_id = p.id)
      or exists (
        select 1
        from public.policy_audiences a
        where a.policy_id = p.id
          and (a.job_role_id is null or a.job_role_id = subj.job_role_id)
          and (a.service_id is null or a.service_id = subj.service_id)
      )
    );
$$;

grant execute on function public.visible_published_policies(uuid) to authenticated;

create or replace function public.org_published_policies()
returns table (
  id uuid,
  published_version integer,
  service_id uuid,
  name text,
  document_type text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.published_version, p.service_id, p.name, p.document_type
  from public.policies p
  where p.organisation_id = public.current_org()
    and p.published_version is not null;
$$;

grant execute on function public.org_published_policies() to authenticated;
