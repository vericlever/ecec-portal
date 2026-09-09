# Build log and completion record

Single consolidated record of what has actually been built, verified and merged. It
draws on the git history, the per-step status lines in `BUILD_PLAN.md`, the companion
specs and the migration set on the live Supabase project.

`BUILD_PLAN.md` remains the forward-looking plan and holds the scope, deliverables and
"done when" criteria for each step. This file is the state of play. Where the two
disagree, this file is the more recent and the discrepancies are listed under
"Corrections against BUILD_PLAN.md" below.

Last reconciled against `main` at commit `d977222` (8 September 2026).

## External review status

**Checked by Supabase dev, 8 September 2026. Revisions pending.**

A Supabase developer reviewed the project on 8 September 2026. Revisions arising from
that review are still to be supplied and are not yet reflected in the codebase or in
this log. When the list arrives it goes in the section below and each item is tracked
to done.

### Pending revisions from the Supabase dev review

_To be completed. Paste the reviewer's items here, one per line, and mark each
done / in progress / not started as it is worked._

| # | Item | Area | Status |
| --- | --- | --- | --- |
| | _awaiting the list_ | | |

## Where things stand

As of commit `d977222`, 8 September 2026.

- **Built and on `main`:** Steps 1 to 12, and Steps 14 to 27. The public marketing
  site and sign-in restyle, and a portal-wide Bauhaus visual refresh, are also on
  `main`.
- **Superseded:** Step 13 (compliance heatmap), folded into Step 27's admin overview
  page.
- **Parked, blocked on the sending domain:** Step 9 (Reg 172 parent notification), and
  the outbound-email half of Steps 5, 7, 10, 11 and 19. Every in-portal side is built.
  The daily reminder cron (Step 19) runs and sends nothing useful until `vericlever.site`
  is verified in Resend and `RESEND_FROM` plus `CRON_SECRET` are set in Vercel.
- **Cut:** Step 5e (training.gov.au RTO register mirror), built then removed, migration
  0022. The original Step 12 webhook receiver for external course completions, cut
  3 September, never built.
- **Not independently verified:** Steps 25, 26 and 27 carry Claude's own "verified"
  note but have not been checked against real logins by Zeke. Step 26 in particular is
  still marked "not started" in `BUILD_PLAN.md` although the code is on `main`.

Migrations `0001` to `0038` are all applied to the Sydney (ap-southeast-2) Supabase
project. `main` is in sync with `origin/main` (last fetch 8 September 2026, 09:38);
treat the GitHub push as done but confirm on the remote.

Two things still block RSG staff actually using the portal, both outside the numbered
steps:

1. **RSG's real SOPs and policies are not loaded.** They were cleared on 2 September
   for a clean upload trial and never restored. Re-run `supabase/import/rsg/rsg_import.sql`
   (70 policies, 129 SOPs, 56 links) plus seeds `0004` and `0005`, or upload the current
   versions through the admin screens and classify them into categories.
2. **Nothing is deployed.** It runs on localhost against the live Supabase database.
   It needs to be on Vercel at a real address with the environment variables set.

## Step completion table

