-- 0077_ai_interactions.sql
--
-- AI Staff Q&A. The audit trail for "AI answered from what, when" - written
-- by any future caller of the shared ai-service, not rebuilt per feature.
--
-- Insert happens as part of the asking staff member's own request (the
-- same RLS-scoped session that ran the retrieval via match_content_chunks),
-- so no service-role client appears anywhere in the live Q&A path - a
-- person may only insert a row attributed to themselves. Read is
-- is_manager(), the same read policy notification_log already uses, so a
-- director can audit what was asked and answered.

create table public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  staff_profile_id uuid references public.profiles(id) on delete set null,
  question text not null,
  response text not null,
  grounded boolean not null,
  chunk_ids uuid[] not null default '{}',
  source_documents jsonb not null default '[]',
  model text not null,
  created_at timestamptz not null default now()
);

create index ai_interactions_org_idx
  on public.ai_interactions (organisation_id, created_at desc);
create index ai_interactions_staff_idx
  on public.ai_interactions (staff_profile_id, created_at desc);

alter table public.ai_interactions enable row level security;

create policy ai_interactions_insert on public.ai_interactions
  for insert with check (
    public.in_org(organisation_id)
    and staff_profile_id = (select auth.uid())
  );

create policy ai_interactions_select on public.ai_interactions
  for select using (public.is_manager(organisation_id));
