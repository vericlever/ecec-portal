-- 0053_profiles_delete_admin_only.sql
--
-- Build addendum item 1 (permanent staff delete): profiles_write (migration
-- 0044) is a single `for all` policy, so its USING clause is shared by UPDATE
-- and DELETE alike. That USING clause grants any same-service manager or
-- hr_manager-flagged account access, which is the right shape for UPDATE
-- (job role assignment, contract/payroll work) but far too wide for DELETE -
-- permanentlyDeleteStaff() is admin-only in the application, and RLS is
-- supposed to hold that line on its own, not rely on the app never calling
-- delete any other way. Splitting the policy so DELETE has its own,
-- narrower rule closes that gap without touching the update/insert shape at
-- all.

-- Postgres policies take exactly one command each (no "for insert, update"
-- combo), so the old single for-all policy becomes two with an identical
-- shape, plus the new admin-only delete policy.
drop policy if exists profiles_write on public.profiles;

create policy profiles_insert on public.profiles
for insert
with check (
  is_admin(organisation_id)
  or (can_edit_content(organisation_id) and access_tier <> 'admin')
  or (is_manager(organisation_id) and service_id = current_service() and access_tier = 'staff')
  or (can_verify(organisation_id) and service_id = current_service() and access_tier = 'staff')
);

create policy profiles_update on public.profiles
for update
using (
  is_admin(organisation_id)
  or can_edit_content(organisation_id)
  or (is_manager(organisation_id) and service_id = current_service())
  or (can_verify(organisation_id) and service_id = current_service())
)
with check (
  is_admin(organisation_id)
  or (can_edit_content(organisation_id) and access_tier <> 'admin')
  or (is_manager(organisation_id) and service_id = current_service() and access_tier = 'staff')
  or (can_verify(organisation_id) and service_id = current_service() and access_tier = 'staff')
);

create policy profiles_delete on public.profiles
for delete
using (is_admin(organisation_id));