| Step | Title | Status | Migrations | Key commits | Verified by Zeke |
| --- | --- | --- | --- | --- | --- |
| 1 | Schema and migration, multi-tenant | Done, on `main` | 0001 to 0003 | `237300f`, `e5d3ca6` | Yes, cross-tenant isolation all directions |
| 2 | Seed data, RSG library and empty Science Kinder | Done, on `main`. RSG inventory later cleared and not restored | 0004, 0005 | `cfa52f6`, `ca66982` | Import returned 70 policies / 129 SOPs / 56 links, no warnings |
| 3 | Single working SOP page, read and sign | Done, on `main` | (none) | `a1489c8`, `2c046e7`, `51d8975`, `e8fb3c1` | Yes, end to end against the live DB |
| 4 | Auth and four-tier access model | Done, on `main` | 0007, later 0014 | `fc75853`, `b4502f8`, `d6f3b3e`, `9b8a060` | Yes, all four tiers against real logins |
| 5a | NQAITS Worker Register schema | Done, on `main` | 0008, 0009 | `0ea1458`, `522fe50` | Yes |
| 5b | Onboarding questionnaire | Done, on `main` | 0010, 0011 | `733ed3b`, `e66fc07` | Yes |
| 5c | Verification queue and staff record view | Done, on `main` | 0012, 0013 | `a14874a`, `25eaca0`, `f7b188f`, `4b80fb4` | Yes |
| 5d | Bulk staff import and NQAITS export | Done, on `main` | 0015 | `3bd461e`, `281f398` | Yes, CSV and JSON end to end. Export not checked against a real NQAITS submission |
| 5 (invite) | First-login invite link on account creation | Done, on `main`, email send blocked on the domain | (none) | `69fddba` | Verified with the on-screen link fallback |
| 5 (self-edit) | Staff self-review and re-verification of sighted checks | Done, on `main` | 0017 | `4b70299`, `bd3026a`, `266efa3` | Yes, under Sam Rivers' JWT |
| 5e | training.gov.au RTO register mirror | Built then cut | 0016, 0018 added, 0022 dropped | `0e535e4`, `3c6dcfc`, `3892ccf` | Reviewed and cut by Zeke 1 September |
| 6 | Policy management, upload pipeline, staff Policies tab | Done, on `main`. Extended by Policy categories | 0019, 0020, 0021, 0025 | `ffaa4a9`, `652d908` | Yes, end to end |
| 7 | Job roles, SOP suites, SOP authoring, sign-off model | Done, on `main`. Reminder email outstanding | 0023, 0024 | `0a96550`, `4c98c6f`, `2c52d58` | Yes, end to end |
| 8 | Staff reporting, team roll-up and per-staff breakdown | Done, on `main` | (none) | `55d77dc` | Yes |
| 9 | Reg 172 parent notification trigger | Parked, blocked on the sending domain | (none yet) | (none) | No |
| 10 | Credential tracking, director view, staff self-service | Done, on `main`. Email escalation deferred | 0017 | `9c2e4d6` | Yes |
| 11 | Contract storage and renewal | Done, on `main`. Email and pop-up escalation deferred | 0026 | `90ddf8f` | Yes |
| 12 | Mobile capture and installable app (PWA) | Done, on `main`. Wider mobile and tablet polish still worth doing | (none) | `8887337` | Partial |
| 13 | Compliance heatmap | Superseded by Step 27 | n/a | n/a | n/a |
| Public site | Bauhaus landing page and restyled sign-in | Done, on `main` | (none) | `274487f`, `9795d59`, `d977222` | Landing and sign-in checked, wrong-password path checked |
| 14 | Browser-native SOP read-aloud | Done, on `main` | (none) | `3d17773`, `2e86eaf` | Play, pause, resume, stop cycle checked |
| 15 | Click-through from a SOP to its source policy | Done, on `main` | (none) | `66238a2` | Yes, as a staff member |
| 16 | HR access model, identity, working rights, personal record | Done, on `main` | 0027, 0028 | `e69187d`, `1d5b06e` | Yes |
| 17 | Agreements and the sign mechanism | Done, on `main` | 0029 | `a0b9b31` | Yes |
| 18 | Payroll and screening | Done, on `main` | 0030 | `166f921` | Yes, against real logins |
| Policy categories | Per-org policy categories, replaces the parent-facing checkbox | Done, on `main` | 0031 | `d8af549` | Yes |
| 19 | Daily reminder engine | Done, on `main`. Sends nothing useful until the domain is verified | 0034 | `ab2f949`, `289fc40` | Dry run and a live run on localhost |
| 20 | SOP review cycle and history log | Done, on `main` | 0036 | `b1ebf6b`, `c819da4` | Not independently verified |
| 21 | SOP practice observation record | Done, on `main` | 0037 | `dc29b9c`, `f7b8dc5` | Claude end to end, not independently verified |
| 22 | SOP outcome evidence capture, plus the RLS review | Done, on `main` | 0038 | `e9729bc`, `f4d22a0` | RLS review scripted and passed. Feature not independently verified |
| 23 | Password reset, self-service and admin-triggered | Done, on `main`. Needs Step 19's email to actually send | 0035 | `98a4be1` | Claude end to end on localhost |
| 24 | Two-page bulk upload wizard for SOPs and policies | Done, on `main` | 0032, 0033 | `bac7cf9`, `d15d09f`, `1087d7d` | Not independently verified. Trial-relevant |
| 25 | Itemised outstanding items on the staff profile | Done, on `main` | (none) | `9065cf5` | Claude checked against Sam and the team roll-up, not independently verified |
| 26 | Staff record editors for job role and access tier | Code on `main`, `BUILD_PLAN.md` still says "not started" | (none) | `5e97e24` | No. Trial blocker, needs a real check |
| 27 | Admin overview page, folds in the old Step 13 heatmap | Done, on `main` | (none) | `172cf17` | Claude as admin and as manager_staff, not independently verified |

