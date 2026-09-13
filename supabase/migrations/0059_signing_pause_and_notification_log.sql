-- Step 44 (pause/leave) and Step 45 (notification log + delivery tracking).

-- Pause/leave: modelled per person, not per assignment - the real scenario
-- (someone on leave) means every outstanding item should freeze the same
-- way, not just one procedure. While paused, due dates are not computed as
-- overdue and no reminders send. On resume, the elapsed paused time is
-- banked and added to every future due-date computation for that person,
-- restoring the remaining runway rather than resetting the clock.
alter table public.profiles
  add column signing_paused_at timestamptz,
  add column signing_paused_reason text,
  add column signing_paused_until date,
  add column signing_paused_days_banked integer not null default 0;

comment on column public.profiles.signing_paused_days_banked is
  'Cumulative days paused across every past pause period, added to every signing-clock due date computed for this person from now on.';

-- Hard-bounce suppression: a wrong email address is a compliance gap, not a
-- mail problem, so it is flagged here and every send path must check it.
alter table public.profiles
  add column email_suppressed_at timestamptz,
  add column email_suppressed_reason text;

-- notification_log (migration 0034) recorded that a send was attempted, not
-- what happened to it. Extending it in place rather than creating a second
-- table - it is already RLS-scoped and already the thing reminders.ts writes
-- to for its dedup cadence check.
alter table public.notification_log
  add column related_profile_id uuid references public.profiles(id) on delete set null,
  add column related_object_type text,
  add column related_object_id uuid,
  add column trigger_reason text,
  add column provider_message_id text,
  add column delivery_state text not null default 'sent'
    check (delivery_state in ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'suppressed')),
  add column delivered_at timestamptz,
  add column failure_reason text;

comment on column public.notification_log.delivery_state is
  'Updated by the Resend webhook as delivery events arrive. Defaults to sent, not delivered - delivered is only set once Resend actually confirms it, never assumed from the send call returning 200.';

create index if not exists notification_log_provider_message_id_idx
  on public.notification_log (provider_message_id) where provider_message_id is not null;
