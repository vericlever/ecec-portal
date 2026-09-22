-- 0076_embedding_jobs.sql
--
-- AI Staff Q&A. One queue, doubling as the spec's required "log every
-- embedding attempt, success or failure" evidence trail - a row per
-- publish event, updated in place as the cron worker processes it, rather
-- than a separate log table for the same information.
--
-- Insert is can_edit_content(), the same tier gate publishPolicy()/
-- publishSop() already apply before this table is ever touched - the
-- Server Action's own RLS-scoped client does the insert directly, per
-- migration 0044's correction (no service-role bypass for a user-initiated
-- write). Only the cron worker (service role) moves a job through
-- pending -> processing -> done/failed, so there is no update/delete policy
-- for ordinary users.

create table public.embedding_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  document_type public.taggable_document_type not null,
  document_id uuid not null,
  document_version int not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  enqueued_at timestamptz not null default now(),
  processed_at timestamptz
);

create index embedding_jobs_pending_idx
  on public.embedding_jobs (enqueued_at)
  where status = 'pending';

alter table public.embedding_jobs enable row level security;

create policy embedding_jobs_insert on public.embedding_jobs
  for insert with check (public.can_edit_content(organisation_id));

create policy embedding_jobs_select on public.embedding_jobs
  for select using (public.can_edit_content(organisation_id));
