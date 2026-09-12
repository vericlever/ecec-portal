-- 0049_review_status_decision.sql
--
-- Review cycle v2, section 3 (review event): the doc asks that a
-- needs_revision decision "surface the procedure in the content editor's
-- queue" - not as a stored boolean (that was deletion 3's whole complaint:
-- "a bare boolean cannot carry which stage failed, who owns the fix, or when
-- it is due"), but derived from the latest review, same as next_review_date
-- already is. Folding it into sop_review_status keeps one view as the single
-- source of a SOP's current review state rather than adding a second query
-- shape next to it.

create or replace view public.sop_review_status
with (security_invoker = true)
as
select
  s.id as sop_id,
  s.organisation_id,
  s.last_reviewed_at,
  (coalesce(s.last_reviewed_at, s.published_at) + make_interval(months => s.review_period_months))::date
    as next_review_date,
  latest.decision as latest_decision
from public.sops s
left join lateral (
  select r.decision
  from public.sop_reviews r
  where r.sop_id = s.id
  order by r.reviewed_at desc
  limit 1
) latest on true;
