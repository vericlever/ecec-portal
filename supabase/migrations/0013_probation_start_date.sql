-- 0013_probation_start_date.sql
-- The probationary period has its own start date, separate from the NQAITS
-- employment start date. It drives SOP sign-off deadlines (a core set due
-- immediately, more due before the 3-month review, the rest before probation
-- ends) - that deadline logic is a later step.

alter table public.worker_details add column probation_start_date date;

comment on column public.worker_details.probation_start_date is
  'When the probationary period started. Set by a leader. Drives SOP sign-off deadlines. Distinct from start_date (the NQAITS employment start).';
