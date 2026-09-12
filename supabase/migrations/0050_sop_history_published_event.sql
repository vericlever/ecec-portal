-- 0050_sop_history_published_event.sql
--
-- Found during the final regression pass on Review cycle v2:
-- sop_history_event_type_check only allowed ('edit', 'period_change',
-- 'review'), but publishSop (migration 0046 section) started writing a
-- 'published' event so the consolidated procedure page's History timeline
-- could show "Republished". Every publish was silently failing to log that
-- event - logSopEvent doesn't check or surface its own insert error, so
-- publishing itself kept working, but the constraint quietly ate every
-- "Republished" row, forever. Caught only because the constraint list is
-- not visible from application code, which is exactly why this pass checked
-- it directly against the database rather than trusting the app layer.

alter table public.sop_history drop constraint sop_history_event_type_check;
alter table public.sop_history add constraint sop_history_event_type_check
  check (event_type = any (array['edit', 'period_change', 'review', 'published']));
