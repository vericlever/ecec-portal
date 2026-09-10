-- 0052_permanent_delete_fk_fixes.sql
--
-- Build addendum item 1: permanent delete must succeed "regardless of linked
-- history" - sign-off, credential and contract records are meant to go with
-- the account, no undo. Auditing every FK referencing profiles(id) found
-- this already holds almost everywhere (contracts, credentials,
-- identity_documents, sign_offs, worker_* tables etc. already cascade), with
-- three exceptions: sop_reviews.reviewed_by and sop_review_actions.owner_id /
-- completed_by are NO ACTION, which would block a delete outright rather than
-- cascade or clear. Those three columns belong to the still-unmerged Review
-- cycle v2 branch's schema (already live in this shared database), not this
-- one, but a delete-blocking FK is a correctness problem regardless of which
-- branch's code eventually reads the table, so it is fixed here rather than
-- left for whoever merges that branch to discover the hard way.
--
-- SET NULL, not CASCADE: a review's reflections are an organisational
-- compliance record, not personal data belonging to the reviewer - the same
-- reasoning already applied to sops.updated_by / policies.published_by
-- elsewhere. Deleting the reviewer's account should not delete the review
-- itself. An action assigned to a deleted owner keeps its own history too;
-- it just loses its owner and needs reassigning, the same way it would if
-- the owner left and their profile were merely deactivated.

alter table public.sop_reviews alter column reviewed_by drop not null;
alter table public.sop_reviews drop constraint sop_reviews_reviewed_by_fkey;
alter table public.sop_reviews add constraint sop_reviews_reviewed_by_fkey
  foreign key (reviewed_by) references public.profiles(id) on delete set null;

alter table public.sop_review_actions alter column owner_id drop not null;
alter table public.sop_review_actions drop constraint sop_review_actions_owner_id_fkey;
alter table public.sop_review_actions add constraint sop_review_actions_owner_id_fkey
  foreign key (owner_id) references public.profiles(id) on delete set null;

alter table public.sop_review_actions drop constraint sop_review_actions_completed_by_fkey;
alter table public.sop_review_actions add constraint sop_review_actions_completed_by_fkey
  foreign key (completed_by) references public.profiles(id) on delete set null;
