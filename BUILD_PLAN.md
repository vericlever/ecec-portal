# Build plan v2

Supersedes the original Steps 1 to 5 plan. This reflects the expanded scope confirmed on 31 August: four fixed access tiers, in-app staff management with NQAITS-aligned onboarding, policy upload, job-role-based SOP suites, reminders, staff reporting, staff self-service credential tracking, contract storage and renewal, a compliance heatmap dashboard, browser-native SOP read-aloud, and click-through from SOPs to their source policies, folded into the near-term build rather than deferred. Two-month build window, not a 1 November minimum only.

Three companion documents hold detail this file only summarises: `ROLE_ACCESS_MATRIX.md` (full feature-by-role breakdown), `STAFF_ONBOARDING_NQAITS.md` (full NQAITS field structure and verified dropdown lists), and `CONTRACT_MANAGEMENT.md` (full contract storage and renewal detail).

Status markers reflect where things actually stood as of 31 August, based on manual verification, not just Claude Code's own "done" claims.

## Access tiers (confirmed)

Four fixed roles, a single role enum, not a separate permissions table:

- **Staff** — the base tier. Named for access level, not job function, since a cook, an educator and a finance person all sit here. Sector-agnostic naming, deliberate given longer-term UK and US ambitions.
- **Manager (staff)** — staff functions plus assign SOPs for review, view staff sign-offs and reports at their site(s), send reminders, manage staff access at their site(s).
- **Manager (staff, policy and procedures)** — everything Manager (staff) has, plus add and edit policies, and create policy-SOP links.
- **Admin** — full access across all organisations, sites and staff. Assigns role tier to managers.

See `ROLE_ACCESS_MATRIX.md` for the full feature-by-role breakdown.

**These four tiers are access levels, not job roles.** A separate concept, job role (e.g. Educator, Room Leader, Ed Leader), determines which suite of SOPs a staff member is required to complete, and is independent of access tier. An Educator and a Manager (staff) could both be assigned the Educator job role's SOP suite, for example. See Step 7 for how this is built.

**Comprehension questions are parked, not built.** Leave a nullable `comprehension_questions` relation on the SOP table structure now, unused, so this can be added later without a schema rework.

## Step 1: Schema and migration
**Status: done, isolation not yet verified**

- RLS policy pattern completed across every table in `0001_init_schema.sql`
- Migration applied to the Sydney (ap-southeast-2) Supabase project

**Outstanding before anything further is built on top of this:**
- Cross-tenant isolation has not actually been tested. Create one dummy staff login under Science Kinder, confirm it sees zero content, and confirm RSG sees none of it in return. Do this before Step 4's role work lands, since it gets harder to isolate a gap the more is built around it.

## Step 2: Seed data
**Status: done**

- RSG populated from the Policy to SOP Architecture spreadsheet
- Science Kinder created empty, used for isolation testing

## Step 3: Single working SOP page
**Status: done**

- SOP read-and-sign working end to end, `sign_offs` row created on submission
- Currently against a real login, not the original hardcoded test user

## Step 4: Auth and four-tier role model
**Status: unknown, not yet verifiable**

- Supabase Auth wired in, login working
- Admin account creation proven possible
- **Cannot yet be assessed either way:** there is no admin view yet to test role differentiation against, so whether the current build correctly separates the four tiers is unknown, not confirmed broken and not confirmed working. Building the admin view itself is part of this step's remaining work, not a separate thing.

**Deliverables**
- Role enum updated to the four tiers above
- RLS keyed off the authenticated user's organisation and role, not a hardcoded value
- Staff tier: sees own sign-offs, own progress, view-only policies
- Manager (staff): can assign SOPs, view staff sign-offs and reports at their site(s), manage staff access at their site(s)
- Manager (staff, policy and procedures): Manager (staff) access plus policy add/edit and policy-SOP linking
- Admin: full cross-organisation access, assigns manager sub-tier

