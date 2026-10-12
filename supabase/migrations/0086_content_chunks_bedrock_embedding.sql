-- Step 58, A4a: zero-downtime cutover from Voyage embeddings to the chosen
-- Bedrock embedding model. A second embedding column, not an in-place
-- overwrite, so a live Q&A query never mixes a Voyage vector against a
-- Bedrock vector mid re-embed (their vector spaces are not comparable even
-- at the same 1024 dimensions).
--
-- Sequence: this migration adds embedding_bedrock alongside the existing
-- Voyage embedding column. scripts/reembed-corpus.ts populates it for every
-- published document. Once every row has embedding_bedrock populated,
-- migration 0087 repoints match_content_chunks at the new column and drops
-- the old one - kept as a separate migration so the repoint only happens
-- once the re-embed script has actually finished, not at deploy time.

alter table public.content_chunks
  add column embedding_bedrock vector(1024) null;

comment on column public.content_chunks.embedding_bedrock is
  'Populated by scripts/reembed-corpus.ts during the Voyage-to-Bedrock cutover (Step 58, A4a). Null until re-embedded. Migration 0087 drops the old embedding column once this is fully populated and match_content_chunks is repointed here.';
