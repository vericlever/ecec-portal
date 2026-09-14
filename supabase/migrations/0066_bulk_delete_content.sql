-- 0066_bulk_delete_content.sql
--
-- Admin portal management page: bulk-delete every procedure, or every
-- policy, in one action - for when a library is being fully replaced
-- rather than edited piece by piece. sops_write and policies_write
-- (migration 0007) are single `for all` policies shared by insert, update
-- and delete alike, open to manager_policy as well as admin. That is the
-- right shape for ordinary authoring, but a whole-library wipe needs a
-- narrower rule the same way permanent staff delete did (migration 0053):
-- split into insert/update (still can_edit_content - manager_policy or
-- admin) plus a new admin-only delete policy.
--
-- Every child row cascades on delete already (job_role_sops, sign_offs,
-- sop_history, sop_reviews, sop_review_actions, sop_outcome_flags,
-- comprehension_questions/attempts off sops; policy_sop_links,
-- policy_category_links, policy_views, policy_approvals off policies) -
-- confirmed directly against the migrations that created those foreign
-- keys, all `on delete cascade`. hr_agreements.linked_policy_id is the one
-- exception, `on delete set null`, which is correct: deleting a policy
-- should unlink an agreement, not delete the agreement itself.

drop policy sops_write on public.sops;
create policy sops_insert on public.sops
  for insert with check (public.can_edit_content(organisation_id));
create policy sops_update on public.sops
  for update
  using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));
create policy sops_delete on public.sops
  for delete using (public.is_admin(organisation_id));

drop policy policies_write on public.policies;
create policy policies_insert on public.policies
  for insert with check (public.can_edit_content(organisation_id));
create policy policies_update on public.policies
  for update
  using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));
create policy policies_delete on public.policies
  for delete using (public.is_admin(organisation_id));
