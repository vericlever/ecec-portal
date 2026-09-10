-- 0040_review_actions.sql
--
-- Review cycle v2, section 2 (continued): actions raised by a review. Optional
-- on a review - a decision of 'stands' with no findings raises none.

create type public.sop_review_action_status as enum ('open', 'done', 'cancelled');
create type public.sop_review_raised_from as enum ('practice', 'outcome');

create table public.sop_review_actions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  review_id uuid not null references public.sop_reviews(id) on delete cascade,
  sop_id uuid not null references public.sops(id) on delete cascade,
  description text not null,
  raised_from public.sop_review_raised_from not null,
  owner_id uuid not null references public.profiles(id),
  due_date date not null,
  status public.sop_review_action_status not null default 'open',
  completed_at timestamptz null,
  completed_by uuid null references public.profiles(id),
  completion_note text null
);

create index sop_review_actions_review_id_idx on public.sop_review_actions (review_id);
create index sop_review_actions_sop_id_idx on public.sop_review_actions (sop_id, status);
create index sop_review_actions_owner_id_idx on public.sop_review_actions (owner_id, status);

alter table public.sop_review_actions enable row level security;

create policy sop_review_actions_select on public.sop_review_actions
for select
using (in_org(organisation_id));

-- Raised alongside a review, by the same manager_staff-and-above gate.
create policy sop_review_actions_insert on public.sop_review_actions
for insert
with check (is_manager(organisation_id));

-- Completing (or cancelling) an action: any manager, or the action's own
-- owner even if they are plain staff - an action can be assigned to anyone,
-- not only a manager tier.
create policy sop_review_actions_update on public.sop_review_actions
for update
using (is_manager(organisation_id) or owner_id = (select auth.uid()))
with check (is_manager(organisation_id) or owner_id = (select auth.uid()));
