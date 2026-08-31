-- 0004_document_import_schema.sql
-- Schema changes needed before RSG's real policy and SOP inventory can be
-- imported, and before the generic document importer (0005) can run.
--
-- Rationale is in supabase/import/rsg/REVIEW_NOTES.md. In short:
--   * SOPs belong to a role tier (Educator, Room Leader, Educational Leader,
--     Director, Finance & Admin). Same SOP name can appear in two tiers.
--   * Every SOP has a sign-off type. Default is self-attestation; the
--     high-consequence practical SOPs are supervisor-verified, set from the
--     Educator inventory and switchable per SOP in the admin view.
--   * SOP status is only known for the Educator tier at import, so it is nullable.
--   * Policy-tier documents are not all "policies": handbooks and procedures sit
--     at the same tier. A document_type column carries that.
--   * Some policies and SOPs belong to one site (CCTV, disaster plans, the two
--     parent handbooks). site_id null means it applies at every site
--     (multicampus); set means that site only.
--   * Tier-specific extras (QA mapping, rollout status, build tags) ride along
--     in a jsonb metadata column rather than a column per tier.
--
-- This migration is written to be safe to re-run.

-- ---------------------------------------------------------------------------
-- SOP role tier
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'sop_tier' and n.nspname = 'public'
  ) then
    create type public.sop_tier as enum (
      'educator',
      'room_leader',
      'educational_leader',
      'director',
      'finance_admin'
    );
  end if;
end $$;

alter table public.sops
  add column if not exists target_tier public.sop_tier not null,
  add column if not exists site_id uuid references public.sites(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.sops.target_tier is
  'Role tier this SOP is written for. Distinct from user_role: it says which group trains on the SOP, not who a person is.';
comment on column public.sops.site_id is
  'Null means the SOP applies at every site (multicampus). Set means this site only.';
comment on column public.sops.metadata is
  'Tier-specific attributes that are not modelled as columns yet: QA area weighting, Child Safe Standard mapping, rollout status and dates, build-status tags.';

-- SOP name is unique per tier, not per organisation. "Cultural Partnerships"
-- exists at both Educator and Director tier; "Using NQAITS" at Director and
-- Finance & Admin. Drop the (organisation_id, name) unique constraint by
-- whatever name it was auto-assigned, then add the tier-scoped one.
do $$
declare
  v_conname text;
begin
  select con.conname into v_conname
  from pg_constraint con
  where con.conrelid = 'public.sops'::regclass
    and con.contype = 'u'
    and (
      select array_agg(att.attname::text order by att.attname::text)
      from pg_attribute att
      where att.attrelid = con.conrelid
        and att.attnum = any(con.conkey)
    ) = array['name', 'organisation_id']::text[];
  if v_conname is not null then
    execute format('alter table public.sops drop constraint %I', v_conname);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sops_organisation_id_target_tier_name_key'
      and conrelid = 'public.sops'::regclass
  ) then
    alter table public.sops
      add constraint sops_organisation_id_target_tier_name_key
      unique (organisation_id, target_tier, name);
  end if;
end $$;

-- Sign-off type defaults to self; status stays nullable.
alter table public.sops
  alter column signoff_type set default 'self',
  alter column status drop not null;

-- ---------------------------------------------------------------------------
-- Policy-tier document type, program and site
-- ---------------------------------------------------------------------------

alter table public.policies
  add column if not exists document_type text not null default 'policy',
  add column if not exists program text,
  add column if not exists site_id uuid references public.sites(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.policies.document_type is
  'Kind of policy-tier document: policy, procedure, handbook, agreement, plan. Free text so other providers are not constrained to RSG''s set.';
comment on column public.policies.program is
  'Optional program scope, e.g. general or kinder. Null means it applies to the whole service.';
comment on column public.policies.site_id is
  'Null means the policy applies at every site (multicampus). Set means this site only, e.g. CCTV Policy Timboon.';

-- ---------------------------------------------------------------------------
-- Link provenance
-- ---------------------------------------------------------------------------

alter table public.policy_sop_links
  add column if not exists confidence text,
  add column if not exists note text;

comment on column public.policy_sop_links.confidence is
  'How the link was established: asserted_in_inventory, explicit_in_sop, inferred_high, inferred_needs_review, and so on.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists sops_organisation_tier_idx on public.sops (organisation_id, target_tier);
create index if not exists sops_site_id_idx on public.sops (site_id);
create index if not exists policies_site_id_idx on public.policies (site_id);
