# Build log and completion record

Single consolidated record of what has actually been built, verified and merged. It
draws on the git history, the per-step status lines in `BUILD_PLAN.md`, the companion
specs and the migration set on the live Supabase project.

`BUILD_PLAN.md` remains the forward-looking plan and holds the scope, deliverables and
"done when" criteria for each step. This file is the state of play. Where the two
disagree, this file is the more recent and the discrepancies are listed under
"Corrections against BUILD_PLAN.md" below.

Last reconciled against `main` at commit `74d8822` (21 September 2026).

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

As of commit `74d8822`, 21 September 2026.

- **Built and on `main`, deployed:** Steps 1 to 12, 14 to 56 (see the step table; a
  handful of numbers in that range were never allocated to a standalone step and
  their work is described in the chronological log instead). The public marketing
  site, sign-in restyle, portal-wide Bauhaus visual refresh, the parent portal, and
  the full Markdown conversion pipeline are all on `main`. **The app is deployed on
  Vercel** at `vericlever.site` and its `www` alias - no longer localhost-only. This
  closes the single biggest blocker in the previous version of this log.
- **Superseded:** Step 13 (compliance heatmap), folded into Step 27's admin overview
  page. Steps 20, 21 and 22 (the original SOP review cycle, practice observation and
  outcome evidence design) were replaced wholesale by Review cycle v2
  (`REVISION_REVIEW_CYCLE_V2.md`, migrations 0046 to 0050, 10 September) - see the
  step table and "Corrections" below.
- **RSG's real content is loaded.** 70 policies, 129 SOPs and their links were
  restored via the admin bulk upload screens (not the original SQL importer), then
  every document with a stored source file was reprocessed through the Step 56
  Markdown pipeline on 21 September - 150 of 151 documents changed, 141 already-
  published ones were re-published to a new version. See the Step 56 row and the
  21 September chronological entry.
