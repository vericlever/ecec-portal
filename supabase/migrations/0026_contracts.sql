-- 0026_contracts.sql
--
-- Step 11. Contract storage and renewal (see CONTRACT_MANAGEMENT.md).
--
-- One row per contract period per staff member. A renewal is a new row, never
-- an edit of the old one, so the record keeps a history. The single row with
-- superseded_at is null is the active contract.
--
-- A contract is either a fixed period (start date + duration in months, expiry
-- calculated from those) or no fixed period (a toggle, no expiry, no renewal
-- escalation ever). No default term is assumed.
--
-- Access mirrors the rest of the person record: the staff member reads their
-- own, a manager or admin reads their service, and only Admin or Manager
-- (policy) can write - Manager (staff) is view only, consistent with policies
-- and SOPs.

create type public.contract_period_type as enum ('fixed', 'no_fixed_period');

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  period_type public.contract_period_type not null,
  duration_months integer,
  expiry_date date,
  document_id uuid references public.documents(id) on delete set null,
  notes text,
  superseded_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (profile_id, organisation_id)
    references public.profiles(id, organisation_id) on delete cascade,
  constraint contracts_fixed_needs_duration check (
    (period_type = 'fixed'
      and duration_months is not null
      and duration_months > 0
      and expiry_date is not null)
    or (period_type = 'no_fixed_period'
      and duration_months is null
      and expiry_date is null)
  )
);

comment on table public.contracts is
  'One row per contract period per staff member. Renewals insert a new row; the row with superseded_at null is active. Fixed period has duration_months + expiry_date; no_fixed_period has neither.';

create index contracts_profile_id_idx on public.contracts (profile_id);
create index contracts_active_idx
  on public.contracts (organisation_id) where superseded_at is null;

-- Uploading a new contract for a person retires any earlier active one.
create or replace function public.supersede_prior_contracts()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.contracts
    set superseded_at = now()
  where profile_id = new.profile_id
    and id <> new.id
    and superseded_at is null;
  return new;
end $$;

create trigger contracts_supersede_prior
  after insert on public.contracts
  for each row execute function public.supersede_prior_contracts();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.contracts enable row level security;

create policy contracts_select on public.contracts
  for select using (
    profile_id = (select auth.uid())
    or public.covers_service(organisation_id, public.worker_service(profile_id))
  );

-- Write: Admin anywhere in the organisation, Manager (policy) for staff at
-- their own service. Manager (staff) and the staff member cannot write.
create policy contracts_write on public.contracts
  for all
  using (
    public.can_edit_content(organisation_id)
    and public.covers_service(organisation_id, public.worker_service(profile_id))
  )
  with check (
    public.can_edit_content(organisation_id)
    and public.covers_service(organisation_id, public.worker_service(profile_id))
  );
