-- 0031_policy_categories.sql
--
-- Policies are organised into categories: Parent policies, General policies,
-- HR policies, Manual handling, Other. A policy can be in more than one, since
-- a policy that affects staff can also be one parents view. The set is a
-- per-organisation lookup so a provider can add a sixth later without a code
-- change.
--
-- The "Parent policies" category carries the parent-notification meaning that
-- policies.is_parent_facing held before. A trigger keeps is_parent_facing in
-- step, so Step 9 (Reg 172) can read either.

create table public.policy_categories (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  slug text not null,
  name text not null,
  is_parent_facing boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (organisation_id, slug),
  unique (organisation_id, name),
  unique (id, organisation_id)
);

create table public.policy_category_links (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  policy_id uuid not null,
  category_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (policy_id, category_id),
  foreign key (policy_id, organisation_id)
    references public.policies(id, organisation_id) on delete cascade,
  foreign key (category_id, organisation_id)
    references public.policy_categories(id, organisation_id) on delete cascade
);

create index policy_category_links_category_idx
  on public.policy_category_links (category_id);

alter table public.policy_categories enable row level security;
alter table public.policy_category_links enable row level security;

create policy policy_categories_select on public.policy_categories
  for select using (public.in_org(organisation_id));
create policy policy_categories_write on public.policy_categories
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

create policy policy_category_links_select on public.policy_category_links
  for select using (public.in_org(organisation_id));
create policy policy_category_links_write on public.policy_category_links
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

-- Keep policies.is_parent_facing = "linked to a parent-facing category".
create or replace function public.sync_policy_parent_facing()
returns trigger language plpgsql set search_path = '' as $$
declare
  pid uuid := coalesce(new.policy_id, old.policy_id);
begin
  update public.policies p
  set is_parent_facing = exists (
    select 1
    from public.policy_category_links l
    join public.policy_categories c on c.id = l.category_id
    where l.policy_id = pid and c.is_parent_facing
  )
  where p.id = pid;
  return null;
end $$;

create trigger policy_category_links_sync_parent
  after insert or delete on public.policy_category_links
  for each row execute function public.sync_policy_parent_facing();

-- The default set of categories for an organisation. Called here for the
-- organisations that exist, and available for onboarding a new one.
create or replace function public.seed_policy_categories(target_org uuid)
returns void language plpgsql set search_path = '' as $$
begin
  insert into public.policy_categories (organisation_id, slug, name, is_parent_facing, sort_order)
  values
    (target_org, 'parent', 'Parent policies', true, 1),
    (target_org, 'general', 'General policies', false, 2),
    (target_org, 'hr', 'HR policies', false, 3),
    (target_org, 'manual_handling', 'Manual handling', false, 4),
    (target_org, 'other', 'Other', false, 5)
  on conflict (organisation_id, slug) do nothing;
end $$;

do $$
declare o uuid;
begin
  for o in select id from public.organisations loop
    perform public.seed_policy_categories(o);
  end loop;
end $$;

-- Backfill: every existing policy goes to General; a policy that was already
-- flagged parent-facing also goes to Parent policies. Snapshot the
-- parent-facing set first, because the sync trigger rewrites is_parent_facing
-- as soon as the General links land.
create temporary table _parent_facing_policies on commit drop as
  select id from public.policies where is_parent_facing;

insert into public.policy_category_links (organisation_id, policy_id, category_id)
select p.organisation_id, p.id, c.id
from public.policies p
join public.policy_categories c
  on c.organisation_id = p.organisation_id and c.slug = 'general'
on conflict do nothing;

insert into public.policy_category_links (organisation_id, policy_id, category_id)
select p.organisation_id, p.id, c.id
from public.policies p
join public.policy_categories c
  on c.organisation_id = p.organisation_id and c.slug = 'parent'
where p.id in (select id from _parent_facing_policies)
on conflict do nothing;
