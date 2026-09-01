-- 0017_lock_sighted_checks.sql
-- Step 10 (staff self-service) groundwork.
--
-- WWCC and teacher registration are standalone checks: a police check and a
-- check held by a teacher registration body. They are not tied to an RTO and
-- their details are not corrected in place. Once a leader has physically
-- sighted one, that sighting is a permanent historical record. A renewal or a
-- re-issued check is a NEW check, entered as a new row, which enters the
-- verification queue unsighted for a leader to sight.
--
-- Before this migration protect_sighted_fields() only stopped a non-verifier
-- from writing sighted_at / sighted_by. A staff member editing their own record
-- (via /onboarding, now available after onboarding is complete) could still
-- change the check number or expiry on a row a leader had already sighted,
-- leaving the row reading as "sighted" against details the leader never saw.
-- Now that edit is blocked at the database, and the app records the change as a
-- new check instead.
--
-- qualifications and training_records keep the existing behaviour for now (a
-- non-verifier edit silently leaves the sighting fields untouched); revisiting
-- those is the rest of Step 10.

create or replace function public.protect_sighted_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Trusted server-side callers (no auth context) are not restricted.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- A verifier (admin, or anyone with the HR sign-off flag) may set and change
  -- the sighting fields.
  if public.can_verify(new.organisation_id) then
    return new;
  end if;

  -- Everyone else, typically the staff member editing their own record.
  if tg_op = 'INSERT' then
    new.sighted_at := null;
    new.sighted_by := null;
    return new;
  end if;

  -- tg_op = 'UPDATE'.
  -- A sighted WWCC or teacher registration is immutable to a non-verifier. The
  -- app enters a renewal or a correction as a new row instead, so the original
  -- sighting stays intact as history and the new check enters the queue.
  if tg_table_name in ('wwcc_checks', 'teacher_registrations')
     and old.sighted_at is not null then
    raise exception
      'A sighted % cannot be changed. Record the new check as a separate entry.',
      replace(tg_table_name, '_', ' ')
      using errcode = 'check_violation';
  end if;

  -- Any other table, or a check that has not been sighted yet: keep the
  -- sighting fields as they were, but let the rest of the row change.
  new.sighted_at := old.sighted_at;
  new.sighted_by := old.sighted_by;
  return new;
end $$;

-- The four before-insert-or-update triggers already point at this function
-- (migration 0008), so replacing the function is enough.
