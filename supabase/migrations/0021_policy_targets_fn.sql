-- 0021_policy_targets_fn.sql
--
-- The staff record page and staff-stats need "which published policies is THIS
-- person expected to have viewed" - evaluated for the subject, not the viewer
-- (a manager checking a staff member cannot use policy_visible(), which keys on
-- the caller). SECURITY DEFINER so a manager can call it for their staff.

create or replace function public.visible_published_policies(p_profile uuid)
returns table (id uuid, published_version integer)
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
  select p.id, p.published_version
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

-- Batch companion for the staff list: every published policy in the caller's
-- organisation, so per-person expected counts can be worked out in one query
-- rather than one call per staff member.
create or replace function public.org_published_policies()
returns table (id uuid, published_version integer, service_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.published_version, p.service_id
  from public.policies p
  where p.organisation_id = public.current_org()
    and p.published_version is not null;
$$;

grant execute on function public.org_published_policies() to authenticated;
