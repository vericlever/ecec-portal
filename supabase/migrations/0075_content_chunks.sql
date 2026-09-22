-- 0075_content_chunks.sql
--
-- AI Staff Q&A. Chunks of published policy/procedure Markdown, embedded for
-- similarity search. Written only by the embedding cron worker (service
-- role) - there is no per-request writer, the same reasoning
-- notification_log already uses, so there is no insert/update/delete
-- policy for ordinary users, only select.
--
-- Visibility must mirror "can this profile see the parent document" exactly,
-- the same rule the portal already enforces for the document itself:
--   * policy chunks reuse the existing policy_visible(uuid) (0019) as-is -
--     including its known limitation of reading profiles.job_role_id rather
--     than the multi-role profile_job_roles table (0054). Not fixed here:
--     that would change behaviour of a live, unrelated RLS policy well
--     outside this feature's scope.
--   * procedure chunks have no equivalent today - sops_select (0007) is
--     in_org() only, with job-role filtering done application-side in
--     src/app/sops/page.tsx. sop_visible(uuid) below is a new,
--     multi-role-aware function (via profile_job_roles), built correctly
--     from the start since there is no legacy behaviour to preserve.

create table public.content_chunks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  document_type public.taggable_document_type not null,
  document_id uuid not null,
  document_version int not null,
  chunk_index int not null,
  section_heading text,
  chunk_text text not null,
  embedding vector(1024) not null,
  created_at timestamptz not null default now()
);

create index content_chunks_embedding_idx
  on public.content_chunks using ivfflat (embedding vector_cosine_ops);
create index content_chunks_document_idx
  on public.content_chunks (organisation_id, document_type, document_id);

alter table public.content_chunks enable row level security;

create or replace function public.sop_visible(p_sop uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with sop as (
    select service_id as sop_service
    from public.sops
    where id = p_sop
  )
  select
    (
      (select sop_service from sop) is null
      or (select sop_service from sop) = public.current_service()
    )
    and exists (
      select 1
      from public.profile_job_roles pjr
      join public.job_role_sops jrs on jrs.job_role_id = pjr.job_role_id
      where pjr.profile_id = (select auth.uid())
        and jrs.sop_id = p_sop
    );
$$;

grant execute on function public.sop_visible(uuid) to authenticated;

create policy content_chunks_select on public.content_chunks
  for select using (
    public.in_org(organisation_id)
    and (
      (document_type = 'policy' and public.policy_visible(document_id))
      or (document_type = 'sop' and public.sop_visible(document_id))
    )
  );

-- Retrieval. security invoker (the default, stated explicitly) is
-- load-bearing: called through the asking staff member's own RLS-scoped
-- client, so content_chunks_select above is enforced inside this function's
-- own query - tenant and role scoping happen at the database query level,
-- not as an application-side filter afterward.
create or replace function public.match_content_chunks(
  query_embedding vector(1024),
  match_org uuid,
  match_count int default 8,
  min_similarity float default 0.5
)
returns table (
  chunk_id uuid,
  document_type public.taggable_document_type,
  document_id uuid,
  section_heading text,
  chunk_text text,
  similarity float
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- OPERATOR(public.<=>): search_path is empty in this function (every
  -- other function in this schema does the same for defense in depth), so
  -- an operator symbol - unlike a function or table name - needs this
  -- explicit form; public.<=> alone is not valid operator syntax.
  select
    id,
    document_type,
    document_id,
    section_heading,
    chunk_text,
    1 - (embedding OPERATOR(public.<=>) query_embedding) as similarity
  from public.content_chunks
  where organisation_id = match_org
    and 1 - (embedding OPERATOR(public.<=>) query_embedding) >= min_similarity
  order by embedding OPERATOR(public.<=>) query_embedding
  limit match_count;
$$;

grant execute on function public.match_content_chunks(vector, uuid, int, float) to authenticated;
