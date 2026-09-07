# RLS security review, September 2026

Run alongside Step 22 (the first new storage surface since Step 16). Covers every
table's row-level security after the HR expansion (Steps 16 to 18), policy
categories, the review cycle (Step 20), practice observations (Step 21) and the
reminder / password-reset / notification-log tables.

Reproduce with `node scripts/rls-check.mjs` (read-only; every probe runs in a
transaction that is rolled back).

## Method

The script assumes the `authenticated` Postgres role with a given user's JWT
`sub`, then:

1. counts visible rows in all 38 `public` tables and flags any row whose
   `organisation_id` is outside that user's own organisation;
2. runs five write probes that should each be rejected or be a no-op.

Identities tested: RSG admin, RSG manager (Timboon), RSG staff (Sam, Timboon),
Science Kinder admin, Science Kinder staff, and `anon` (no JWT).

## Result

**Cross-tenant isolation: clean.** No identity sees a single row outside its own
organisation in any table. `anon` sees nothing, including the shared lookup
tables `credential_types` and `external_providers` (both require a session).

**Write probes: all safe.**

| Probe | Outcome |
| --- | --- |
| Staff sets own `access_tier` to `admin` | no-op (row filtered by `profiles_write` USING) |
| Manager inserts a sign-off as a staff member | rejected (`sign_offs_insert` WITH CHECK) |
| Manager updates profiles in another organisation | no-op |
| Staff inserts a `job_roles` row | rejected (`job_roles_write`) |
| Non-HR manager updates `worker_payroll` | no-op (`can_manage_hr` false) |

## Helper functions

`current_org` / `current_service` / `current_tier`, `can_verify`, `worker_service`
and `policy_visible` are all `SECURITY DEFINER STABLE` with `SET search_path TO ''`.
`in_org` / `is_admin` / `is_manager` / `can_edit_content` / `covers_service` /
`can_manage_worker` / `can_manage_hr` are plain SQL that compose those. Every
org check is a strict `target_org = current_org()` with a null guard; every
service check requires a non-null service equal to `current_service()`. An admin
is scoped to their own organisation (`is_admin` calls `in_org`), so a "full
access" admin is still tenant-bound.

## Fixes applied (migration 0038)

1. **`documents_select`** was `in_org(organisation_id)` for every `owner_type`,
   so any staff member could read the extracted text, file name and storage path
   of colleagues' contracts and identity documents through the `documents` table
   (the file bytes were already protected by the download route and the private
   bucket, but the row metadata was not). Now: `policy` and `sop` documents stay
   organisation-wide; `contract` and `identity` documents match the visibility
   of the owning record; `credential` and `sop_evidence` documents are
   manager-only. Verified: a staff member and a manager at another service can
   no longer see a foreign contract document row.

2. **`sign_offs_insert`** WITH CHECK allowed `covers_service`, letting a manager
   create a sign-off row *as* a staff member - forging the core compliance
   record. The app only ever inserts a person's own sign-off; the manager
   countersignature is a separate UPDATE (unchanged). Restricted to
   `user_id = auth.uid()`.

3. **`policy_views_insert`** had the same `covers_service` branch, letting a
   manager forge a "policy viewed" record. Restricted to `user_id = auth.uid()`.
   UPDATE and DELETE keep `covers_service` so a manager can still correct one.

4. **`credentials`** (schema-ready, no rows, no UI) had `is_manager` for read and
   write with no per-person or per-service scope. Brought in line with the
   `worker_*` tables so it is already scoped if switched on.

5. **`notification_rules`** (schema-ready, no UI) had `is_manager` for ALL.
   Writing rules is now admin-only; reading stays open to managers.

## Storage

The `documents` bucket is `public = false` with **zero** `storage.objects`
policies, so `authenticated` and `anon` have no direct access at all. Every
download goes through `GET /api/documents/[id]`, which re-checks the caller
against the owning record and then hands back a short-lived service-role signed
URL. Step 22's evidence files reuse this same store (`owner_type = 'sop_evidence'`)
rather than adding a second bucket - one hardened surface instead of two.

## Accepted as designed

- `sops_select` / `policies_select` (published branch) let any organisation
  member read SOP and policy content. This is intended - they are the material
  staff train on. Tenant isolation still holds.
- `sop_history` (content editors) and `sop_observations` (any manager) are
  organisation-wide, not service-scoped. Both are management-improvement tools
  where org-wide visibility is the point.
- A manager sees the worker verification documents (WWCC, quals, training,
  identity) of staff at their own service - required for the sighting workflow.
- `hr_agreements`, `job_roles`, `policy_categories`, `services` and similar
  configuration tables are readable organisation-wide. They hold no personal or
  cross-tenant data.
