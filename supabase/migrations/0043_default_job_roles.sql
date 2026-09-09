-- 0043_default_job_roles.sql
--
-- Zeke's feedback: Science Kinder only had the one throwaway "SK Educator"
-- isolation fixture, none of the standard roles - the job-role picker on
-- bulk upload (and everywhere else roles are chosen) looked broken for any
-- organisation that isn't RSG. Every new organisation should start with the
-- same standard set, not something an admin has to remember to create by
-- hand.
--
-- The 5 names mirror the sop_tier labels already used elsewhere
-- (src/lib/constants.ts SOP_TIER_LABELS) - the closest thing this codebase
-- already treats as "the standard roles". Seeded as placeholders (no SOPs
-- attached yet); the existing is_placeholder-sync logic already flips that to
-- false the moment a real SOP is attached, so nothing here needs to know
-- about content.

create or replace function public.seed_default_job_roles(target_org uuid)
returns void language plpgsql set search_path = '' as $$
begin
  insert into public.job_roles (organisation_id, name, is_placeholder)
  values
    (target_org, 'Educator', true),
    (target_org, 'Room Leader', true),
    (target_org, 'Educational Leader', true),
    (target_org, 'Director', true),
    (target_org, 'Finance & Admin', true)
  on conflict (organisation_id, name) do nothing;
end $$;

-- Hard-wired: fires for every organisation from now on, regardless of
-- whether it is created by a seed script, a future admin UI, or by hand in
-- the SQL editor.
create or replace function public.seed_default_job_roles_trigger()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.seed_default_job_roles(new.id);
  return new;
end $$;

create trigger organisations_seed_default_job_roles
  after insert on public.organisations
  for each row execute function public.seed_default_job_roles_trigger();

-- Backfill: every organisation that exists today gets whichever of the 5 it
-- is missing (never touches or duplicates roles it already has).
do $$
declare o uuid;
begin
  for o in select id from public.organisations loop
    perform public.seed_default_job_roles(o);
  end loop;
end $$;
