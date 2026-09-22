-- 0074_pgvector.sql
--
-- AI Staff Q&A (build spec: claude_ai-staff-qa-build-spec.md). Enables the
-- pgvector extension so content_chunks (0075) can store embeddings and be
-- searched by cosine distance. Not enabled anywhere in the project before
-- this - confirmed by grep across every prior migration.

create extension if not exists vector;
