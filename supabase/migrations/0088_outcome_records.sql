-- Step 59: Our Outcomes
--
-- outcome_records: one redacted item uploaded on Our Outcomes (an incident,
-- near miss, hazard, complaint, survey or regulatory contact). Only the
-- redacted text and a hash of the original are ever stored - the original
-- file lives briefly in the outcome-quarantine Storage bucket and is deleted
-- on save or cancel (B5), never in this table.
--
-- outcome_record_links: the AI's suggested procedure for a record, and the
-- manager's decision on it. A suggestion counts for nothing until confirmed
-- (status = 'confirmed') - nothing reads a 'suggested' row as an actual link
-- anywhere outside the "To sort" inbox itself.

create type public.outcome_source_type as enum (
  'incident', 'near_miss', 'hazard', 'complaint', 'survey', 'regulatory'
);

create table public.outcome_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  source_type public.outcome_source_type not null,
  event_date date not null,
  redacted_body text not null,
  original_format text not null,
  original_sha256 text not null,
  uploaded_by uuid not null references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  archived_at timestamptz
);

create index outcome_records_org_idx on public.outcome_records (organisation_id, uploaded_at desc);
create index outcome_records_org_active_idx on public.outcome_records (organisation_id) where archived_at is null;

alter table public.outcome_records enable row level security;

-- Read: managers and admin only - an outcome record is not staff-visible
-- feedback the way a sop_outcome_flags reflection is, it is raw uploaded
-- material awaiting a link decision.
create policy outcome_records_select on public.outcome_records
  for select using (public.is_admin(organisation_id) or public.is_manager(organisation_id));

-- Insert: managers and admin only (this is the Our Outcomes upload flow,
-- staff have no access to Our Outcomes at all per B1).
create policy outcome_records_insert on public.outcome_records
  for insert with check (
    (public.is_admin(organisation_id) or public.is_manager(organisation_id))
    and uploaded_by = (select auth.uid())
  );

-- Update: managers and admin only, and only ever the archived_at field in
-- practice (the app never edits redacted_body once saved) - no separate
-- delete policy, records are archived, never deleted, per B1 item 5.
create policy outcome_records_update on public.outcome_records
  for update using (public.is_admin(organisation_id) or public.is_manager(organisation_id))
  with check (public.is_admin(organisation_id) or public.is_manager(organisation_id));

create type public.outcome_link_status as enum ('suggested', 'confirmed', 'dismissed');

create table public.outcome_record_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  record_id uuid not null references public.outcome_records(id) on delete cascade,
  sop_id uuid not null references public.sops(id) on delete cascade,
  status public.outcome_link_status not null default 'suggested',
  ai_suggested_sop_id uuid references public.sops(id) on delete set null,
  reason text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  review_id uuid references public.sop_reviews(id) on delete set null
);

create index outcome_record_links_record_idx on public.outcome_record_links (record_id);
create index outcome_record_links_sop_idx on public.outcome_record_links (sop_id, status);
create index outcome_record_links_org_suggested_idx
  on public.outcome_record_links (organisation_id) where status = 'suggested';

alter table public.outcome_record_links enable row level security;

create policy outcome_record_links_select on public.outcome_record_links
  for select using (public.is_admin(organisation_id) or public.is_manager(organisation_id));

-- Insert: the app's own server action creates the 'suggested' row right
-- after saving a record (attributed to the uploader's own RLS-scoped
-- session, not a service-role write) - so this is the same gate as
-- outcome_records_insert, not a separate AI-only path.
create policy outcome_record_links_insert on public.outcome_record_links
  for insert with check (public.is_admin(organisation_id) or public.is_manager(organisation_id));

-- Update: deciding a suggestion (confirm/change/dismiss) - manager/admin only.
create policy outcome_record_links_update on public.outcome_record_links
  for update using (public.is_admin(organisation_id) or public.is_manager(organisation_id))
  with check (public.is_admin(organisation_id) or public.is_manager(organisation_id));
