-- Step 59, B5.1: private bucket for outcome uploads awaiting redaction. The
-- browser uploads straight here via a signed upload URL (generated
-- server-side after confirming the caller is a manager/admin - the same
-- authorisation check that gates outcome_records_insert), not through the
-- documents bucket's server-mediated pattern, so no storage.objects RLS
-- policy is needed here either: the signed URL itself is the one-time grant.
-- A cron job (B5.7) clears anything older than one hour, and the app deletes
-- the file itself on save or cancel - nothing here is meant to persist.

insert into storage.buckets (id, name, public, file_size_limit)
values ('outcome-quarantine', 'outcome-quarantine', false, 20971520)  -- 20 MB, per B4
on conflict (id) do nothing;
