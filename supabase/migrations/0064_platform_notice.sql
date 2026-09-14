-- 0064_platform_notice.sql
--
-- Step 51. The Vericlever Platform Terms of Use and Privacy Notice is
-- authored by the Operator (Understorey Learning), not by a tenant's own
-- content editors - it is the same document for every organisation on the
-- platform, unlike hr_agreements (Code of Conduct and the like), which is
-- genuinely per-tenant content. Same versioning/signoff shape as
-- hr_agreements + hr_agreement_signoffs (a version, a per-user acceptance
-- record with a timestamp, a new version makes every prior acceptance
-- stale), but its own pair of tables since it is not organisation-scoped
-- content and has no content-editor write surface in the app - the text
-- itself is a content deliverable kept out of the repository and out of
-- any tenant's own authoring UI, and is written directly to this table
-- as data once it has been through legal review.

create table public.platform_notices (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  title text not null,
  body text not null,
  effective_at date,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

comment on table public.platform_notices is
  'The Vericlever platform Terms of Use and Privacy Notice - one document, versioned, shown identically to every organisation. Not authored in-app; written directly as data once legal review is complete.';
comment on column public.platform_notices.version is
  'A new row with a higher version makes every existing platform_notice_acceptances row for a lower version stale, forcing re-acceptance - same effect as republishing an hr_agreement.';

create table public.platform_notice_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  notice_version integer not null references public.platform_notices(version),
  accepted_at timestamptz not null default now(),
  foreign key (profile_id, organisation_id)
    references public.profiles(id, organisation_id) on delete cascade,
  unique (profile_id, notice_version)
);

create index platform_notice_acceptances_profile_idx
  on public.platform_notice_acceptances (profile_id, notice_version);

alter table public.platform_notices enable row level security;
alter table public.platform_notice_acceptances enable row level security;

-- Every authenticated user needs to read the current (and their own
-- previously accepted) notice text, regardless of organisation - there is
-- no tenant boundary on this table by design. No write policy: this table
-- is written directly against the database, not through the app.
create policy platform_notices_select on public.platform_notices
  for select using ((select auth.uid()) is not null);

-- You see and record only your own acceptance. Managers do not need to see
-- this - unlike hr_agreement_signoffs it is not org-authored content whose
-- rollout a manager tracks, it is a condition of having an account at all.
create policy platform_notice_acceptances_select on public.platform_notice_acceptances
  for select using (profile_id = (select auth.uid()));
create policy platform_notice_acceptances_insert on public.platform_notice_acceptances
  for insert with check (
    profile_id = (select auth.uid())
    and public.in_org(organisation_id)
  );
