-- Step 24 follow-up: an explicit next review date on every SOP and policy, so a
-- bulk upload can stagger reviews across the calendar instead of every document
-- falling due on the same day. Nullable; the review-cycle maths, reminders and
-- history log are still Step 20.

alter table public.sops
  add column if not exists next_review_date date;

alter table public.policies
  add column if not exists next_review_date date;

comment on column public.sops.next_review_date is
  'When this SOP is next due for review. Set in the bulk wizard (staggered by default) or the editor. Reminders are Step 20.';
comment on column public.policies.next_review_date is
  'When this policy is next due for review. Set in the bulk wizard (staggered by default) or the editor. Reminders are Step 20.';
