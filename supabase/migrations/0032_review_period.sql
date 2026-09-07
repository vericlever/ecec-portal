-- Step 24 (and groundwork for Step 20): a review period on every SOP and policy.
-- How often the document is due to be looked at again, in months. Fixed options
-- 3, 6 or 12, default 6. The computed review-due date, the overdue flag, the
-- history log and the reminders are Step 20 - this migration only adds the field
-- so the bulk upload wizard can set it on page two.

alter table public.sops
  add column if not exists review_period_months smallint not null default 6;

alter table public.policies
  add column if not exists review_period_months smallint not null default 6;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sops_review_period_months_check'
  ) then
    alter table public.sops
      add constraint sops_review_period_months_check
      check (review_period_months in (3, 6, 12));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'policies_review_period_months_check'
  ) then
    alter table public.policies
      add constraint policies_review_period_months_check
      check (review_period_months in (3, 6, 12));
  end if;
end $$;

comment on column public.sops.review_period_months is
  'How often this SOP is due for review, in months (3, 6 or 12). Default 6. Review due date and reminders are Step 20.';
comment on column public.policies.review_period_months is
  'How often this policy is due for review, in months (3, 6 or 12). Default 6. Review due date and reminders are Step 20.';
