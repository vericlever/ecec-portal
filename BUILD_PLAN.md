# Build plan: Steps 1 to 5 (1 November target)

This document sequences the first five steps of the ten-step build for Claude Code to work through. It assumes `0001_init_schema.sql` and `CLAUDE.md` are already in the repo and reflect the confirmed architecture (multi-tenant from migration 1, two-tier policy/SOP model, generic credential tracking, notification infrastructure scaffolded).

Each step lists its deliverables, what "done" looks like, and what it deliberately excludes. Do not build ahead into a later step's scope, and do not build any of the explicitly deferred items listed at the bottom.

## Step 1: Schema completion and migration

**Deliverables**
- Complete the RLS policy pattern across every table in `0001_init_schema.sql`, not just the three sketched so far
- Confirm `organisation_id` and `site_id` scoping is present and enforced on every tenant-scoped table
- Apply the migration to a real Supabase project (Sydney region)
- Verify isolation: a query scoped to one organisation cannot return rows from another

**Done when**
- Migration runs cleanly against a fresh Supabase instance
- RLS policies exist on every table that holds tenant data, including `credentials`, `staff_import_records` and `notification_rules`
- A manual test confirms Science Kinder cannot see RSG data and vice versa

**Excludes**
- Any UI
- Any auth flow beyond what RLS needs to function

## Step 2: Seed data

**Deliverables**
- Seed script populating Ready Set Go from the real Policy to SOP Architecture spreadsheet (organisation, sites Timboon and Mortlake, policies, SOPs, policy-SOP links)
- Seed script creating Science Kinder as an empty organisation, no content, used purely to prove isolation

**Done when**
- Running the seed script twice is idempotent (does not duplicate rows)
- RSG's seeded SOPs and policies match the spreadsheet structure
- Science Kinder exists with zero policies or SOPs

**Excludes**
- Credential types beyond the WWCC and Gecko Training placeholders already in schema
- Any staff records (that is Step 5, via CSV import)

## Step 3: Single working SOP page

**Deliverables**
- One SOP page rendering real content from the seeded RSG data
- Read-and-sign functionality working end to end (a sign-off record is written on submission)
- No authentication yet, hardcoded to a single test user against the RSG tenant

**Done when**
- A person can open the page, read the SOP, sign it, and see a `sign_offs` row created with the correct SOP, organisation and timestamp
- Refreshing the page reflects the already-signed state

**Excludes**
- Text-to-speech readout (later feature, not blocking for November)
- Comprehension check questions
- Click-through links back to source policies
- Any auth

## Step 4: Auth and admin account creation

**Deliverables**
- Supabase Auth wired in
- RLS policies updated to key off the authenticated user's organisation, not a hardcoded value
- Admin portal flow: an organisation admin can create staff accounts within their own organisation only

**Done when**
- A real login replaces the Step 3 hardcoded user
- An RSG admin can create a new staff account scoped to RSG
- That admin cannot create or see accounts under Science Kinder
- The Step 3 SOP page still works, now against a real authenticated session

**Excludes**
- Password reset flows, invite emails via Resend (nice to have, not a Step 4 blocker unless trivial to include)
- Any role beyond admin and staff if finer-grained roles are not yet decided

## Step 5: CSV bulk staff import

**Deliverables**
- CSV import accepting name, email, role, site and start date as the baseline field set
- Import writes to `staff_import_records` with source validation before creating live staff accounts
- Import is organisation-scoped, an admin can only import into their own organisation

**Done when**
- A CSV matching the baseline fields imports correctly and produces staff accounts an admin can see and manage
- Malformed rows (missing email, unknown site) are rejected with a clear error rather than silently dropped or crashing the import
- The field set is documented in the repo so it can be extended once the NQAITS reference export is available

**Excludes**
- Any live NQAITS mapping or import (schema-ready only)
- Any accounting system sync (Xero, MYOB)

## Explicitly deferred beyond Step 5, do not build ahead of schedule

- Reminder engine (Step 6)
- Policy library and policy-SOP linking UI, version cascade logic (Step 7)
- Reg 172 parent notification trigger (Step 8)
- Credential tracking UI, director expiry view (Step 9)
- Webhook receiver for external course completion (Step 10)
- Live MYOB or Xero sync
- Live NQAITS import or export
- Live Gecko Training integration
- Live WWCC verification against any external register, placeholder field only, do not imply this is live anywhere in the UI copy
- SRF public registration and payment flow

## Notes for Claude Code

- Australian English spelling throughout any user-facing copy or generated documentation (organise not organize, centre not center)
- No em dashes in generated documentation or commit messages where prose is used
- Confirm each step against its "done when" criteria before moving to the next, do not run steps in parallel unless a dependency genuinely allows it
