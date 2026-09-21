-- 0071_conversion_review_flag.sql
--
-- Step 56: document body is now Markdown produced by a best-effort
-- conversion (mammoth+turndown for docx/html, a font-size/position
-- heuristic for pdf - see src/lib/documents/extract.ts), not a guaranteed
-- structural read the way a real document model would be. `needs_review`
-- marks a document whose conversion confidence is lower than "just trust
-- it": every PDF by default, and any docx/html whose grouping-row heuristic
-- hit an ambiguous table row. It is advisory only - see the app-code
-- comments in extract.ts and the bulk-upload actions for why it never gates,
-- pauses or blocks an upload, single or batched.
--
-- Two places carry the flag: bulk_upload_staging (pre-commit, so the Step 47
-- review screen can show it immediately, alongside the existing duplicate/
-- filename/blank flags) and documents (post-commit, so it survives after the
-- staging row is done with, and a future ongoing review queue - or just an
-- admin looking at one record - can find it later).

alter table public.bulk_upload_staging
  add column needs_review boolean not null default false;
alter table public.documents
  add column needs_review boolean not null default false;

comment on column public.bulk_upload_staging.needs_review is
  'Set from the extraction step''s own confidence signal (every PDF; a docx/html grouping-row heuristic miss) - shown in the bulk review screen, never blocks commit.';
comment on column public.documents.needs_review is
  'Carried over from bulk_upload_staging.needs_review at commit (migrations 0072/0073), or set directly for a single-document upload outside the bulk path. Advisory - the document is still fully usable, this just says a human should check the converted text.';
