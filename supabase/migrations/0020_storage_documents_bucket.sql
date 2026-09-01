-- 0020_storage_documents_bucket.sql
--
-- Private storage bucket for uploaded documents (policy source files first,
-- contracts and credential evidence later). Nothing reads it directly: uploads
-- and downloads go through the service-role client in server code, which
-- re-checks the caller against the owning record, so no storage.objects RLS
-- policies are needed.

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 26214400)  -- 25 MB
on conflict (id) do nothing;
