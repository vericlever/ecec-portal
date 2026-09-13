-- "Priority to sign" was a confusing name - it collides with the unrelated
-- sops.priority (staff list display order) and doesn't describe what the
-- field actually does. Renamed to signing_window before it reaches anyone
-- outside this session.

alter table public.sops rename column signoff_priority to signing_window;
alter table public.sops rename constraint sops_signoff_priority_check to sops_signing_window_check;

comment on column public.sops.signing_window is
  'How long staff have to sign this procedure once it becomes due for them (role assignment date, or this procedure''s own publish date, whichever is later). Unrelated to sops.priority, which is only the staff list display order.';
