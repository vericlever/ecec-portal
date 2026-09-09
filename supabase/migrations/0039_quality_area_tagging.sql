-- 0039_quality_area_tagging.sql
--
-- Step 28. Tag a policy or a procedure (SOP) against the National Quality
-- Standard quality areas. There are 7, they are fixed by ACECQA, and they are
-- not something an organisation edits, so the lookup is global reference data
-- rather than a per-organisation table.
--
-- A document may carry at most 2 quality areas. The cap is enforced in the UI
-- (the picker stops at 2) and here with a trigger, so a bulk import or a direct
-- API call cannot exceed it either.

-- ---------------------------------------------------------------------------
-- 1. The 7 quality areas. Global, seeded here, no write path from the app.
-- ---------------------------------------------------------------------------

create table public.nqs_quality_areas (
  id smallint primary key,
  code text not null unique,
  name text not null
);

insert into public.nqs_quality_areas (id, code, name) values
  (1, 'QA1', 'Educational program and practice'),
  (2, 'QA2', 'Children''s health and safety'),
  (3, 'QA3', 'Physical environment'),
  (4, 'QA4', 'Staffing arrangements'),
  (5, 'QA5', 'Relationships with children'),
  (6, 'QA6', 'Collaborative partnerships with families and communities'),
  (7, 'QA7', 'Governance and leadership');

alter table public.nqs_quality_areas enable row level security;

-- Readable by any signed-in user; never written from the app.
create policy nqs_quality_areas_select on public.nqs_quality_areas
  for select using (auth.uid() is not null);

grant select on public.nqs_quality_areas to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. Shared enum for the polymorphic tag junctions. A tag hangs off either a
--    policy or a SOP; the two are never conflated, so the type is explicit.
-- ---------------------------------------------------------------------------

create type public.taggable_document_type as enum ('policy', 'sop');

-- ---------------------------------------------------------------------------
-- 3. document_quality_areas junction.
-- ---------------------------------------------------------------------------

create table public.document_quality_areas (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  document_type public.taggable_document_type not null,
  document_id uuid not null,
  quality_area_id smallint not null references public.nqs_quality_areas(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (document_type, document_id, quality_area_id)
);

create index document_quality_areas_org_idx
  on public.document_quality_areas (organisation_id);
create index document_quality_areas_area_idx
  on public.document_quality_areas (quality_area_id);

alter table public.document_quality_areas enable row level security;

-- Metadata readable org-wide; written by content editors, same as policy
-- categories and SOP/policy source documents.
create policy document_quality_areas_select on public.document_quality_areas
  for select using (public.in_org(organisation_id));
create policy document_quality_areas_write on public.document_quality_areas
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

-- ---------------------------------------------------------------------------
-- 4. Owner integrity. A polymorphic reference cannot use a composite foreign
--    key, so a trigger checks the referenced policy or SOP exists in the same
--    organisation on insert or update, and a delete trigger on each parent
--    clears the tag rows (the composite FK's on delete cascade, done by hand).
-- ---------------------------------------------------------------------------

create or replace function public.check_document_tag_owner()
returns trigger language plpgsql set search_path = '' as $$
declare
  owner_org uuid;
begin
  if new.document_type = 'policy' then
    select organisation_id into owner_org from public.policies where id = new.document_id;
  else
    select organisation_id into owner_org from public.sops where id = new.document_id;
  end if;

  if owner_org is null then
    raise exception 'tagged % % does not exist', new.document_type, new.document_id
      using errcode = '23503';
  end if;
  if owner_org <> new.organisation_id then
    raise exception 'tag organisation_id % does not match the % it is on',
      new.organisation_id, new.document_type
      using errcode = '23503';
  end if;
  return new;
end $$;

create or replace function public.clear_document_tags_for_policy()
returns trigger language plpgsql set search_path = '' as $$
begin
  delete from public.document_quality_areas
    where document_type = 'policy' and document_id = old.id;
  delete from public.document_child_safe_standards
    where document_type = 'policy' and document_id = old.id;
  return old;
exception
  when undefined_table then
    -- 0040 has not run yet during a fresh build; the policy delete still stands.
    delete from public.document_quality_areas
      where document_type = 'policy' and document_id = old.id;
    return old;
end $$;

create or replace function public.clear_document_tags_for_sop()
returns trigger language plpgsql set search_path = '' as $$
begin
  delete from public.document_quality_areas
    where document_type = 'sop' and document_id = old.id;
  delete from public.document_child_safe_standards
    where document_type = 'sop' and document_id = old.id;
  return old;
exception
  when undefined_table then
    delete from public.document_quality_areas
      where document_type = 'sop' and document_id = old.id;
    return old;
end $$;

create trigger document_quality_areas_check_owner
  before insert or update on public.document_quality_areas
  for each row execute function public.check_document_tag_owner();

create trigger policies_clear_document_tags
  before delete on public.policies
  for each row execute function public.clear_document_tags_for_policy();

create trigger sops_clear_document_tags
  before delete on public.sops
  for each row execute function public.clear_document_tags_for_sop();

-- ---------------------------------------------------------------------------
-- 5. Hard cap: at most 2 quality areas per document. A CHECK constraint cannot
--    count sibling rows, so this is a trigger.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_quality_area_cap()
returns trigger language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  select count(*) into n
  from public.document_quality_areas
  where document_type = new.document_type and document_id = new.document_id;

  if n >= 2 then
    raise exception 'a % may have at most 2 quality areas', new.document_type
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger document_quality_areas_cap
  before insert on public.document_quality_areas
  for each row execute function public.enforce_quality_area_cap();
