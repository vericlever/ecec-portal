-- seed/0002_dev_user.sql
-- Step 4 rework: point the two seeded accounts at the four-tier model.
--
-- Both auth users already exist. This only fixes their profiles. Run after
-- migration 0007 and after seed/0005_job_roles.sql (for the Educator job role
-- lookup); re-run once 0005 is in if the job role did not resolve the first
-- time. Idempotent.

-- Zeke: organisation admin. Not scoped to one service.
update public.profiles
set access_tier = 'admin',
    service_id  = null,
    job_role_id = null,
    full_name   = 'Zeke Pottage'
where email = 'zeke@readyset.au';

-- Educator test account: staff tier, Timboon, Educator job role.
update public.profiles
set access_tier = 'staff',
    service_id  = 'b0000000-0000-4000-8000-000000000001',
    job_role_id = (
      select id from public.job_roles
      where organisation_id = 'a0000000-0000-4000-8000-000000000001'
        and name = 'Educator'
    ),
    full_name   = 'Zeke Pottage (educator)'
where email = 'zekepottage@gmail.com';

select email, access_tier,
       service_id is not null  as scoped_to_service,
       job_role_id is not null as has_job_role
from public.profiles
where email in ('zeke@readyset.au', 'zekepottage@gmail.com');
