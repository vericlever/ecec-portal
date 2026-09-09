-- 0040_child_safe_standard_tagging.sql
--
-- Step 29. Same pattern as 0039, for the 11 Child Safe Standards. RSG operates
-- in Victoria, so these are the Victorian Child Safe Standards (in force from
-- 1 July 2022), which is also the set of 11 the build spec calls for.
--
-- A document may carry at most 3 child safe standards. UI picker stops at 3;
-- the trigger below is the backstop.

-- ---------------------------------------------------------------------------
-- 1. The 11 standards. Global reference data, no write path from the app.
-- ---------------------------------------------------------------------------

create table public.child_safe_standards (
  id smallint primary key,
  code text not null unique,
  name text not null
);

insert into public.child_safe_standards (id, code, name) values
  (1,  'CSS1',  'Culturally safe environments for Aboriginal children and young people'),
  (2,  'CSS2',  'Child safety and wellbeing embedded in leadership, governance and culture'),
  (3,  'CSS3',  'Children and young people are empowered about their rights and participate in decisions affecting them'),
  (4,  'CSS4',  'Families and communities are informed and involved'),
  (5,  'CSS5',  'Equity is upheld and diverse needs respected'),
  (6,  'CSS6',  'People working with children and young people are suitable and supported'),
  (7,  'CSS7',  'Processes for complaints and concerns are child focused'),
  (8,  'CSS8',  'Staff and volunteers are equipped with knowledge, skills and awareness to keep children safe'),
  (9,  'CSS9',  'Physical and online environments promote safety and wellbeing'),
  (10, 'CSS10', 'Implementation of the Child Safe Standards is regularly reviewed and improved'),
  (11, 'CSS11', 'Policies and procedures document how the organisation is safe for children and young people');

alter table public.child_safe_standards enable row level security;

create policy child_safe_standards_select on public.child_safe_standards
  for select using (auth.uid() is not null);

grant select on public.child_safe_standards to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. document_child_safe_standards junction. Reuses taggable_document_type
--    and check_document_tag_owner() from 0039.
-- ---------------------------------------------------------------------------

create table public.document_child_safe_standards (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  document_type public.taggable_document_type not null,
  document_id uuid not null,
  standard_id smallint not null references public.child_safe_standards(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (document_type, document_id, standard_id)
);

create index document_child_safe_standards_org_idx
  on public.document_child_safe_standards (organisation_id);
create index document_child_safe_standards_standard_idx
  on public.document_child_safe_standards (standard_id);

alter table public.document_child_safe_standards enable row level security;

create policy document_child_safe_standards_select on public.document_child_safe_standards
  for select using (public.in_org(organisation_id));
create policy document_child_safe_standards_write on public.document_child_safe_standards
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

create trigger document_child_safe_standards_check_owner
  before insert or update on public.document_child_safe_standards
  for each row execute function public.check_document_tag_owner();

-- ---------------------------------------------------------------------------
-- 3. Now that both junctions exist, give the parent-delete cleanup functions
--    their final form (0039 shipped a fallback version for the fresh-build
--    ordering).
-- ---------------------------------------------------------------------------

create or replace function public.clear_document_tags_for_policy()
returns trigger language plpgsql set search_path = '' as $$
begin
  delete from public.document_quality_areas
    where document_type = 'policy' and document_id = old.id;
  delete from public.document_child_safe_standards
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
end $$;

-- ---------------------------------------------------------------------------
-- 4. Hard cap: at most 3 child safe standards per document.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_child_safe_standard_cap()
returns trigger language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  select count(*) into n
  from public.document_child_safe_standards
  where document_type = new.document_type and document_id = new.document_id;

  if n >= 3 then
    raise exception 'a % may have at most 3 child safe standards', new.document_type
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger document_child_safe_standards_cap
  before insert on public.document_child_safe_standards
  for each row execute function public.enforce_child_safe_standard_cap();
