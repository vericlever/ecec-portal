-- 0010_sync_name_definer.sql
-- The worker_details -> profiles.full_name sync trigger runs as the staff
-- member (they are editing their own worker_details), but profiles RLS does not
-- let a staff member update their own profile row, so the sync silently did
-- nothing. Make it security definer.

create or replace function public.sync_profile_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.first_name, '') <> '' or coalesce(new.last_name, '') <> '' then
    update public.profiles
    set full_name = trim(both ' ' from
          coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''))
    where id = new.profile_id;
  end if;
  return new;
end $$;
