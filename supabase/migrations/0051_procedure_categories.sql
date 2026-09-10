-- 0051_procedure_categories.sql
--
-- Build addendum, item 4: the SOP editor's "Category" dropdown (None,
-- Educator, Room Leader, Educational Leader, Director, Finance & Admin)
-- duplicates the job-role list on the next screen and drives nothing - no
-- filter, list view or report reads it. Repurposed to share the same
-- taxonomy as policy_categories (migration 0031) rather than removed, so OHS
-- means the same thing on both tiers and any report spanning both reads one
-- consistent value.
--
-- policy_categories stays the one table (not a second one for procedures).
-- applies_to_procedures marks which rows a procedure may pick - Parent
-- policies and Other stay policy-only (Parent carries real Reg 172 meaning
-- procedures don't have; Other has no procedure equivalent per the doc's
-- exact list). General/HR/OHS are relabelled to drop the "policies" suffix
-- now that they are shared, and Leadership is new. sops.category_id is a
-- single FK (not a multi-select junction like policies) because the
-- original Category field it repurposes was a single dropdown - "repurposed
-- rather than removed" keeps that shape, just points it at the shared list
-- instead of a hardcoded TS array. target_tier itself is left in place,
-- unused going forward - nothing reads it once the app stops writing it, and
-- dropping it is a separate, later cleanup, not bundled into this migration.

alter table public.policy_categories
  add column if not exists applies_to_procedures boolean not null default false;

update public.policy_categories set name = 'General', applies_to_procedures = true where slug = 'general';
update public.policy_categories set name = 'HR', applies_to_procedures = true where slug = 'hr';
update public.policy_categories set name = 'OHS', applies_to_procedures = true where slug = 'ohs';

create or replace function public.seed_leadership_category(target_org uuid)
returns void language plpgsql set search_path = '' as $$
begin
  insert into public.policy_categories (organisation_id, slug, name, is_parent_facing, applies_to_procedures, sort_order)
  values (target_org, 'leadership', 'Leadership', false, true, 6)
  on conflict (organisation_id, slug) do update set applies_to_procedures = true;
end $$;

do $$
declare o uuid;
begin
  for o in select id from public.organisations loop
    perform public.seed_leadership_category(o);
  end loop;
end $$;

alter table public.sops
  add column if not exists category_id uuid null references public.policy_categories(id);

-- RLS: same shape as sops_write / sops_select, since this is just a column
-- on sops, not a new table with its own policy needs.
