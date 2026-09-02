-- 0028_hr_identity_fields.sql
--
-- Step 16. Fills the gaps between RSG's live onboarding survey and the portal:
-- gender, emergency contact, uniform sizes, roster availability, and work
-- eligibility with visa detail on worker_details, plus an identity_documents
-- table for Photo ID and visa evidence that a manager sights, the same pattern
-- as the WWCC and training documents.

create type public.work_eligibility as enum (
  'citizen',
  'permanent_resident',
  'visa',
  'other'
);

create type public.identity_document_kind as enum (
  'photo_id',
  'visa',
  'other'
);

alter table public.worker_details
  add column gender text,

  -- emergency contact / next of kin
  add column nok_name text,
  add column nok_relationship text,
  add column nok_phone text,
  add column nok_address text,

  -- uniform sizes (free text, ladies or men's sizing noted by the wearer)
  add column uniform_hoodie text,
  add column uniform_polo text,
  add column uniform_vest text,

  -- roster availability. Captured once, drives no flags or reminders.
  add column available_days text[],
  add column ideal_weekly_hours numeric(4,1),
  add column availability_notes text,

  -- work eligibility. If 'visa', visa_number and visa_expiry carry the detail
  -- and visa_expiry feeds the same expiring / expired flags as a WWCC.
  add column work_eligibility public.work_eligibility,
  add column visa_number text,
  add column visa_expiry date;

comment on column public.worker_details.visa_expiry is
  'Drives the credential expiry flags (src/lib/credentials.ts) exactly as a WWCC expiry does.';

-- Photo ID and visa evidence. One row per uploaded document, sighted by a
-- manager the same way onboarding documents are.
create table public.identity_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind public.identity_document_kind not null,
  label text,
  document_id uuid references public.documents(id) on delete set null,
  sighted_at date,
  sighted_by public.sighted_by,
  created_at timestamptz not null default now(),
  foreign key (profile_id, organisation_id)
    references public.profiles(id, organisation_id) on delete cascade
);

create index identity_documents_profile_id_idx
  on public.identity_documents (profile_id);
create index identity_documents_unsighted_idx
  on public.identity_documents (organisation_id) where sighted_at is null;

create trigger identity_documents_protect_sighted
  before insert or update on public.identity_documents
  for each row execute function public.protect_sighted_fields();

alter table public.identity_documents enable row level security;

-- Same reach as the onboarding document tables: the staff member for their own,
-- a manager or HR manager for staff at their service.
create policy identity_documents_rw on public.identity_documents
  for all
  using (
    profile_id = (select auth.uid())
    or public.can_manage_worker(organisation_id, public.worker_service(profile_id))
  )
  with check (
    profile_id = (select auth.uid())
    or public.can_manage_worker(organisation_id, public.worker_service(profile_id))
  );

-- Allow contract-style documents route to serve these files (owner_type check).
alter table public.documents drop constraint documents_owner_type_check;
alter table public.documents add constraint documents_owner_type_check
  check (owner_type in ('policy', 'sop', 'contract', 'credential', 'identity'));
