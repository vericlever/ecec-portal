-- 0039_review_event.sql
--
-- Review cycle v2 (REVISION_REVIEW_CYCLE_V2.md), section 2: the review event.
-- Creates sop_reviews and drops the three things it replaces - sops.needs_review,
-- sops.next_review_date, and sop_observations - in the same migration rather than
-- leaving a window where the app has stopped using them but they still exist.
-- All new write paths use RLS, per the prerequisite in that document and the
-- rule in CLAUDE.md - no service-role client on any of this.
--
-- Data continuity: next_review_date is not simply reset to null for every
-- SOP. sops.last_reviewed_at is backfilled from the most recent 'review'-type
-- sop_history event per SOP (the old manual "mark as reviewed" / observation
-- flow), so a procedure that was genuinely reviewed under the old model does
-- not suddenly read as "never reviewed" today. A SOP with no such event takes
-- its published date as the clock start, per the doc.

create type public.sop_review_decision as enum ('stands', 'needs_revision');

create table public.sop_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  sop_id uuid not null references public.sops(id) on delete cascade,
  reviewed_by uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now(),
  practice_reflection text not null,
  outcome_reflection text not null,
  decision public.sop_review_decision not null,
  evidence_path text null,
  previous_review_id uuid null references public.sop_reviews(id)
);

create index sop_reviews_sop_id_idx on public.sop_reviews (sop_id, reviewed_at desc);
create index sop_reviews_organisation_id_idx on public.sop_reviews (organisation_id);

alter table public.sops add column last_reviewed_at timestamptz null;

-- Backfill from the old model's history before it's filtered out of view -
-- the events themselves stay in sop_history either way.
update public.sops s
set last_reviewed_at = h.last_review_at
from (
  select sop_id, max(created_at) as last_review_at
  from public.sop_history
  where event_type = 'review'
  group by sop_id
) h
where h.sop_id = s.id;

-- Drop what this migration replaces.
drop function if exists public.flag_sop_needs_review(uuid, boolean, date, uuid);
drop table public.sop_observations;
alter table public.sops drop column needs_review;
alter table public.sops drop column next_review_date;

-- Maintains sops.last_reviewed_at from sop_reviews inserts - reviews are
-- append-only (no update/delete policy below), so this is the only path that
-- ever moves it.
create or replace function public.set_sop_last_reviewed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.sops set last_reviewed_at = new.reviewed_at where id = new.sop_id;
  return new;
end;
$$;

create trigger sop_reviews_set_last_reviewed
after insert on public.sop_reviews
for each row execute function public.set_sop_last_reviewed();

-- next_review_date, derived, never a writable column. security_invoker so it
-- respects sops_select (in_org) rather than running as the view's owner.
create view public.sop_review_status
with (security_invoker = true)
as
select
  s.id as sop_id,
  s.organisation_id,
  s.last_reviewed_at,
  (coalesce(s.last_reviewed_at, s.published_at) + make_interval(months => s.review_period_months))::date
    as next_review_date
from public.sops s;

alter table public.sop_reviews enable row level security;

create policy sop_reviews_select on public.sop_reviews
for select
using (in_org(organisation_id));

-- manager_staff and above may complete a review (the doc's access rule); the
-- reflection is always attributed to whoever actually submitted it.
create policy sop_reviews_insert on public.sop_reviews
for insert
with check (is_manager(organisation_id) and reviewed_by = (select auth.uid()));

-- No update/delete policy: a review is an append-only historical record, same
-- as sign_offs and sop_history.
