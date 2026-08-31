-- seed/0005_job_roles.sql
-- Ready Set Go's starting job roles. Run after migration 0007.
--
-- The five real roles take their SOP suite from the tier the SOPs were imported
-- under, but only SOPs that actually exist (status existing / partial, or the
-- non-Educator tiers which have no status and are all real). The 17 Educator
-- "gap" SOPs are deliberately left out of every suite: you cannot sign a
-- procedure that has not been written.
--
-- The four placeholders (Assistant Director, Kitchen, Cleaning, Other) are empty
-- - RSG has no one in them - but exist so a future organisation that does have
-- those roles starts with them present.
--
-- Idempotent: rebuilds the RSG suite from scratch each run.

insert into public.job_roles (organisation_id, name, is_placeholder) values
  ('a0000000-0000-4000-8000-000000000001', 'Educator',           false),
  ('a0000000-0000-4000-8000-000000000001', 'Room Leader',        false),
  ('a0000000-0000-4000-8000-000000000001', 'Educational Leader', false),
  ('a0000000-0000-4000-8000-000000000001', 'Director',           false),
  ('a0000000-0000-4000-8000-000000000001', 'Finance & Admin',    false),
  ('a0000000-0000-4000-8000-000000000001', 'Assistant Director', true),
  ('a0000000-0000-4000-8000-000000000001', 'Kitchen',            true),
  ('a0000000-0000-4000-8000-000000000001', 'Cleaning',           true),
  ('a0000000-0000-4000-8000-000000000001', 'Other',              true)
on conflict (organisation_id, name) do nothing;

delete from public.job_role_sops
where organisation_id = 'a0000000-0000-4000-8000-000000000001';

insert into public.job_role_sops (organisation_id, job_role_id, sop_id)
select s.organisation_id, jr.id, s.id
from public.sops s
join public.job_roles jr
  on jr.organisation_id = s.organisation_id
 and jr.name = case s.target_tier
       when 'educator'           then 'Educator'
       when 'room_leader'        then 'Room Leader'
       when 'educational_leader' then 'Educational Leader'
       when 'director'           then 'Director'
       when 'finance_admin'      then 'Finance & Admin'
     end
where s.organisation_id = 'a0000000-0000-4000-8000-000000000001'
  and (s.status is null or s.status in ('existing', 'partial'));

select jr.name, jr.is_placeholder, count(jrs.sop_id) as sops
from public.job_roles jr
left join public.job_role_sops jrs on jrs.job_role_id = jr.id
where jr.organisation_id = 'a0000000-0000-4000-8000-000000000001'
group by jr.name, jr.is_placeholder
order by jr.is_placeholder, jr.name;