## Migration register

All applied to the Sydney Supabase project via `scripts/run-sql.mjs` as they were
written.

| File | What it does |
| --- | --- |
| 0001_init_schema.sql | Multi-tenant base schema, `organisation_id` on every tenant table |
| 0002_rls_policies.sql | Row-level security policy pattern across every table |
| 0003_indexes.sql | Supporting indexes |
| 0004_document_import_schema.sql | Tier, `site_id`, `document_type`, metadata columns. `signoff_type` default self. Nine Educator SOPs flagged for manager co-sign |
| 0005_import_documents_fn.sql | `import_documents(org, jsonb)` function |
| 0006_policy_views.sql | `policy_views` table |
| 0007_access_tiers.sql | `sites` to `services`, `user_role` to `access_tier` (staff / manager_staff / manager_policy / admin), `job_roles`, `job_role_sops`, `comprehension_questions` (empty, parked). RLS fully rewritten |
| 0008_worker_register.sql | `worker_details`, `wwcc_checks`, `teacher_registrations`, `qualifications`, `training_records`, nine NQAITS enums, verification fields, `can_verify()` and `protect_sighted_fields()` |
| 0009_service_type_codes.sql | Service type aligned to NQAITS codes CBC / FDC |
| 0010_sync_name_definer.sql | Name-sync trigger moved to security definer |
| 0011_worker_start_date.sql | `start_date` moved from `profiles` to `worker_details` |
| 0012_verifier_worker_access.sql | `can_manage_worker()` so an HR verifier of any tier can act at their service |
| 0013_probation_start_date.sql | `worker_details.probation_start_date`, a leader-set date separate from `start_date` |
| 0014_manager_reach_excludes_admin.sql | A manager's reach is their own non-null service only. Admin records out of a manager's view |
| 0015_import_source_json.sql | `json` added to `staff_import_records.source` |
| 0016_training_registry.sql | RTO / training-component registry tables. Dropped by 0022 |
| 0017_lock_sighted_checks.sql | Sighted WWCC and teacher-registration rows become permanent history, non-verifier updates raise |
| 0018_registry_search_fn.sql | Registry search functions. Dropped by 0022 |
| 0019_policy_management.sql | `documents` table (generic owner_type / owner_id), policy publish model, `policy_audiences`, visibility helpers |
| 0020_storage_documents_bucket.sql | Private `documents` storage bucket |
| 0021_policy_targets_fn.sql | Policy targeting functions |
| 0022_drop_training_registry.sql | Removes the Step 5e registry tables and functions |
| 0023_signoff_type_self_and_manager.sql | `signoff_type` enum is `self` or `self_and_manager`. Nine high-consequence SOPs set to `self_and_manager` |
| 0024_sop_authoring.sql | SOPs get the same publish model as policies, `target_tier` made an optional category label, name uniqueness moved to (org, name), `sign_offs.verified_at` |
| 0025_policy_targets_fn_names.sql | Policy targeting functions reworked to return names |
| 0026_contracts.sql | Contract storage and renewal schema |
| 0027_hr_manager_role.sql | `hr_verifier` renamed `hr_manager`, scope widened to payroll, screening and contract write |
| 0028_hr_identity_fields.sql | Identity, working-rights, next of kin, uniform, availability fields |
| 0029_hr_agreements.sql | Org-level agreement templates, signature rows, contract signing |
| 0030_payroll_screening_referees.sql | Tax File Number declaration, super, banking, screening declarations, two referees |
| 0031_policy_categories.sql | Per-org policy categories, `is_parent_facing` kept in step by trigger |
| 0032_review_period.sql | `review_period_months` on SOPs and policies |
| 0033_next_review_date.sql | `next_review_date` on SOPs and policies |
| 0034_notification_log.sql | `notification_log`, records each reminder send and enforces the 7-day cadence |
| 0035_password_reset_requests.sql | `password_reset_requests` audit table |
| 0036_sop_history.sql | `sop_history` event log (edit / period_change / review) |
| 0037_sop_observations.sql | `sop_observations` and `sops.needs_review` |
| 0038_evidence_and_rls_review.sql | SOP suggested-evidence and per-observation file. RLS fixes: `documents_select` scoped to the owning record, `sign_offs_insert` and `policy_views_insert` restricted to self, `credentials` and `notification_rules` tightened |

