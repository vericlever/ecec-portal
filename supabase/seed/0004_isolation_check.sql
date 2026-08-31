-- seed/0004_isolation_check.sql
-- DEV. Puts one policy into the Science Kinder tenant so cross-organisation
-- isolation is actually testable (until now Science Kinder was empty, so there
-- was nothing to leak).
--
-- After running this, sign in to the app as zeke@readyset.au and confirm the
-- policy list and SOP list show only Ready Set Go content - the Science Kinder
-- policy below must never appear. It is invisible because every query runs
-- under Zeke's row-level security, scoped to the RSG organisation.

insert into public.policies (id, organisation_id, name, status, document_type)
values (
  'f0000000-0000-4000-8000-0000000000ff',
  'a0000000-0000-4000-8000-000000000002',  -- Science Kinder
  'SCIENCE KINDER - isolation test policy (should never be visible to RSG)',
  'in_library',
  'policy'
)
on conflict (id) do nothing;

-- Service-role view (bypasses RLS): both organisations have policies.
select o.name, count(p.*) as policies
from public.organisations o
left join public.policies p on p.organisation_id = o.id
group by o.name
order by o.name;
