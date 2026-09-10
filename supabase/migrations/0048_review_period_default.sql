-- 0048_review_period_default.sql
--
-- Review cycle v2, section 2 (continued): 6-month default review cadence,
-- RSG's default across roughly 120 procedures (two to three reviews a week).
-- Applies to both sops and policies, per the doc - policies keep their
-- existing manual review field and button (confirmed with Zeke, not part of
-- this revision), but the cadence default itself is explicitly named for
-- both tables.

alter table public.sops alter column review_period_months set default 6;
alter table public.policies alter column review_period_months set default 6;

update public.sops set review_period_months = 6;
update public.policies set review_period_months = 6;
