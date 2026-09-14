-- Step 46: comprehension checks. Reshapes the parked comprehension_questions
-- table (migration 0007, never used, zero rows) rather than building the
-- two-table design first sketched for this step - one row per question with
-- an options jsonb array and a correct_option index already makes "exactly
-- one correct option" true by construction, so a separate options table and
-- an is_correct-uniqueness constraint would only add ceremony.
--
-- Questions are NOT version-locked (the dropped sop_version column). A
-- republish already voids every existing sign-off and forces a fresh
-- sign-and-quiz cycle for anyone who has to re-sign, which is the only time
-- a stale question set actually matters - editing questions without
-- republishing the procedure text does not affect anyone who already signed.

alter table public.comprehension_questions
  drop column sop_version,
  alter column correct_option set not null,
  add constraint comprehension_questions_options_shape check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 1 and 4
  ),
  add constraint comprehension_questions_correct_option_valid check (
    correct_option >= 0 and correct_option < jsonb_array_length(options)
  );

comment on table public.comprehension_questions is
  'Step 46. Multiple-choice questions attached to a procedure, not to a specific published version. Signing is unavailable until every question is answered correctly in the same attempt.';

-- Hard cap of 3 questions per procedure, enforced here as well as in the
-- editor UI - "refused at both the UI and the database" per the spec.
create or replace function public.enforce_max_comprehension_questions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.comprehension_questions where sop_id = new.sop_id) >= 3 then
    raise exception 'A procedure may have at most 3 comprehension questions.';
  end if;
  return new;
end;
$$;

create trigger comprehension_questions_max_three
  before insert on public.comprehension_questions
  for each row execute function public.enforce_max_comprehension_questions();

-- One row per attempt, pass or fail, storing exactly what was asked and
-- answered - "the training signal", not just a pass/fail bit. answers shape:
-- [{ question_id, prompt, options, selected_index, correct_index }].
create table public.comprehension_attempts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  sop_id uuid not null,
  profile_id uuid not null,
  passed boolean not null,
  answers jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (sop_id, organisation_id)
    references public.sops(id, organisation_id) on delete cascade,
  foreign key (profile_id, organisation_id)
    references public.profiles(id, organisation_id) on delete cascade
);

create index comprehension_attempts_profile_sop_idx
  on public.comprehension_attempts (profile_id, sop_id, created_at desc);
create index comprehension_attempts_org_idx
  on public.comprehension_attempts (organisation_id, created_at desc);
-- Fast "3 failed attempts on one procedure" lookup for the coaching signal.
create index comprehension_attempts_failed_idx
  on public.comprehension_attempts (profile_id, sop_id)
  where not passed;

alter table public.comprehension_attempts enable row level security;

create policy comprehension_attempts_select on public.comprehension_attempts
for select using (
  profile_id = (select auth.uid())
  or public.is_admin(organisation_id)
  or public.is_manager(organisation_id)
);

-- Write: a person logs their own attempt only - the sign-off it unlocks is
-- the actual privileged act, this is just the record of trying.
create policy comprehension_attempts_insert on public.comprehension_attempts
for insert
with check (
  profile_id = (select auth.uid())
  and public.in_org(organisation_id)
  and exists (select 1 from public.sops s where s.id = sop_id and s.organisation_id = organisation_id)
);

-- The sign-off records which attempt satisfied it - "read, passed, signed",
-- not just a checkbox. comprehension_check_passed (existing column) is kept
-- in sync for anything still reading the plain boolean.
alter table public.sign_offs
  add column comprehension_attempt_id uuid references public.comprehension_attempts(id) on delete set null;
