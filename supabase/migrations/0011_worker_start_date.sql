-- 0011_worker_start_date.sql
-- Start date is part of the Worker Register's Position Details and is entered by
-- the staff member during onboarding. It lived on profiles (from 0001), which a
-- staff member cannot write to. Move it to worker_details.

alter table public.worker_details add column start_date date;

update public.worker_details wd
set start_date = p.start_date
from public.profiles p
where p.id = wd.profile_id and p.start_date is not null;

alter table public.profiles drop column start_date;
