-- Step 20: SOP review cycle. One per-SOP event log so someone can see, in order,
-- every content edit, every change to the review schedule, and every recorded
-- review - and therefore why the review clock reset each time. Step 21's
-- practice observations and Step 27's review-history view read from this table.

create table if not exists public.sop_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  sop_id uuid not null references public.sops(id) on delete cascade,
  event_type text not null check (event_type in ('edit', 'period_change', 'review')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  note text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sop_history_sop
  on public.sop_history (sop_id, created_at desc);
create index if not exists sop_history_org
  on public.sop_history (organisation_id, created_at desc);

alter table public.sop_history enable row level security;

-- Content editors (Manager policy, Admin) read their own organisation's log.
-- Writes are service-role only, done by the SOP editor actions.
drop policy if exists sop_history_read on public.sop_history;
create policy sop_history_read on public.sop_history
  for select using (public.can_edit_content(organisation_id));
