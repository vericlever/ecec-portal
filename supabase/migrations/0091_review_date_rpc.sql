-- Step 59, B2: "anyone who can complete a review can change the [review]
-- date" - that's is_manager() (manager_staff, manager_policy or admin, per
-- sop_reviews_insert in 0046). But sops_write/policies_write (0007) gate all
-- other writes to those tables at can_edit_content() (manager_policy/admin
-- only), which would wrongly block a manager_staff from moving a review
-- date. Same shape as 0044's contract self-sign and SOP-observation flag: a
-- narrow, single-purpose SECURITY DEFINER function for one column, rather
-- than widening sops_write/policies_write for everything else on those
-- tables.
--
-- Also gives policies an "effective next review date" read the same way
-- sop_review_status already does for procedures - policies have no
-- last_reviewed_at/review-event to derive from, so their "calculated" date
-- is simply whatever policies.next_review_date already holds (set today via
-- the policy editor or bulk import); review_date_override takes priority
-- over it exactly as it does for procedures.

create or replace view public.policy_review_status
with (security_invoker = true)
as
select
  p.id as policy_id,
  p.organisation_id,
  coalesce(p.review_date_override, p.next_review_date) as next_review_date
from public.policies p;

create or replace function public.set_review_date_override(
  p_item_type public.review_date_item_type,
  p_item_id uuid,
  p_new_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_old_effective_date date;
begin
  if p_item_type = 'sop' then
    select organisation_id, next_review_date into v_org, v_old_effective_date
    from public.sop_review_status where sop_id = p_item_id;
  else
    select organisation_id, next_review_date into v_org, v_old_effective_date
    from public.policy_review_status where policy_id = p_item_id;
  end if;

  if v_org is null then
    raise exception 'Item not found';
  end if;

  if not public.is_manager(v_org) then
    raise exception 'Only a manager can change a review date.';
  end if;

  if p_item_type = 'sop' then
    update public.sops set review_date_override = p_new_date where id = p_item_id;
  else
    update public.policies set review_date_override = p_new_date where id = p_item_id;
  end if;

  insert into public.review_date_changes (organisation_id, item_type, item_id, old_date, new_date, changed_by)
  values (v_org, p_item_type, p_item_id, v_old_effective_date, p_new_date, (select auth.uid()));
end;
$$;

grant execute on function public.set_review_date_override(public.review_date_item_type, uuid, date) to authenticated;
