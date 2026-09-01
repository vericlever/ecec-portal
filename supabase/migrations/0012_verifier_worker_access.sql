-- 0012_verifier_worker_access.sql
-- The HR sign-off flag (profiles.hr_verifier) is meant to work regardless of
-- access tier, but the worker-record RLS only lets managers and admins act on
-- other people's records. Give an HR verifier the same reach, scoped to their
-- own service.

create or replace function public.can_manage_worker(
  target_org uuid,
  target_service uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.covers_service(target_org, target_service)
      or (public.can_verify(target_org)
          and (target_service is null
               or target_service = public.current_service()));
$$;

grant execute on function public.can_manage_worker(uuid, uuid) to authenticated, anon;

drop policy worker_details_rw on public.worker_details;
create policy worker_details_rw on public.worker_details
  for all
  using (
    profile_id = (select auth.uid())
    or public.can_manage_worker(organisation_id, public.worker_service(profile_id))
  )
  with check (
    profile_id = (select auth.uid())
    or public.can_manage_worker(organisation_id, public.worker_service(profile_id))
  );

do $$
declare t text;
begin
  foreach t in array array['wwcc_checks', 'teacher_registrations', 'qualifications', 'training_records']
  loop
    execute format('drop policy %1$s_rw on public.%1$s', t);
    execute format($f$
      create policy %1$s_rw on public.%1$s
        for all
        using (
          profile_id = (select auth.uid())
          or public.can_manage_worker(organisation_id, public.worker_service(profile_id))
        )
        with check (
          profile_id = (select auth.uid())
          or public.can_manage_worker(organisation_id, public.worker_service(profile_id))
        )
    $f$, t);
  end loop;
end $$;
