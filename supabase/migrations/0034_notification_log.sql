-- Step 19: reminder engine. A log of every reminder email the scheduled job
-- sends, so a person is not emailed the same digest twice inside its cadence.
-- notification_rules (from 0001) stays the per-org on/off + cadence config; this
-- is the send history.

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  detail jsonb
);

create index if not exists notification_log_dedup
  on public.notification_log (recipient_profile_id, kind, sent_at desc);
create index if not exists notification_log_org
  on public.notification_log (organisation_id, sent_at desc);

alter table public.notification_log enable row level security;

-- Managers and admins can read their own organisation's send history. Writes
-- are service-role only (the cron job), so there is no write policy.
drop policy if exists notification_log_read on public.notification_log;
create policy notification_log_read on public.notification_log
  for select using (public.is_manager(organisation_id));
