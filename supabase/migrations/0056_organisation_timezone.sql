-- 0056_organisation_timezone.sql
--
-- Trial readiness revision, Step 43. The display layer has been rendering
-- every timestamp in server time (Vercel runs UTC), which reads as the wrong
-- clock time to anyone in Australia and is a blocker for the signing clock
-- (Step 44). Storage is unaffected - everything stays UTC in Postgres, as
-- it must - this column only tells the app which timezone to render into.
--
-- IANA identifier, not a fixed UTC offset, so daylight saving is handled
-- correctly without a second column or a lookup table. Restricted to the
-- eight real Australian zones rather than left as a free string: this
-- product targets Australian services only, and a garbage value here would
-- silently corrupt every date shown to every user of that organisation.

alter table public.organisations
  add column timezone text not null default 'Australia/Melbourne';

alter table public.organisations
  add constraint organisations_timezone_check
  check (timezone in (
    'Australia/Sydney',
    'Australia/Melbourne',
    'Australia/Brisbane',
    'Australia/Adelaide',
    'Australia/Perth',
    'Australia/Darwin',
    'Australia/Hobart',
    'Australia/Lord_Howe'
  ));