## Chronological log

### 31 August 2026

Repo created, README and BUILD_PLAN in. Step 1 schema, RLS and indexes built and
merged. Step 2 document importer and RSG library built and merged, import clean. Step 3
Next.js app scaffolded, one working SOP page wired to the Supabase pooler and verified
end to end. Step 4 Supabase Auth, sessions, RLS and admin staff creation built and
merged. Middleware moved into `src/` so it runs.

### 1 September 2026

Role, onboarding and contract specs added, BUILD_PLAN rewritten to v2 (four access
tiers, in-app NQAITS onboarding, "The Portal" renamed VeriClever). Step 4 reworked to
the four-tier model and merged. SOP bodies and multi-account test fixtures added,
signed-SOP redirect bug fixed. Step 5 built across the day: 5a schema, 5b onboarding
questionnaire, 5c verification queue and staff record view, 5d bulk import and NQAITS
export. First-login invite link added. Step 5e RTO autocomplete built. Staff self-edit
after onboarding, and re-verification when a sighted check is re-entered, built and
merged. Step 6 policy management, upload pipeline and staff Policies tab built.

### 2 September 2026

Science Kinder tenant seeded for isolation testing. Step 5e cut. SOP sign-off model
corrected to self versus self_and_manager. Step 7 SOP authoring and job-role suite
management built, bulk upload gained batch job-role and sign-off-type controls. Admin
nav collapsed into a Manage menu. Step 8 staff reporting, Step 10 credential tracking
and the manager dashboard, Step 11 contract storage and renewal all built. HR record
expansion planned as Steps 16 to 18. HR flag renamed `hr_manager`. Steps 16, 17 and 18
built. RSG's imported SOPs and policies cleared for a clean upload trial.

### 3 September 2026

Policy categories built, BUILD_PLAN brought up to date. Profile page added. "Manual
handling" policy category renamed "OHS policies". Step 12 mobile capture, mobile nav
and PWA built. "My details" added to the Manage menu.

### 7 September 2026

SOP review cycle revision folded into BUILD_PLAN as Steps 19 to 27. Step 26 staff
record editors for job role and access tier built. Step 24 two-page bulk upload wizard
built. Step 19 daily reminder engine built and merged. Step 23 password reset built.
Step 20 SOP review cycle and history log built. Step 21 SOP practice observation record
built.

### 8 September 2026

