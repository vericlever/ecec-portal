-- Step 59, revision A: outcome records become periodic bulk uploads.
--
-- 0088 modelled one upload as one event (incident, near miss, hazard...) with a
-- single event date, and one suggested procedure per record. The real use is a
-- periodic holistic upload (for example a six-monthly incident register) that
-- should prompt review of several procedures, each backed by cited evidence.
--
-- outcome_records was confirmed empty (0 records, 0 links) before this ran, so
-- the old enum and date column are replaced rather than migrated. 0088 is left
-- as applied.

drop index if exists public.outcome_records_org_idx;
drop index if exists public.outcome_records_org_active_idx;

alter table public.outcome_records drop column source_type;
alter table public.outcome_records drop column event_date;
drop type public.outcome_source_type;

create type public.outcome_source_type as enum (
  'incident_reports', 'staff_feedback', 'parent_feedback', 'regulator', 'other'
);

alter table public.outcome_records
  add column source_type public.outcome_source_type not null,
  add column period_start date not null,
  add column period_end date not null,
  add constraint outcome_records_period_check check (period_end >= period_start);

create index outcome_records_org_idx on public.outcome_records (organisation_id, uploaded_at desc);
create index outcome_records_org_active_idx on public.outcome_records (organisation_id) where archived_at is null;
create index outcome_records_overlap_idx
  on public.outcome_records (organisation_id, source_type, service_id, period_start, period_end)
  where archived_at is null;

-- One link row per nominated procedure (up to 4 per record, enforced by the
-- app). evidence is an array of {line, excerpt}: the numbered line of the
-- redacted record and a verbatim excerpt from it, verified server-side before
-- being stored.
alter table public.outcome_record_links
  add column evidence jsonb not null default '[]'::jsonb;
