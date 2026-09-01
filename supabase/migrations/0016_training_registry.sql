-- 0016_training_registry.sql
--
-- A local mirror of the training.gov.au National Register: registered training
-- organisations, and training components (qualifications, units, skill sets,
-- accredited courses). Populated from a bulk extract on a monthly cadence, never
-- queried live and never scraped. Used only to autocomplete and lightly check
-- the RTO number and course code fields on onboarding and bulk import.
--
-- Platform-level lookup, not organisation-scoped - the same as credential_types
-- and external_providers.

create table public.rto_registry (
  code text primary key,
  legal_name text not null,
  trading_name text,
  status text,
  state text,
  source_updated_at date,
  refreshed_at timestamptz not null default now()
);

create table public.training_components (
  code text primary key,
  title text not null,
  component_type text not null
    check (component_type in ('qualification', 'unit', 'skillset', 'accredited_course')),
  status text,
  source_updated_at date,
  refreshed_at timestamptz not null default now()
);

-- One row per refresh run, so an admin can see when the register was last
-- pulled and how much moved.
create table public.registry_refreshes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('rto', 'component')),
  source text not null,
  rows_seen integer not null default 0,
  rows_upserted integer not null default 0,
  ran_by uuid references public.profiles(id) on delete set null,
  ran_at timestamptz not null default now(),
  note text
);

alter table public.rto_registry enable row level security;
alter table public.training_components enable row level security;
alter table public.registry_refreshes enable row level security;

-- Any signed-in user reads the register (autocomplete needs it). Writes are
-- service-role only (the importer uses the admin client), so there is no write
-- policy and RLS denies every other write.
create policy rto_registry_read on public.rto_registry
  for select using ((select auth.uid()) is not null);
create policy training_components_read on public.training_components
  for select using ((select auth.uid()) is not null);
create policy registry_refreshes_read on public.registry_refreshes
  for select using ((select auth.uid()) is not null);

-- ---------------------------------------------------------------------------
-- Starter seed. The monthly extract is the source of truth and upserts over
-- this by code. Qualification and unit codes are the stable national codes;
-- the RTOs are the three the seeded RSG staff reference, pending the extract.
-- ---------------------------------------------------------------------------

insert into public.training_components (code, title, component_type, status) values
  ('CHC30121', 'Certificate III in Early Childhood Education and Care', 'qualification', 'Current'),
  ('CHC50121', 'Diploma of Early Childhood Education and Care', 'qualification', 'Current'),
  ('CHC30113', 'Certificate III in Early Childhood Education and Care', 'qualification', 'Superseded'),
  ('CHC50113', 'Diploma of Early Childhood Education and Care', 'qualification', 'Superseded'),
  ('HLTAID009', 'Provide cardiopulmonary resuscitation', 'unit', 'Current'),
  ('HLTAID010', 'Provide basic emergency life support', 'unit', 'Current'),
  ('HLTAID011', 'Provide first aid', 'unit', 'Current'),
  ('HLTAID012', 'Provide first aid in an education and care setting', 'unit', 'Current'),
  ('HLTAID014', 'Provide advanced first aid', 'unit', 'Current'),
  ('22578VIC', 'Course in First Aid Management of Anaphylaxis', 'accredited_course', 'Current'),
  ('22556VIC', 'Course in Emergency Management of Asthma', 'accredited_course', 'Current')
on conflict (code) do nothing;

insert into public.rto_registry (code, legal_name, state, status) values
  ('3075', 'Melbourne Polytechnic', 'VIC', 'seed - verify against extract'),
  ('3021', 'Deakin University', 'VIC', 'seed - verify against extract'),
  ('3473', 'St John Ambulance Australia (Victoria)', 'VIC', 'seed - verify against extract')
on conflict (code) do nothing;