- **Sending domain: very likely resolved, not reconfirmed in this log.**
  `RESEND_FROM`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET` and `PARENT_ACCESS_SECRET` are
  all set in `.env.local`, and the parent portal's access secret was walked through
  live on Vercel with Zeke. Nobody has re-run a live email send-test since to put this
  beyond doubt - worth a quick check before relying on it for the reminder engine or
  Reg 172 notifications.
- **Cut:** Step 5e (training.gov.au RTO register mirror), built then removed, migration
  0022. The original Step 12 webhook receiver for external course completions, cut
  3 September, never built.
- **Not independently verified:** most work from Step 25 onward carries Claude's own
  "verified" note (or no verification note at all in this log) but has not been
  checked against real logins by Zeke. This got worse, not better, as pace picked up
  from 9 September - see the per-step "Verified by Zeke" column, mostly "Not
  recorded" for that stretch. The exceptions, checked live with Zeke in the room, are
  the parent portal, the bulk upload defaults/tagging work, and Step 56.

Migrations `0001` to `0073` are all applied to the Sydney (ap-southeast-2) Supabase
project. `main` is in sync with `origin/main` as of this reconciliation.

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
| 12 | Mobile capture and mobile nav | Done, on `main`. PWA half (manifest, service worker, install prompt) removed 15 September 2026 - deferred, not cut, see chronological log. Wider mobile and tablet polish still worth doing | (none) | `8887337` (original), `3725832` (PWA removal) | Partial |
| 13 | Compliance heatmap | Superseded by Step 27 | n/a | n/a | n/a |
| Public site | Bauhaus landing page and restyled sign-in | Done, on `main` | (none) | `274487f`, `9795d59`, `d977222` | Landing and sign-in checked, wrong-password path checked |
| 14 | Browser-native SOP read-aloud | Done, on `main` | (none) | `3d17773`, `2e86eaf` | Play, pause, resume, stop cycle checked |
| 15 | Click-through from a SOP to its source policy | Done, on `main` | (none) | `66238a2` | Yes, as a staff member |
| 16 | HR access model, identity, working rights, personal record | Done, on `main` | 0027, 0028 | `e69187d`, `1d5b06e` | Yes |
| 17 | Agreements and the sign mechanism | Done, on `main` | 0029 | `a0b9b31` | Yes |
| 18 | Payroll and screening | Done, on `main` | 0030 | `166f921` | Yes, against real logins |
| Policy categories | Per-org policy categories, replaces the parent-facing checkbox | Done, on `main` | 0031 | `d8af549` | Yes |
| 19 | Daily reminder engine | Done, on `main`. Sends nothing useful until the domain is verified | 0034 | `ab2f949`, `289fc40` | Dry run and a live run on localhost |
| 20 | SOP review cycle and history log | Superseded by Review cycle v2, 10 September (see below) | 0036, superseded by 0046-0050 | `b1ebf6b`, `c819da4` | Not independently verified |
| 21 | SOP practice observation record | Superseded by Review cycle v2, 10 September (see below) | 0037, superseded by 0046-0050 | `dc29b9c`, `f7b8dc5` | Claude end to end, not independently verified |
| 22 | SOP outcome evidence capture, plus the RLS review | Superseded by Review cycle v2, 10 September. The RLS review itself stands | 0038, superseded by 0046-0050 | `e9729bc`, `f4d22a0` | RLS review scripted and passed. Feature not independently verified |
| 23 | Password reset, self-service and admin-triggered | Done, on `main`. Needs Step 19's email to actually send | 0035 | `98a4be1` | Claude end to end on localhost |
| 24 | Two-page bulk upload wizard for SOPs and policies | Done, on `main` | 0032, 0033 | `bac7cf9`, `d15d09f`, `1087d7d` | Not independently verified. Trial-relevant |
| 25 | Itemised outstanding items on the staff profile | Done, on `main` | (none) | `9065cf5` | Claude checked against Sam and the team roll-up, not independently verified |
| 26 | Staff record editors for job role and access tier | Code on `main`, `BUILD_PLAN.md` still says "not started" | (none) | `5e97e24` | No. Trial blocker, needs a real check |
| 27 | Admin overview page, folds in the old Step 13 heatmap | Done, on `main` | (none) | `172cf17` | Claude as admin and as manager_staff, not independently verified |
| 28 | NQS quality area tagging, policies and SOPs | Done, on `main` | 0039 | `6a076da` | Not recorded in this log |
| 29 | Victorian Child Safe Standard tagging, policies and SOPs | Done, on `main` | 0040 | `6a076da` | Not recorded in this log |
| 30 to 38 | Reports page and 8 downloadable PDF reports | Done, on `main` | (none) | `38a84f2` | Not recorded in this log |
| 39 | Contract signature revision: independent countersignature slot, hash of the signed document | Done, on `main` | 0042 | `4e2c49a`, `128be5e` | Not recorded in this log |
| 40 | Admin can complete their own onboarding and self-edit | Done, on `main` | (none) | `a26bad1`, `eab3ac5` | Not recorded in this log |
| 41 | Rename "SOP" to "Procedure" in every user-facing surface | Done, on `main` | (none) | `bb732d2` | Not recorded in this log |
| 42 | Password field show/hide toggle | Done, on `main` | (none) | `cc1e53f` | Not recorded in this log |
| Review cycle v2 | Replaces Steps 20 to 22: `sop_reviews` review event, review actions, 6-month default cadence, needs-revision queue behaviour, published-event fix | Done, on `main` | 0046, 0047, 0048, 0049, 0050 | `82c9411`, `4f46b07`, `72f9515`, `5a2e377`, `6f0f99a` | RLS cross-tenant probes extended and passed (`9cb9fa1`, `ed1d5ab`). Feature not independently verified |
| 43 | Organisation timezone, fixes UTC/local date display bugs | Done, on `main` | 0056 | `a18326a` | Not recorded in this log |
| 44 | Signing clock: per-procedure signing window, role-start-based due dates, pause/leave state | Done, on `main`. Field renamed "signing priority" to "signing window" the same week | 0057, 0058, 0059 | `8755da8`, `56160f6`, `70e370d` | Not recorded in this log |
| 45 | Notification log: Resend delivery tracking and hard-bounce suppression | Done, on `main` | 0059 | `e69346b` | Not recorded in this log |
| 46 | Comprehension checks before signing a procedure | Done, on `main` | 0062 | `b5e1fa1` | Not recorded in this log |
| 47 | Bulk upload review queue and duplicate detection | Done, on `main`. Extended 15 September with batch defaults and NQS/Child Safe Standard tagging on the review screen (see 21 September entry) | 0060, 0069, 0070 | `258eefa`, `f97701e`, `ed9f738` | Not recorded in this log for the original step. Bulk review dropdown tagging checked live by Claude, confirmed by Zeke against two screenshots |
| 48 | Search on the admin Procedures and Policies lists | Done, on `main` | 0061 | `4bb6a64` | Not recorded in this log |
| 49 | Support contact points at a monitored address | Done, on `main` | (none) | `9f67a37` | Not recorded in this log |
| 51 | Platform Terms of Use and Privacy Notice acceptance gate | Done, on `main` | 0064 | `3400407`, `cdf8769` | Not recorded in this log |
| 53 | Chain graphic on the admin overview | Done, on `main` | (none) | `de3fb27`, `f56684a` | Not recorded in this log |
| 54 | Split leader nav into My Portal, Our Staff and Our Workflow | Done, on `main`. Extended 21 September: Our Workflow's items renamed "Our Policies" / "Our Procedures" to read as distinct from the personal "My" pages, Parent portal access moved to the end of that menu, and the plain-staff flat nav (no admin duplicate to disambiguate from) renamed to match | 0039 to 0073, none specific to this step | `498a1a4`, `74d8822` | The original split not recorded in this log. The 21 September rename checked live by Claude against both tenants, confirmed by Zeke against a live screenshot |
| 55 | Training status page | Done, on `main` | (none) | `9337d93` | Not recorded in this log |
| 56 | Convert docx/html/pdf uploads to Markdown; backfill all 151 existing RSG documents; let a procedure link to its governing policies, not just the reverse | Done, on `main` | 0071, 0072, 0073 | `3ed7065`, `db50b6f` | Yes. Verified end to end against a hand-built test docx and against real RSG content (`scripts/reprocess-documents.ts` dry run then apply, `scripts/bulk-republish.ts`), including catching and fixing a real bug (an embedded image was being inlined as base64 into the stored body). Policy-procedure linking verified live on the Science Kinder tenant in both directions, then the test link removed |

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
| 0039_quality_area_tagging.sql | Step 28. Global NQS quality area lookup (7, fixed by ACECQA) and the tagging junction table |
| 0040_child_safe_standard_tagging.sql | Step 29. Same pattern as 0039, for the 11 Victorian Child Safe Standards |
| 0041_fix_import_documents_fn.sql | Repairs `import_documents()` (0005), broken by schema changes since (renamed `sites` to `services` and others) |
| 0042_contract_signatures.sql | Step 39. Independent countersignature slot alongside the original signed_at/signed_name, hash of the exact document signed |
| 0043_default_job_roles.sql | Seeds the 5 standard job roles for every organisation automatically, so a new tenant's role picker is never empty |
| 0044_rls_for_app_write_paths.sql | Stops every Server Action bypassing RLS via the service-role client. Makes RLS the real enforcement layer instead of a backstop nothing actually exercises |
| 0045_sign_offs_countersign_fix.sql | Closes a self-countersign gap found while extending `rls-check.mjs` against the manager-cosign path |
| 0046_review_event.sql | Review cycle v2, section 2. `sop_reviews`, dropping `sops.needs_review`, `sops.next_review_date` and `sop_observations` in the same migration - supersedes Steps 20-22 |
| 0047_review_actions.sql | Review cycle v2 continued. Optional actions raised by a review |
| 0048_review_period_default.sql | Review cycle v2 continued. 6-month default review cadence for SOPs and policies |
| 0049_review_status_decision.sql | Review cycle v2 continued. A `needs_revision` decision surfaces in the content editor's queue as a query, not a stored boolean |
| 0050_sop_history_published_event.sql | Fixes `sop_history_event_type_check` to allow the `published` event type the Review cycle v2 publish path writes |
| 0051_procedure_categories.sql | Build addendum item 4. Procedure categories now share the policy taxonomy instead of a separate, drift-prone dropdown |
| 0052_permanent_delete_fk_fixes.sql | Build addendum item 1. Fixes every foreign key referencing `profiles(id)` so a permanent staff delete actually succeeds regardless of linked history |
| 0053_profiles_delete_admin_only.sql | Build addendum item 1 continued. Splits `profiles_write`'s shared USING clause so DELETE is Admin-only, separate from UPDATE |
| 0054_profile_job_roles.sql | Supports more than one job role per profile (an Educational Leader needing both the Educator and Room Leader suites) |
| 0055_sop_outcome_flags.sql | Build addendum, "My Outcomes". A staff member flags a procedure with a child-outcomes reflection, feeding the review cycle queue |
| 0056_organisation_timezone.sql | Step 43. `organisations.timezone`, fixes timestamps rendering in server (UTC) time instead of the organisation's own |
| 0057_signoff_priority.sql | Step 44, the signing clock. Per-procedure urgency; the clock starts from role assignment or first publish, whichever is later |
| 0058_rename_signing_window.sql | Renames "priority to sign" to `signing_window`, clearing a name collision with the unrelated `sops.priority` display-order field |
| 0059_signing_pause_and_notification_log.sql | Step 44 (pause/leave, modelled per person) and Step 45 (`notification_log`, Resend delivery tracking, hard-bounce suppression) |
| 0060_bulk_upload_staging.sql | Step 47. `bulk_upload_staging`: a file is parsed and flagged before anything commits to `sops`/`policies`, instead of writing real rows on upload |
| 0061_search_trigram.sql | Step 48. Trigram index so `ILIKE '%term%'` search on admin Procedures/Policies uses an index, not a sequential scan |
| 0062_comprehension_checks.sql | Step 46. Reshapes the long-parked `comprehension_questions` table (0007, never used) into the real one-row-per-question design |
| 0063_contracts_no_self_manage.sql | Raised while making Admin accounts visible as full staff members. Prevents an Admin managing their own contract |
| 0064_platform_notice.sql | Step 51. The Vericlever Platform Terms of Use and Privacy Notice, authored by the Operator, same document for every tenant |
| 0065_organisation_display_name.sql | Admin-editable organisation display name shown in the nav, separate from the canonical tenant name |
| 0066_bulk_delete_content.sql | Admin portal management page: bulk-delete every procedure or every policy in one action, for a full library replacement |
| 0067_parent_portal_access.sql | One shared access code per service, gating a public no-login page listing that service's parent-facing policies as downloads |
| 0068_parent_portal_access_fk_fix.sql | Ties `service_parent_access.service_id` to the same `organisation_id` as the row itself, closing a cross-tenant write gap in 0067 |
| 0069_bulk_sop_tags.sql | Gives the bulk SOP review screen the quality area / Child Safe Standard tagging every single-SOP edit already had |
| 0070_bulk_policy_tags.sql | Same gap as 0069, on the policy side |
| 0071_conversion_review_flag.sql | Step 56. `needs_review` boolean on `bulk_upload_staging` and `documents`, set automatically for every PDF and any docx/html the grouping-row heuristic couldn't confidently resolve |
| 0072_bulk_sop_needs_review.sql | Step 56. Carries `bulk_upload_staging.needs_review` through to the `documents` row `commit_bulk_sops` creates |
| 0073_bulk_policy_needs_review.sql | Step 56. Same change as 0072, on the policy side |

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

### 9 September 2026

`BUILD_LOG.md` itself added as the consolidated build record (this file). Step 28 NQS
quality area tagging and Step 29 Child Safe Standard tagging built together. Step 40
Admin self-onboarding and self-edit built, then a follow-up keeping Agreements and My
Details out of Admin's own top nav. Step 42 password show/hide toggle. Steps 30 to 38:
the Reports page and 8 downloadable PDF reports built in one pass. Step 39 contract
signature revision (independent countersignature slot, document hash) started and
finished the same day. The 5 standard job roles seeded automatically for every
organisation, so a new tenant's role picker is never empty (Zeke's feedback: Science
Kinder only had its one throwaway isolation fixture). Step 41: "SOP" renamed
"Procedure" across every user-facing surface. Practice observations renamed Procedure
Outcomes and moved into the Library nav group. Claude Code's local settings file
untracked from git.

### 10 September 2026

Reports found 500ing in production, fixed across three commits: `@react-pdf/renderer`
marked external, then pdfkit's standard font files and its glyph-names chunk both had
to be included in the deployed function - none of this surfaced locally, only once
actually deployed. **A real architectural correction**: every Server Action had been
doing its own tier check in TypeScript and then writing through the service-role
client, which bypasses RLS entirely - meaning nothing in the database was actually
enforcing the boundary the app relied on. Migration 0044 rewrites RLS to cover every
app write path, making it the real enforcement layer rather than a backstop nothing
exercised. A self-countersign gap closed the same way, found by extending
`rls-check.mjs` to exercise the manager-cosign path. **Review cycle v2** built across
four sections the same day: the ten deletions from the old design, the `sop_reviews`
review event schema (migrations 0039 to 0041 per the original commit message, though
the migrations as numbered on disk are 0046 to 0050 - see the migration register), the
review event itself, and the consolidated procedure page. A reverse-direction
cross-tenant probe added for `sop_reviews`. A final regression pass fixed a migration
number collision and one real bug.

### 11 September 2026

Build addendum item 4: procedure categories now share the policy taxonomy instead of a
separate dropdown that duplicated the job-role list and drove nothing. Build addendum
item 1: staff account name, email, active status and permanent delete, plus a
cross-tenant probe for the new profiles delete-admin-only policy. Fixed leaders landing
on the staff destination instead of `/admin` after login. Build addendum item 2: staff
home page. Build addendum item 1 continued: inactive staff greyed out and
section-split on the staff list.

### 12 September 2026

Home page chain icons fixed and worklist items made clickable. Policies nav tab
restored and the home page redesigned into four stage sections (Policy, Procedure,
Training, Outcomes - the model the public marketing copy also uses). Multiple job
roles per person supported (feeds "My Training" breakdown). Review cycle v2 branch
merged into `step-staff-account-management`. Build addendum "My Outcomes": a staff
member can flag a procedure with a child-outcomes reflection, feeding the review cycle
queue. Organisation timezone added (Step 43), fixing timestamps that had been
rendering in server (UTC) time rather than the organisation's own.

### 13 September 2026

Step 44, the signing clock: per-procedure signing priority and role-start-based due
dates. A staff-list compliance denominator bug and a silent password-reset link loss
bug both fixed. Signing priority renamed signing window, clearing a name collision with
the unrelated display-order `sops.priority` field before it reached anyone outside the
session. Step 44 continued: pause/leave state, modelled per person rather than per
assignment, and a due-soon state for the signing clock. Step 45: notification log,
Resend delivery tracking and hard-bounce suppression.

### 14 September 2026

A duplicate React key on the admin overview's integrity cards fixed. Step 47: bulk
upload review queue and duplicate detection, so a file is parsed and flagged before
anything commits to real `sops`/`policies` rows. Step 48: search on the admin
Procedures and Policies lists, backed by a trigram index. Step 54: the leader nav split
into My Portal, Our Staff and Our Workflow, replacing a single catch-all "Manage" menu
that gave a manager no way to tell the personal and administrative views apart when
they shared identical labels. Step 46: comprehension checks before signing a
procedure. My Details made a permanent entry in the My Portal dropdown regardless of
tier, admins included. The account-delete confirmation phrase simplified and made
case-insensitive. Admin accounts made visible as full staff members everywhere (they
have no job role but are still a staff member underneath). Contract self-management
locked to Admin only, closing a gap the above opened. Step 55: training status page.
Step 53: chain graphic on the admin overview, with a follow-up fixing its label
alignment and box overflow. Step 49: support contact pointed at a monitored address.
Wordmark's signal glyph replaced with the closed-ring mark. Step 51: Platform Terms of
Use and Privacy Notice acceptance gate, with a same-day fix for a raw ISO date
rendering on the notice page. A second "My Outcomes" entry point added on the
Procedures page. Admin-editable organisation display name added, shown to all staff in
the nav. The nav's access-tier label swapped for the organisation name, with the tier
badge moved to `/account`. Admin portal management page built: subscription
information, support contact, and a bulk-delete-library action for a full content
replacement.

### 15 September 2026

Step 12 reduced to mobile capture and mobile nav. The installable-app (PWA) half -
manifest, service worker, install prompt - removed in commit `3725832`. **Status is
DEFERRED, not cut.** The decision was to remove the install prompt and offline caching
for the trial, not to rule the capability out.

Reasons: service worker caching would serve stale shells during frequent trial deploys,
and an installed app on a personal device holds a session against a system containing
TFN and bank details.

A self-destructing service worker was shipped at the same path (`public/sw.js`) the old
one used, so a browser that already registered it clears its caches and unregisters on
its next update check rather than serving a cached shell indefinitely. That file stays in
place going forward, kill-switch content, even though the PWA itself is only deferred.
`/sw.js` was also added to the middleware's public-path allowlist - it was being caught
by the session gate and redirected to `/login` before a browser could ever fetch it,
which would have stopped the kill-switch reaching a logged-out browser.

Default Next.js favicon (the Vercel triangle) replaced with the concentric-ring mark:
`src/app/icon.png` (512x512) and `src/app/apple-icon.png` (180x180), Next's file-based
icon convention, no manifest needed for it.

Restore path: the original PWA work is in commit `8887337` and can be reverted.

Revisit after the trial, specifically if connectivity at Timboon or Mortlake turns out to
be a problem for staff reading procedures on the floor. If it is restored, the personal
device question must be answered in the staff terms first, not after.

The rest of 15 September: invite/reset link fallback URL fixed and standardised on the
`www` domain. FAQ page added and the landing/sign-in copy aligned to the design handoff
bundle (no em dashes, "cycle" not "chain", "clear" not "short", the consultancy section
removed entirely). Unread policies stopped counting as outstanding staff items, a
staff-list wrapping bug fixed. **Parent portal built**: a public, no-login page per
service listing its parent-facing policies as downloads, gated by one shared access
code (migrations 0067, 0068), fully server-mediated rather than built on browser-side
RLS. A Director can set their own memorable code instead of only a random one. A
Vercel build break from unescaped JSX quotes fixed. Portal background-arc opacity
matched to the design handoff exactly (0.13 to 0.14). Bulk SOP and bulk policy upload
both gained a step-1 "defaults for this batch" screen (job roles/category/site/review
period/signing window) and NQS quality area / Child Safe Standard tagging on the step-2
review screen (migrations 0069, 0070) - checked end to end by Claude, confirmed working
live by Zeke. A cookie `path` scoping bug then found and fixed the same day: parent
portal file downloads were 404ing because the access cookie was scoped to
`/parent/[serviceId]` while the download route lives at `/api/parent-documents/[id]`,
so the browser never sent it there.

### 16 September 2026

Parent-portal-review Child Safe Standard/NQS pickers changed from checkbox lists to a
chip-plus-dropdown `TagSelect` component (matching the existing "Job roles" / "Linked
policies" picker pattern), replacing `TagPicker` on both bulk review screens to cut
page length on a long bulk upload. Follow-up fix the same day: the Child Safe Standard
`<select>` was overflowing its column because an unconstrained `<select>` auto-sizes to
its longest option text - fixed with `w-full max-w-full` and stacking the two pickers
instead of a 2-column grid.

### 21 September 2026

**Step 56: Markdown conversion.** Flattened plain-text extraction (`unpdf`, no docx
parser) was losing all table and heading structure on every upload - a two-column
metadata table or an NQS/Child Safe Standard reference table lost its row pairing
entirely, regardless of tenant template. Docx (via `mammoth` + `turndown`, with a
custom always-convert table rule and shape-only grouping-row heading detection - never
matched against RSG's specific wording, verified against a different tenant's naming),
html and pdf (via `unpdf`'s existing text-item font/position metadata, no new
dependency) now all convert to Markdown on upload, rendered client-side with
`react-markdown`. A `needs_review` flag is set automatically for every PDF and any
docx/html the grouping-row heuristic could not confidently resolve, surfaced in the
bulk review queue without ever gating the upload itself. A real bug was caught and
fixed mid-build: an embedded screenshot inside a real policy was being inlined as a
roughly 58 KB base64 data URI directly into the stored body text; images now become a
short placeholder (using the source document's alt text where the author set one)
since the original file stays attached and downloadable for full fidelity.

Backfilled onto RSG's real content the same day: `scripts/reprocess-documents.ts`
re-extracted all 151 existing policies/procedures with a stored source file through the
new pipeline (150 changed, only the Aboriginal Cultural Safety Policy - already
reprocessed via an earlier live test - was unchanged), writing a local JSON backup of
every draft body it overwrote first. `scripts/bulk-republish.ts` then promoted the
refreshed draft into the published version for the 141 documents that were already
live (98 policies, 43 procedures), deliberately leaving the 9 never-published
procedures as drafts rather than publishing them for the first time as a side effect of
a text-format refresh. Confirmed live on `vericlever.site` after deploy.

**Procedure-to-policy linking.** `policy_sop_links` was already a many-to-many table,
but the only UI for it lived on the policy editor - a director working from a
procedure had no way to see or add the policies governing it. Added the mirror
`linkPolicy`/`unlinkPolicy` actions and a matching "Linked Policies" section on the
procedure editor. Verified live on the Science Kinder tenant in both directions, test
link removed after.

**Nav consistency.** Our Workflow's "Policies"/"Procedures" renamed "Our Policies"/"Our
Procedures" so they read as distinct from the personal "My Policies"/"My Procedures" in
My Portal even though several items share a destination path underneath. Parent portal
access moved to the end of that menu (day-to-day admin, not core content work). The
plain-staff flat nav (no admin-facing duplicate to disambiguate from, so previously left
unlabelled as just "Procedures"/"Policies") renamed to match for the same reason.
Extended to every "← Our X" / "← My X" back-link on the corresponding editor pages.

Also noted while investigating: running `npm run build` (production build) while the
dev server is also running corrupts the shared `.next` cache and produces flaky,
misleading UI symptoms (a button that looks permanently disabled, a stale hydration
mismatch) that have nothing to do with the code under test. Stop the dev server before
a production build from now on.

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
7. **`BUILD_PLAN.md` stops at Step 27** and was never extended to cover Steps 28
   onward, Review cycle v2, or any of the numbered "build addendum" items from
   9 September onward. This file is now the only record of that work; treat
   `BUILD_PLAN.md` as historical for anything past Step 27.

## Outstanding and blocked

- **Sending domain - reconfirm with a live send.** `RESEND_FROM`,
  `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET` and `PARENT_ACCESS_SECRET` are all set, and
  the app is deployed and reachable at `vericlever.site`. Nobody has re-run an actual
  email send-test since those were set, so treat SOP reminders, credential/contract
  escalation, the Reg 172 parent digest and the admin-triggered password reset email
  as very likely working but not proven in this log.
- **Supabase dev revisions.** Still pending as of this reconciliation - no list has
  arrived since the 8 September review, see the top of this file.
- **Independent verification.** The great majority of work from 9 September onward
  (Steps 28 to 55, Review cycle v2, every "build addendum" item) carries no Zeke
  sign-off in this log at all, not just an unverified note - see the "Verified by
  Zeke" column. Given the volume, a full re-walkthrough rather than a step-by-step
  recheck is probably the practical way to close this out.
- **Mobile and tablet polish pass** across every screen (Step 12 follow-up). Partially
  addressed for Markdown-rendered body content (Step 56 tables scroll horizontally
  within their own bounds rather than breaking page layout), not reviewed elsewhere.
- **Test data cleanup.** The throwaway Resend test account, the demo records left on
  Sam Rivers and others during verification, and two local JSON backup files
  (`reprocess-backup-*.json`) sitting untracked in the repo root from the Step 56
  content backfill - keep until the reprocessed content has been spot-checked, then
  delete.
- **Orphaned document rows.** Found during the Step 56 backfill: roughly 45 rows in
  `documents` with `owner_type = 'sop'` point at SOP ids that no longer exist (leftover
  from earlier bulk-upload test cleanups that deleted the SOP but not its attached
  document/storage object). Harmless - nothing queries through them - but worth a
  cleanup pass at some point.

## Companion documents

- `BUILD_PLAN.md`: scope, deliverables and "done when" criteria per step
- `ROLE_ACCESS_MATRIX.md`: feature-by-role breakdown
- `STAFF_ONBOARDING_NQAITS.md`: NQAITS field structure and verified dropdown lists
- `CONTRACT_MANAGEMENT.md`: contract storage and renewal detail
- `REVISION_SOP_REVIEW_CYCLE.md`: the spec behind Steps 19 to 27, its Steps 20-22
  since superseded (see `REVISION_REVIEW_CYCLE_V2.md`)
- `REVISION_REVIEW_CYCLE_V2.md`: supersedes Steps 20-22, the spec behind migrations
  0046-0050, 10 September 2026
- `SECURITY_REVIEW_2026-09.md`: the September RLS review, method and findings
- `supabase/import/rsg/REVIEW_NOTES.md`: decisions made during the RSG import
