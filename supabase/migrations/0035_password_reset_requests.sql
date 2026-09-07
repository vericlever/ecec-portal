-- Step 23: password reset. An audit row for every reset link issued, whether
-- the person asked for it themselves or a leader triggered it. Supabase Auth
-- owns the token, expiry, rate limiting and brute-force protection; this table
-- is only the who/when/how record.

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  target_email text not null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  requested_by_profile_id uuid references public.profiles(id) on delete set null,
  source text not null check (source in ('self', 'admin')),
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_requests_org
  on public.password_reset_requests (organisation_id, created_at desc);
create index if not exists password_reset_requests_target
  on public.password_reset_requests (target_profile_id, created_at desc);

alter table public.password_reset_requests enable row level security;

-- Managers, admins and HR managers can read their own organisation's reset
-- history. Writes are service-role only (the reset actions), so there is no
-- write policy.
drop policy if exists password_reset_requests_read on public.password_reset_requests;
create policy password_reset_requests_read on public.password_reset_requests
  for select using (
    public.is_manager(organisation_id) or public.can_verify(organisation_id)
  );