**Done when**
- Each of the four tiers, tested with real logins, sees exactly what the matrix specifies and nothing more
- An Admin can assign a staff member to any of the four tiers
- Cross-tenant isolation (Step 1's outstanding item) is confirmed alongside this, since role and organisation scoping are being touched at the same time

## Step 5: Staff management tools, in-app, NQAITS-aligned onboarding
**Status: not started**

This must be actionable from inside the app by an admin, not a script run beforehand. Two paths, both needed:

- **Bulk upload**: Excel or JSON, matching NQAITS's own Worker Register bulk upload format, for new people only, per NQAITS's own guidance. Writes to `staff_import_records` with validation before creating live accounts.
- **Individual add / onboarding questionnaire**: a structured multi-step form inside the app for adding one staff member at a time, working through the same field set below.

Both organisation-scoped, an admin can only add or import into their own organisation. Full field detail, verified dropdown lists, and rationale are in `STAFF_ONBOARDING_NQAITS.md`, summarised here.

**Field structure, sourced directly from the NQAITS Worker Register template**

Personal and contact details, home address, postal address (defaults to same as home), position details, WWCC details, teacher registration (Early Childhood Teacher only), qualifications, and training records across six categories (First Aid, Anaphylaxis, Asthma, Child Safety, Child Protection, Other). The six training categories share one underlying table with a training-type column, not six near-duplicate tables.

**Three separate role concepts, must not be conflated in the schema:**
1. Access tier (Staff, Manager staff, Manager policy, Admin) — Portal permissions
2. Job role (Educator, Room Leader, Cook) — determines SOP suite, see Step 7
3. NQAITS Position (Educator, Early Childhood Teacher, Volunteer, Student, Non-Educator Staff, Co-ordinator, Assistant, Contractor) — the regulatory category NQAITS itself tracks

**Verified dropdown enums** (built as fixed enums against the full NQAITS validation lists, not narrowed to whatever RSG's current staff happen to use):
- Title: Br, Dr, Fr, Master, Miss, Mr, Mrs, Ms, Sr, Mx
- Position: Educator, Volunteer, Student, Non-Educator Staff, Early Childhood Teacher, Co-ordinator, Assistant, Contractor
- Non-Educator Role (only if Position is Non-Educator Staff): Bus Driver, Centre Director, Cook, Cleaner, Gardener, Other
- State/Territory (all address and check fields): ACT, NSW, NT, QLD, SA, TAS, VIC, WA
- Qualification Type: Certificate III, Certificate IV, Diploma, ECT, Degree, Masters
- "Sighted By" (all credential fields): Provider, Nominated Supervisor
- Yes/No fields (probation, exemption, working towards qualification, etc.)

**Nature of Employment / Engagement / Appointment: confirmed as Direct / Indirect.** RSG's existing real data currently reads "Employee" in this column, which doesn't match either option, that's stale or incorrectly entered data in the source spreadsheet, not a sign the dropdown itself is wrong. When RSG's existing staff records are migrated into the Portal, this field should be corrected to Direct or Indirect at that point, not carried across as "Employee." Confirm which one applies per staff member during migration rather than guessing or defaulting.

**Verification workflow, Date Sighted and Sighted By**

These fields are never answered by the new staff member. Submitting a WWCC, Teacher Registration, Qualification, or Training record leaves Date Sighted and Sighted By open and creates a flagged, unverified item visible to every manager at that staff member's site, not assigned to one specific person. Any manager at the site can pick it up, physically sight the document, and complete the verification (Date Sighted defaults to today, Sighted By is selected from Provider or Nominated Supervisor). This feeds into the same outstanding-items reporting surface as Step 8 and the same reminder mechanism as Step 7.

With Date Sighted and Sighted By removed from the staff-side form, a typical new Educator (not an ECT, one WWCC, a couple of completed trainings) answers roughly 25 to 30 questions, not the full field count.

**Done when**
- An admin, logged into the app, can add a single staff member through the onboarding questionnaire and see them appear as a live account with the correct NQAITS-aligned fields populated
- An admin can upload a bulk file (Excel or JSON) matching the NQAITS field structure and see the resulting accounts, with the correct access tier, job role, and NQAITS Position assigned to each
- Malformed rows (missing email, unknown site, invalid enum value) are rejected with a clear error, not dropped silently
- Submitting a credential or training record creates a flagged, unverified item visible to all managers at that site, and any manager can complete the verification

## Step 6: Policy management
**Status: not started**

- Add, edit, and **upload** policies (Admin, Manager staff+policy). Upload is the primary path, most policies will be existing documents brought in, not drafted from scratch in the app.
- On upload, the policy's name is taken from the file name with the extension stripped (e.g. `Sun Protection Policy.docx` becomes "Sun Protection Policy"), not manually typed, though it should remain editable afterwards
- Approval workflow before publish
- Policy-SOP linking, many-to-many

**Done when**
- A policy document can be uploaded, its name auto-populated from the file name, and the name is editable afterwards if needed
- A policy can also be drafted and edited directly in-app as an alternative to upload
- Admin or Manager (staff, policy and procedures) can publish a policy directly, no separate second-person sign-off required, consistent with the simplified approval model in Step 9
- Policies can be linked to one or more SOPs and vice versa

## Step 7: Job roles and SOP suites, plus reminders
**Status: not started**

The priority here is job-role-based SOP suites, not one-off individual assignment. Individual manager-to-staff SOP assignment is de-scoped from this step, it's a minor addition that can come later if actually needed.

- Job roles are configurable per organisation (e.g. Educator, Room Leader, Ed Leader, Cook). These are distinct from the four access tiers, a Staff-tier user and a Manager-tier user could both hold the Educator job role.
- Each job role has a defined suite of SOPs attached (e.g. Educator maps to 25 SOPs)
- Assigning a staff member a job role automatically assigns them that role's full SOP suite, this is the main mechanism for staff receiving their required sign-offs, not manual individual assignment
- Managers and Admin can send reminder emails, individual or bulk, for outstanding sign-offs, via Resend

**Done when**
- An admin can create a job role and attach a suite of SOPs to it
- Assigning that job role to a staff member populates their to-do list with the full suite, correctly, with nothing missing and nothing extra
- A reminder email sends correctly to a staff member with an outstanding sign-off

## Step 8: Staff reporting
**Status: done (2026-09-02, on main)**

- Per-staff report: SOPs completed and policies viewed, shown as a percentage and as a table of outstanding items
- Manager tiers see this scoped to their site(s), Admin sees it across all staff and sites

**Done when**
- Clicking into a staff member from a manager or admin view shows accurate completion percentages and an outstanding items table, matching what's actually in `sign_offs`

## Step 9: Reg 172 parent notification trigger
**Status: not started**

Roles are clearer now, this simplifies the sign-off requirement from earlier: Admin and Manager (staff, policy and procedures) do not require a separate dual sign-off to publish and send, since both tiers already carry that authority directly. This replaces the earlier "Centre Director and Approved Provider/Admin" dual gate.

- Policy tier only, fires on approved and published versions
- **Anti-spam gating**: parent notifications are not sent individually per policy publish, since a week with several document updates would otherwise generate dozens of separate emails to parents. Instead, batch changes into a periodic digest, weekly by default, sent only if at least one policy change occurred in that period. No digest goes out in a week with no changes.

**Done when**
- Publishing a policy as Admin or Manager (policy) does not require a second person's sign-off
- Publishing multiple policies within the same week results in one combined parent email, not one per policy
- A week with no policy changes sends no parent email at all

## Step 10: Credential tracking, director view and staff self-service
**Status: done (2026-09-02). Self-service re-verification (migration 0017), staff self-service via /onboarding "Your details", director expiring-credentials view at /admin/credentials, and a manager/admin overview dashboard at /admin that is now their landing page. Email escalation deferred with the rest of the reminder engine until the VeriClever domain clears.**

- Director view of what's expiring across staff at their site(s)
- **Staff self-service**: staff can update their own WWCC details and see their own training record, not just have it managed entirely by an admin or manager. Staff-tier access here is limited to their own record, viewing and updating their own WWCC and training, not anyone else's.
- Any WWCC or training record a staff member submits or updates here goes through the same site-wide manager verification queue defined in Step 5 (Date Sighted, Sighted By), it's the same underlying mechanism, not a separate one for self-service updates.

**WWCC and teacher registration re-verification (done, migration 0017).** These two are standalone checks (a police check, a teacher registration body check), not tied to an RTO, so their details are never corrected in place once sighted. A staff member can edit a check while it is still unsighted. Once a leader has sighted it the row is locked as permanent history: the `protect_sighted_fields()` trigger blocks any non-verifier change to a sighted `wwcc_checks` / `teacher_registrations` row, and the onboarding form records a renewed or reissued check as a new unsighted row that re-enters `/admin/verification`. The staff record page shows the older sighted check as "superseded, kept for the record". Qualifications and training records keep the earlier behaviour (a self-edit silently leaves the sighting untouched) until the rest of this step is built.

**Done when**
- A director-level view shows expiring credentials across their site(s)
- A staff member, logged in at Staff tier, can update their own WWCC number and expiry, and view their own training completion record
- A self-service update creates the same flagged verification item as an onboarding submission, visible to all managers at that site

## Step 11: Contract storage and renewal
**Status: not started**

Full detail in `CONTRACT_MANAGEMENT.md`, summarised here.

- **Storage**: the executed contract document is stored against the staff member's record at onboarding. One record per contract period, not a single mutable "current contract" field, so renewals build a history rather than overwrite it.
- **Period model**: each contract is either a fixed period (start date plus manually entered duration, no default assumed, expiry calculated from those) or set to no fixed period (a toggle, no expiry, no renewal logic ever fires for that contract).
- **Access**: Admin, both manager tiers, and the staff member themselves (their own only) can view. Only Admin and Manager (staff, policy and procedures) can upload or replace a contract, Manager (staff) is view-only here, consistent with that tier's access elsewhere.
- **Renewal escalation, fixed-period contracts only**: alerts at 4, 3, 2, and 1 week before the calculated expiry, then shown as expired past that date. Admin and Manager (staff, policy and procedures) get the full alert, email, in-portal pop-up, and to-do item. Manager (staff) sees a to-do item only, no email, no pop-up. This reuses the same reminder mechanism as Step 7 and the same outstanding-items surface as Step 8.

**Done when**
- A contract document can be uploaded at onboarding and appears against that staff member's record
- Admin, both manager tiers, and the staff member themselves can view it, no one else can
- Only Admin or Manager (staff, policy and procedures) can upload or replace a contract
- Alerts fire correctly at 4, 3, 2, and 1 week before a fixed-period contract's calculated expiry, by email and pop-up for Admin and Manager (policy), as a to-do item only for Manager (staff)
- A contract set to no fixed period never triggers a renewal flag or expiry alert, at any tier
- Uploading a new executed contract closes the flag, starts a new period, and the prior contract remains visible as history

## Step 12: Webhook receiver
**Status: not started**

- External course completion endpoint, writing into `credentials` without touching core schema

## Step 13: Compliance heatmap
**Status: not started, confirmed in scope for v1.0**

Depends on Steps 8, 10 and 11 already existing, since it aggregates data from all three, staff sign-off completion, credential status, and contract renewal status, into one dashboard view.

- **Layout**: sites as rows, compliance categories as columns (SOP sign-off completion, credential status, contract status), each cell colour-coded red/amber/green. Admin sees every site across every organisation they manage, Manager tiers see only their own site(s).
- **Drill-down**: clicking a cell opens the relevant outstanding-items view from Step 8 or Step 10, this is a summary layer sitting on top of existing reporting, not a separate data source.

**Colour thresholds (assumption, confirm before building, these weren't specified and are a reasonable starting point, not a fixed requirement):**
- **SOP sign-off completion**: green at 90% or above, amber 70 to 89%, red below 70%
- **Credentials**: green if nothing expires within 30 days, amber if something expires within 30 days, red if something has expired or expires within 7 days
- **Contracts**: green if no renewal flag active, amber if a renewal flag is active but not yet expired, red if a fixed-period contract has passed its expiry unrenewed

**Done when**
- A site's row shows accurate red/amber/green status across all three categories, matching the underlying data in Steps 8, 10 and 11
- Admin sees all sites they have access to, Manager tiers see only their own site(s)
- Clicking a cell navigates to the relevant detailed outstanding-items view, not just a static colour with no way to act on it

## Step 14: SOP read-aloud
**Status: not started, confirmed in scope for v1.0**

Browser-native, using the Web Speech API (`SpeechSynthesis`), not a cloud TTS service. Free, client-side, no backend or storage needed. This augments the SOP page already built in Step 3, it's an addition to that page, not a separate feature elsewhere.

- A single play/pause button on the SOP page, no progress bar, no sentence highlighting, no section jumping, using the device's available voice
- Reads the whole SOP start to finish, tap to pause partway through, tap again to resume from where it left off
- No audio files generated or stored, this happens live in the browser each time
- Acceptable that voice quality varies by device and browser, that tradeoff was made deliberately in favour of near-zero build cost. Revisit with a cloud TTS service later if usage shows it's genuinely valued, that would be a contained addition, not a rebuild.

**Done when**
- A staff member can tap play to hear the whole SOP read aloud using the browser's built-in voice, and tap pause to stop partway through, resuming from the same point on the next tap
- Works on both desktop and mobile browsers, since educators will mostly be using this on the floor via phone

## Step 15: Click-through from SOP to source policy
**Status: not started, confirmed important**

Depends on Step 6's policy-SOP linking already existing, since this surfaces those links on the staff-facing side, not just the admin/manager linking interface.

- On the SOP page (the same page built in Step 3, extended here), any policy linked to that SOP appears as a visible, clickable reference
- Clicking it opens the linked policy, view-only, consistent with the Staff tier's existing view-only policy access
- If an SOP has more than one linked policy, all of them show, not just the first

**Done when**
- A staff member viewing an SOP can see and click through to every policy linked to it
- The linked policy opens in view-only mode, regardless of which access tier the staff member holds
- An SOP with no linked policy simply shows no link, rather than an error or empty state that looks broken

## Explicitly deferred, do not build ahead of schedule

- Comprehension check questions (parked, schema-ready placeholder only)
- Live MYOB or Xero sync
- Live NQAITS import or export
- Live Gecko Training integration
- Live WWCC verification against any external register, placeholder field only, do not imply this is live anywhere in UI copy
- SRF public registration and payment flow

## Notes for Claude Code

- Australian English spelling throughout any user-facing copy or generated documentation
- No em dashes in generated documentation or commit messages where prose is used
- Confirm each step's "done when" criteria against real, manually verified logins and data, not assumed from a prior step's claimed completion
- The cross-tenant isolation test under Step 1 is a prerequisite for Step 4, not a nice-to-have, do not skip it
- Read `STAFF_ONBOARDING_NQAITS.md` in full before building Step 5, it has the complete field list and verified dropdown values, this file only summarises them
- Read `CONTRACT_MANAGEMENT.md` in full before building Step 11, same reason
