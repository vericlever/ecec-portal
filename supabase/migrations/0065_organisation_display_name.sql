-- 0065_organisation_display_name.sql
--
-- Admins can now give their organisation a display name staff see
-- throughout the portal (in the nav, next to their own name). Deliberately
-- separate from organisations.name: that column is the canonical tenant
-- record and organisations_modify (migration 0002) locks writing it to a
-- platform superuser only - renaming the tenant itself is not something a
-- customer's own Admin should be able to do from inside the product. This
-- is a cosmetic label only, nullable, falling back to `name` when unset.
--
-- A plain RLS policy can't express "any org member may update this one
-- column, nothing else" - Postgres RLS is row-level, not column-level, so a
-- second permissive UPDATE policy on the table would let an Admin rewrite
-- any column, not just this one. A narrow SECURITY DEFINER function is the
-- same pattern already used for sign_own_contract and commit_bulk_sops:
-- it bypasses RLS entirely and re-verifies its own authorisation instead.

alter table public.organisations
  add column display_name text;

comment on column public.organisations.display_name is
  'Admin-editable label shown to staff throughout the portal. Falls back to name (the RLS-locked canonical tenant name) when null.';

create or replace function public.set_organisation_display_name(p_display_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public.current_org();
begin
  if not public.is_admin(v_org) then
    raise exception 'Only an admin can change the organisation display name.';
  end if;
  update public.organisations
    set display_name = nullif(trim(p_display_name), ''),
        updated_at = now()
    where id = v_org;
end;
$$;

grant execute on function public.set_organisation_display_name(text) to authenticated;
