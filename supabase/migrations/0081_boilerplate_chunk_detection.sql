-- 0080_boilerplate_chunk_detection.sql
--
-- Tenant-agnostic boilerplate suppression for AI retrieval.
--
-- The problem, found with RSG's real library: every policy generated from
-- their shared document template ends with the same regulatory footer - a
-- cross-reference table per NQS quality area, a changelog, citation
-- material. Near-identical across ~99 policies. Indexed, it dominated
-- retrieval by sheer repetition: an unrelated question was answered from
-- whichever policy's copy of that footer happened to embed closest, so
-- "who can collect a child?" returned the Animal and Pet Policy.
--
-- src/lib/ai/chunk.ts can pattern-match RSG's specific footer headings, and
-- did as a first fix, but that does not survive a second customer. Every
-- organisation arrives with its own template conventions, and a per-client
-- regex list is both unbounded maintenance and a way to silently delete a
-- future client's real content when their genuine section heading happens
-- to collide with someone else's boilerplate wording.
--
-- What generalises is the one property boilerplate has regardless of who
-- authored it: it repeats across documents that are otherwise unrelated. A
-- passage appearing in a quarter of an organisation's library cannot be
-- what distinguishes any one of those documents, so it cannot be the right
-- answer to a specific question. That is measurable per tenant, with no
-- knowledge of the tenant's template, and it self-tunes as their library
-- grows.
--
-- Deliberately a retrieval filter, not a delete. The chunk stays in the
-- table, so the decision is reversible, auditable ("show me what we are
-- suppressing for this org"), and recomputed from scratch on every run
-- rather than accumulating. Suppressing a chunk also never hides a
-- document: see the rescue clause below.

alter table public.content_chunks
  add column text_fingerprint text
    generated always as (md5(regexp_replace(lower(chunk_text), '[^a-z0-9]+', '', 'g'))) stored,
  add column is_boilerplate boolean not null default false;

-- Punctuation, casing and whitespace are normalised out of the fingerprint
-- so the same passage re-flowed by a different converter still matches.
-- Digits are deliberately kept: version numbers, dates and ratios are the
-- kind of difference that can distinguish two genuinely different chunks,
-- and the cost of keeping them is only that a rarer variant of the same
-- footer is counted separately, which the frequency test handles anyway.

create index content_chunks_fingerprint_idx
  on public.content_chunks (organisation_id, text_fingerprint);

-- Retrieval reads only the non-boilerplate rows, so index that subset.
create index content_chunks_searchable_idx
  on public.content_chunks (organisation_id)
  where not is_boilerplate;

-- Recomputes the flag for one organisation from scratch. Called by the
-- embedding worker after a drain, once per organisation whose documents
-- were touched.
--
-- Thresholds are parameters rather than constants so a tenant with an
-- unusual library shape can be tuned without a migration, but the defaults
-- are what the worker uses:
--   p_min_documents 4  - an absolute floor. A brand new organisation with
--                        three documents can never have anything flagged,
--                        which is the right failure mode: with too little
--                        corpus to judge, suppress nothing.
--   p_min_share  0.25  - a quarter of the library. Well above what genuine
--                        shared content reaches (a boilerplate footer sits
--                        near 1.0), well below the point where a real
--                        recurring clause would be caught.
create or replace function public.recompute_boilerplate_chunks(
  p_org uuid,
  p_min_documents int default 4,
  p_min_share numeric default 0.25
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_docs int;
  v_flagged int;
begin
  select count(*) into v_total_docs
  from (
    select distinct document_type, document_id
    from public.content_chunks
    where organisation_id = p_org
  ) d;

  -- Too small a corpus to infer anything from repetition. Clear any flag
  -- set when the library was larger rather than leaving it stale.
  if v_total_docs < p_min_documents then
    update public.content_chunks
    set is_boilerplate = false
    where organisation_id = p_org and is_boilerplate;
    return 0;
  end if;

  with doc_freq as (
    select
      text_fingerprint,
      count(distinct (document_type::text || ':' || document_id::text)) as docs
    from public.content_chunks
    where organisation_id = p_org
    group by text_fingerprint
  ),
  candidate as (
    select text_fingerprint
    from doc_freq
    where docs >= p_min_documents
      and docs::numeric / v_total_docs >= p_min_share
  ),
  -- Rescue clause. A document whose every chunk is boilerplate would
  -- become unreachable by search entirely - worse than the noise we are
  -- removing, and a silent failure rather than a visible one. Keep its
  -- first chunk searchable so the document can still be found and read.
  rescued as (
    select c.id
    from public.content_chunks c
    where c.organisation_id = p_org
      and not exists (
        select 1
        from public.content_chunks c2
        where c2.organisation_id = p_org
          and c2.document_type = c.document_type
          and c2.document_id = c.document_id
          and c2.text_fingerprint not in (select text_fingerprint from candidate)
      )
      and c.chunk_index = (
        select min(c3.chunk_index)
        from public.content_chunks c3
        where c3.organisation_id = p_org
          and c3.document_type = c.document_type
          and c3.document_id = c.document_id
      )
  )
  update public.content_chunks c
  set is_boilerplate =
    c.text_fingerprint in (select text_fingerprint from candidate)
    and c.id not in (select id from rescued)
  where c.organisation_id = p_org;

  select count(*) into v_flagged
  from public.content_chunks
  where organisation_id = p_org and is_boilerplate;

  return v_flagged;
end;
$$;

revoke all on function public.recompute_boilerplate_chunks(uuid, int, numeric) from public;

-- Retrieval now skips suppressed chunks. Otherwise unchanged from 0075:
-- still security invoker, so content_chunks_select (0079, tenant scoping)
-- is still enforced inside this function's own query.
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
  select
    id,
    document_type,
    document_id,
    section_heading,
    chunk_text,
    1 - (embedding OPERATOR(public.<=>) query_embedding) as similarity
  from public.content_chunks
  where organisation_id = match_org
    and not is_boilerplate
    and 1 - (embedding OPERATOR(public.<=>) query_embedding) >= min_similarity
  order by embedding OPERATOR(public.<=>) query_embedding
  limit match_count;
$$;

grant execute on function public.match_content_chunks(vector, uuid, int, float) to authenticated;
