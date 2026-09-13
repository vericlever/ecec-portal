-- Step 44: the signing clock. Each procedure carries how urgent it is to
-- sign; the clock starts when the role that requires it was assigned (or
-- when the procedure was first published, if that is later), not on the
-- day the procedure happens to have existed since.

alter table public.sops
  add column signoff_priority text not null default 'week'
  check (signoff_priority in (
    'immediate', 'week', 'three_months', 'six_months', 'twelve_months'
  ));

comment on column public.sops.signoff_priority is
  'How long staff have to sign this procedure once it becomes due for them (role assignment date, or this procedure''s own publish date, whichever is later). Unrelated to sops.priority, which is only the staff list display order.';

alter table public.profile_job_roles
  add column assigned_at timestamptz not null default now();

comment on column public.profile_job_roles.assigned_at is
  'When this role assignment began. The signing clock for every procedure in the suite starts here, or at the procedure''s own publish date if that is later.';
