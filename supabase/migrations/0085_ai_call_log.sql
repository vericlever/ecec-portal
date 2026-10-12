-- Step 58: Onshore AI
-- ai_call_log: audit trail for all AI model invocations (Claude inference + embeddings).
-- No prompt or response content stored - only metadata for billing, auditing and rate limiting.
-- Insert happens as part of the shared AI client's request, attributed to the calling service/staff member.
-- Read restricted to admins for audit purposes.

create type public.ai_feature as enum ('qa', 'outcome_link', 'review_reason');

create table public.ai_call_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  feature public.ai_feature not null,
  model_id text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  -- Nullable: background jobs (corpus re-embedding) have no attributable staff member.
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index ai_call_log_org_idx
  on public.ai_call_log (organisation_id, created_at desc);

alter table public.ai_call_log enable row level security;

-- Read: admin only - this is audit data, not application data
create policy ai_call_log_select on public.ai_call_log
  for select using (public.is_admin(organisation_id));

-- Write: service only - insert via the shared AI client
-- No direct insert policy - this table is write-only via the shared client's internal logic