Step 22 outcome-evidence capture built, with a comprehensive RLS review
(`scripts/rls-check.mjs`, `SECURITY_REVIEW_2026-09.md`, migration 0038 fixes). Steps 20,
21 and 22 branches merged. Step 25 itemised outstanding items moved to the top of the
staff record. Step 27 admin overview page built. Step 14 browser-native SOP read-aloud
built, with an Australian English voice preference. Step 15 SOP to source-policy
click-through built. Public marketing site and restyled sign-in built. Portal-wide
Bauhaus visual refresh, cosmetic only. Dropdown menu z-index fix. **Supabase dev review
this date, revisions pending.**

## Corrections against BUILD_PLAN.md

`BUILD_PLAN.md` is accurate step by step up to about 3 September. The following drifted
as the 7 and 8 September work landed and are corrected here:

1. **"Where things stand (3 September 2026)"** at the top of BUILD_PLAN is stale. It
   lists Steps 12 to 15 as not started and does not mention Steps 19 to 27 existing.
   The per-step sections lower in that file are current, the summary block is not.
2. **Step 26** reads "Status: not started" in BUILD_PLAN. The code is on `main`
   (commit `5e97e24`, 7 September): the job role editor, the access tier editor with
   both guards, and the job-roles assignment picker. It has not been verified against
   real logins, so it is not "done", but it is not "not started" either.
3. **Merge state.** BUILD_PLAN describes the public site and Steps 14, 15, 19, 20, 21,
   22, 23, 25 and 27 as "built on branch X, not merged". All of that work is on `main`
   as of 8 September. Steps 19 to 22 came through explicit merge commits, the 8
   September work (14, 15, 25, 27, public site, Bauhaus) was committed straight to
   `main` rather than through a per-step branch, a departure from the one-branch-per-step
   workflow.
4. **Step 18 and Policy categories** are described as waiting to merge on
   `step-18-payroll-screening`. Both are on `main` (commits `166f921` and `d8af549`,
   2 and 3 September).
5. **Push state.** BUILD_PLAN says `main` has not been pushed to
   `github.com/vericlever/ecec-portal`. Local `main` now tracks `origin/main` with
   nothing ahead. The push appears done. Confirm on GitHub.
6. **The Bauhaus visual refresh and the dropdown fix** (commits `9795d59` and
   `d977222`, 8 September) are not recorded anywhere in BUILD_PLAN.

## Outstanding and blocked

- **Sending domain.** Buy the VeriClever domain, register the ABN, verify
  `vericlever.site` with Resend, set `RESEND_FROM`, `NEXT_PUBLIC_SITE_URL` and
  `CRON_SECRET`. Unblocks staff invite emails, SOP reminders, credential and contract
  escalation, the Reg 172 parent digest and the admin-triggered password reset email in
  one move. Zeke's action.
- **Supabase dev revisions.** Pending, see the top of this file.
- **RSG content not loaded.** Re-run the importer or upload through the admin screens,
  then classify policies into categories and publish.
- **Not deployed.** Connect Vercel, set the environment variables, confirm it runs
  against the live database at a real address.
- **Independent verification** of Steps 20 to 27 against real logins. Claude's own
  checks are recorded but Zeke has not signed these off.
- **Mobile and tablet polish pass** across every screen (Step 12 follow-up).
- **Test data cleanup.** The throwaway Resend test account, and the demo records left
  on Sam Rivers and others during verification.

## Companion documents

- `BUILD_PLAN.md`: scope, deliverables and "done when" criteria per step
- `ROLE_ACCESS_MATRIX.md`: feature-by-role breakdown
- `STAFF_ONBOARDING_NQAITS.md`: NQAITS field structure and verified dropdown lists
- `CONTRACT_MANAGEMENT.md`: contract storage and renewal detail
- `REVISION_SOP_REVIEW_CYCLE.md`: the spec behind Steps 19 to 27
- `SECURITY_REVIEW_2026-09.md`: the September RLS review, method and findings
- `supabase/import/rsg/REVIEW_NOTES.md`: decisions made during the RSG import
