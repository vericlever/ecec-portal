# Build plan v2

Supersedes the original Steps 1 to 5 plan. Expanded scope confirmed 31 August: four fixed access tiers, in-app NQAITS-aligned staff onboarding, policy upload, job-role SOP suites, reminders, staff reporting, credential tracking, contract storage and renewal, a compliance heatmap, browser-native SOP read-aloud, and SOP-to-policy click-through. A further HR record expansion (Steps 16 to 18) and policy categories were added in early September after reviewing RSG's live onboarding survey.

Three companion documents hold detail this file only summarises: `ROLE_ACCESS_MATRIX.md` (feature-by-role breakdown), `STAFF_ONBOARDING_NQAITS.md` (NQAITS field structure and verified dropdown lists), and `CONTRACT_MANAGEMENT.md` (contract storage and renewal detail).

Status lines are kept current and reflect manual verification against real logins, not Claude Code's own "done" claims.

## Where things stand (3 September 2026)

- **Built, verified, merged to `main`:** Steps 1 to 8, 10, 11, 16, 17.
- **Built and verified, on a branch waiting to merge:** Step 18 and Policy categories, both on `step-18-payroll-screening`.
- **Parked, blocked on the sending domain:** Step 9, and the email half of Steps 7 and 11. See "Email and notifications" below.
- **Cut:** the Step 12 webhook receiver. External course completions are entered by hand through the training records screen. The effort moves to mobile capture, the new Step 12.
- **Not started:** Steps 12 (mobile capture), 13, 14, 15.

Two gaps outside the numbered steps block RSG actually using the portal:

- **RSG's real SOPs and policies are not loaded.** They were cleared on 2 September for a clean upload trial and never restored. Re-run `supabase/import/rsg/rsg_import.sql` (70 policies, 129 SOPs) plus seeds `0004` and `0005`, or upload the current versions through the admin screens.
- **Nothing is deployed.** It runs on localhost against the live Supabase database, and `main` has not been pushed to `github.com/vericlever/ecec-portal`. For staff to use it, it needs to be on Vercel with a real address.

## Email and notifications, blocked on the VeriClever domain

Every outbound-email feature is stubbed until the VeriClever domain, ABN and Resend domain verification are in place. The test sender `onboarding@resend.dev` only delivers to the Resend account owner. Blocked: staff invite emails (Step 5), SOP reminder emails (Step 7), Reg 172 parent notifications (Step 9), contract renewal alert emails (Step 11). The in-portal side of each, the flags, outstanding-items counts and to-do surfaces, is built and working. Only the send is waiting.

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
**Status: done. Cross-tenant isolation verified against the Science Kinder / RSG pair, all directions.**

- RLS policy pattern across every table, migrations now `0001` to `0031`, all applied to the Sydney (ap-southeast-2) Supabase project
- Isolation proven with real Science Kinder logins: SK sees zero RSG content, RSG sees zero SK content, sign-off and view data is per-user

## Step 2: Seed data
**Status: done. RSG's imported inventory was later cleared for an upload trial and not restored, see "Where things stand".**

- RSG populated from the Policy to SOP Architecture spreadsheet via a generic importer (`supabase/import/rsg/`), any org admin can run the same path
- Science Kinder created empty, used for isolation testing

## Step 3: Single working SOP page
**Status: done**

- SOP read-and-sign working end to end, `sign_offs` row created on submission, against a real login

## Step 4: Auth and four-tier role model
**Status: done, verified against real logins for all four tiers.**

- Email/password auth via `@supabase/ssr`, RLS keyed off the authenticated user's organisation and tier
- All queries go through the auth'd client, no service-role bypass in read paths
- A later correction (migration `0014`): a manager's reach is now their own non-null service only, so a manager cannot open an admin's record

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
**Status: done, except staff invite emails (blocked on the domain, an on-screen invite link is the fallback). In-app onboarding questionnaire, CSV bulk import with validation, a bulk export in the exact NQAITS Worker Register format, and first-login invite links are all built. The HR record expansion in Steps 16 to 18 extends the onboarding field set.**

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
**Status: done, merged. Extended by "Policy categories" (3 September), which replaces the standalone parent-facing checkbox.**

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
**Status: done, merged, except the reminder emails (blocked on the domain). Job roles are configurable per organisation, SOP suites attach to roles, SOP authoring and bulk upload are built, and the sign-off model is self or self-and-manager (`0023`). The SOP-incomplete reminder email is the only outstanding piece.**

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
**Status: done, merged (2026-09-02). Team compliance roll-up on the staff list and the dashboard, an outstanding-items breakdown on each staff record.**

- Per-staff report: SOPs completed and policies viewed, shown as a percentage and as a table of outstanding items
- Manager tiers see this scoped to their site(s), Admin sees it across all staff and sites

**Done when**
- Clicking into a staff member from a manager or admin view shows accurate completion percentages and an outstanding items table, matching what's actually in `sign_offs`

## Step 9: Reg 172 parent notification trigger
**Status: parked, blocked on the sending domain (see "Email and notifications"). The dual-sign-off simplification below is already true from the Step 6 and 7 work. "Parent-facing" is now the "Parent policies" category from the Policy categories work, so the trigger keys on that.**

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
**Status: done (2026-09-02), except the email and pop-up parts of the renewal escalation, which are deferred with the rest of the reminder engine until the VeriClever domain clears. In-portal renewal flags, the outstanding-items surface, the /admin/contracts list, and the expired state are all built.**

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

## Step 12: Mobile capture and installable app
**Status: done, on branch `step-12-mobile`. Camera capture on the Photo ID, visa and contract uploads. A hamburger nav on phones (the inline nav was six items wide and overflowed). Header action buttons wrap instead of overlapping the heading. A web app manifest, an SVG icon set, and a small service worker (network-first pages, cached build assets, an offline fallback page), registered in production only. Native app stays out of scope. A wider mobile polish pass across every screen and a tablet layout for the sign-off queues are still worth doing.**

**Replaces the cut webhook receiver (see "Explicitly deferred").**

The portal is already mobile-responsive. This step makes it work well in the two places it is actually used: an educator's phone, and a shared tablet in the room. Cut in three sizes, do the cheap ones first.

- **Camera capture (small).** On a phone, a file input with `capture` opens the camera directly. Add it to every upload control: Photo ID, visa document, contract, SOP and policy source documents, and the onboarding verification documents. A staff member photographs a physical document instead of needing a scan on a laptop.
- **Mobile and tablet polish (contained).** The nav is now six items wide and the onboarding wizard is thirteen steps. Walk every screen on a real phone and a real tablet and fix what is rough. Give the countersign and verification queues a tablet-friendly layout for a manager working through sign-offs on the floor.
- **Installable app, a PWA (one step's worth).** A web app manifest and a service worker so the portal installs to the home screen, opens full screen, and tolerates a patchy connection. No app store, no native code. This is the "app version" without a separate project.

A true native app in the app stores stays out of scope. It is a separate project of months, only worth it for push notifications or deep device features, and the PWA covers the rest.

**Done when**
- A staff member on a phone can photograph a document with the camera and have it upload, for every document type the portal accepts
- Every screen is usable on a phone and on a tablet, checked by hand, not assumed
- The portal installs to a phone or tablet home screen and opens as its own full-screen app

## Step 13: Compliance heatmap
**Status: SUPERSEDED by Step 27. The heatmap is now one section of the admin overview page (Step 27), not a standalone surface. Kept here so the change of scope is visible.**

Aggregates the data from Steps 8, 10, 11, 16 and 17, staff sign-off completion, credential and visa status, contract renewal status, and agreement and contract signing, into one grid.

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

## HR record expansion (Steps 16 to 18)

Added 2 September after reviewing RSG's live onboarding survey against the build. Supersedes the assumption that onboarding was complete at Step 5. The current survey captures next of kin, superannuation, a Tax File Number declaration, banking, work eligibility with visa detail, uniform sizes, roster availability, pre-employment screening declarations, several acknowledgements and two referees, none of which the portal holds yet. These steps close that gap so onboarding produces every record the HR view needs.

Not a new module. The manager side is the existing staff record page, the staff side is the existing `/onboarding` wizard. Both are reorganised into named sections (Personal and contact, Emergency contact, Position and availability, Working rights, Credentials, Payroll, Screening, Agreements, Referees, Other) as these steps land. The cross-staff action queues (`/admin/verification`, `/admin/credentials`, `/admin/contracts`) stay as they are and get grouped under an HR heading in the Manage menu.

Recommended before Steps 13 to 15, since the heatmap in Step 13 should aggregate this data too.

**Access model.** The `profiles.hr_verifier` flag is renamed `hr_manager` and its scope widens: document verification (as now), contract upload and replace, and visibility of the Payroll and Screening sections. Set per person by an admin, same mechanism as before.

- Standard HR (Personal, Emergency contact, Position and availability, Working rights, Credentials, Agreements, Referees): Admin, both manager tiers, and the staff member for their own record
- Payroll (Tax File Number declaration, superannuation, banking): Admin and `hr_manager` only, plus the staff member for their own. Not the manager tiers.
- Screening (child protection and criminal history declarations): Admin and `hr_manager` only, plus the staff member for their own
- Contract upload and replace: Admin and `hr_manager` only. Manager (policy) keeps view and download but loses upload, changed from Step 11 as built.

### Step 16: HR access model and identity, working rights, and the rest of the personal record
**Status: done, merged. `hr_verifier` renamed to `hr_manager` with the wider scope, contract write tightened to Admin and HR manager, and the identity, working-rights and personal-record fields added to onboarding and the staff record.**

- Rename `profiles.hr_verifier` to `hr_manager` across the schema, RLS helpers and the UI. Tighten the `contracts` write policy to Admin plus `hr_manager` (this lands on the Step 11 branch before it merges).
- Add to `worker_details`: gender, next of kin name, relationship, address and phone, uniform sizes (hoodie, polo, vest), roster availability (days available, ideal weekly hours, availability notes). Roster availability is captured once and drives no flags or reminders, it is scheduling context not compliance data. Job title is not captured from the staff, it is set by a manager through the existing position and SOP job role fields.
- Working rights: work eligibility (Australian citizen, permanent resident, or visa), visa number, visa expiry, and an optional supporting document upload. Visa expiry feeds the same expiring and expired flags as WWCC and the contract, through the Step 10 credentials view and the outstanding-items surface. No passport tracking.
- Photo ID: a single upload that a manager sights, same pattern as the onboarding documents. No expiry.
- The `/onboarding` wizard gains the new steps. The staff record page and `/onboarding` both move to the sectioned layout.

**Done when**
- An admin can rename-safe: every existing HR verifier still verifies, and the renamed flag now also gates contracts and the sensitive sections
- A staff member can enter their gender, next of kin, uniform sizes, availability, work eligibility and visa detail during onboarding, and see them on their own details page
- A visa with an expiry inside 60 days or already passed shows on `/admin/credentials`, the dashboard and the person's outstanding items, exactly as a WWCC does
- Photo ID uploaded by a staff member creates a sighting task for managers at their service

### Step 17: Agreements and the sign mechanism
**Status: done, merged. Org-level agreement templates published and versioned like SOPs, a staff signing screen at `/agreements`, contract signing on the onboarding page, and a signature roster on each agreement. The seed agreement types are created through the admin screen, the wording is RSG's.**

- A generic agreement-template concept at organisation level: a named agreement with a body and a published version, the same publish and versioning as SOPs. Seed types: Code of Conduct, Confidentiality Agreement, Uniform Receipt Declaration, Individual Flexibility Agreement, Training Agreement (trainees), plus plain attestations that carry no document (WWCC currency acknowledgement, background and reference check consent, mandatory reporting obligations acknowledgement).
- One signature row per staff member per agreement version, timestamped, recording the person and the version. Re-publishing an agreement makes prior signatures stale, same as SOPs.
- The Child Safety Policy and Code of Conduct acknowledgement links to the actual policy in the library, the staff member opens it and signs.
- Move the contract onto this mechanism so a staff member reads and signs it in the tool. The contract keeps its start date, period type and calculated expiry from Step 11. Signing is a read-and-accept record against the contract version, the same evidentiary standard as an SOP sign-off, not a witnessed e-signature. DocuSign-grade signing stays out of scope.
- Unsigned agreements appear in the person's outstanding items, the staff list and dashboard counts, and a manager queue.

**Done when**
- A staff member sees each agreement they need to sign, opens it, and signs, and the signature is recorded against that version with a timestamp
- Re-publishing an agreement moves everyone who signed the old version back to unsigned
- A staff member can read and sign their own contract in the tool, and the signed state and signing date show on the staff record
- An unsigned agreement counts as an outstanding item on the staff list, the dashboard and the person's record

### Step 18: Payroll and screening
**Status: done, verified against real logins, on branch `step-18-payroll-screening` (with the Policy categories commit) waiting to merge.**

- Tax File Number declaration built as the ATO form: TFN, whether they claim the tax free threshold, HELP or SSL or TSL debt, Financial Supplement debt. Superannuation fund and member number. Banking BSB and account number, with the account name defaulting to the person's name.
- Screening declarations: child protection investigation, finding or disciplinary history, and criminal charges, convictions or findings relating to children or under-18s. Yes or no with a detail field, recorded against the question wording and the date answered.
- Referees: two referee records, each with name, organisation, job title, relationship, phone and email, plus a reference-check completed date and by whom, since the check itself may happen outside the portal.
- Payroll and screening sections are visible only to Admin and `hr_manager`, and to the staff member for their own record. Referees are visible to Admin and `hr_manager`. RLS enforced, not just hidden in the UI.
- These sections are added to `/onboarding` and to the staff record, shown only to those who may see them.

**Done when**
- A staff member completes their Tax File Number declaration, superannuation and banking details in onboarding, and a Manager (staff) viewing that person's record cannot see any of it
- An admin and a designated HR manager can see the payroll and screening sections, no one else can, confirmed against real logins
- Screening declarations record the question wording and the date, so a later change to the wording does not rewrite what someone previously answered
- Two referees with a completed-check date show on the staff record for Admin and HR manager only

### Policy categories (added 2026-09-03, done)

Policies are organised into a per-organisation set of categories, seeded with Parent policies, General policies, HR policies, OHS policies and Other (OHS kept separate as a WorkSafe / OHS Act matter, distinct from the education and care National Law). Many-to-many, a policy can be in more than one. The "Parent policies" category carries the parent-notification meaning, and a trigger keeps `policies.is_parent_facing` in step, so it replaces the standalone parent-facing checkbox. Categories are for organising the library and for linking policies to SOPs, they do not control who sees a policy. The category picker appears on the new-policy form, the bulk upload (applied to newly created policies), and the policy editor. Both the admin policy list and the staff Policies view are grouped by category. Migration `0031`.

## Revision, September 2026: SOP review cycle and admin command centre (Steps 19 to 27)

Companion spec: `REVISION_SOP_REVIEW_CYCLE.md`, which holds the detail. This is new scope. It adds a recurring review cycle to every SOP, a practice-observation record for high-risk SOPs, optional outcome-evidence capture, a password reset flow, a two-page bulk upload wizard that publishes on review rather than leaving drafts, an itemised outstanding-items list on the staff profile, staff record editors for job role and access tier, and a single admin overview page that folds in the old Step 13 heatmap.

The spec was written against an older step numbering (its "16 to 18" and "19" do not match this file). Its steps are renumbered here as 19 to 27. Its resolved decisions are carried in, plus these from Zeke on 2026-09-07:

- **Password reset:** both self-service and an admin-triggered reset (admin never sees or sets the password, only triggers the email).
- **Bulk import guard:** non-empty text check only, no minimum word count.
- **Itemised outstanding list:** comprehensive. Every flag a staff member has anywhere (overdue SOPs, unsigned contract, unsigned agreements, credential expiries, contract renewal) is itemised on their profile.
- **Bulk upload shape:** two pages. Page one selects files and sets the category. Page two lists every uploaded document pre-set to publish, where the category can be adjusted, the review date is set manually, and SOPs are linked to policies (or the reverse) via a dropdown. One "publish all" action. Nothing lands as a draft to be opened individually. This merges the spec's Step 21 and Step 24.
- **Approval model:** the portal recognises Admin and Manager tiers only. "Approved provider" is not a role, just a label on a sign-off for display. Policy publishing is single approval, no dual gate.
- **Admin overview vs staff list:** separate surfaces, shared query logic.

### Step 19: Reminder engine
**Status: built on branch `step-19-reminders` 2026-09-07, not merged. Migration 0034 (notification_log) applied to live DB. Prerequisite for Steps 20, 22, 23. Sends are live once Zeke verifies `vericlever.site` in Resend and sets RESEND_FROM + CRON_SECRET in Vercel.**

Built: `GET /api/cron/reminders` (Vercel Cron daily at 21:00 UTC, `vercel.json`; guarded by `CRON_SECRET`, fails closed in production without it, open in dev). `src/lib/reminders.ts` `runReminders({dryRun})` builds one weekly digest per person: a staff digest (own unsigned SOPs, unread policies, unsigned agreements, unsigned contract, unfinished onboarding, own credential/visa expiry within 60 days or past) and a manager digest (documents to sight, SOPs to countersign, and for Admin/hr_manager: staff contract renewals within 28 days and staff credential expiries; for content editors: SOPs and policies with a `next_review_date` within 14 days or past). `notification_log` records each send and enforces the 7-day cadence. Email via the existing `src/lib/email.ts` Resend wrapper (`sendEmail`). Verified end to end on localhost with `?dryRun=1` and a real run: the one digest to the Resend account owner sent, the rest returned Resend's sandbox 403 (expected until the domain is verified) and were not logged so they retry.

The deferred email half of Steps 7, 9 and 11. A scheduled job (Vercel Cron) that sends, via Resend from the verified `vericlever.site` domain: SOP-incomplete reminders, SOP and policy review reminders (Step 20), credential-expiry reminders, contract renewal alerts (4/3/2/1 week), and the Reg 172 parent digest. `notification_rules` table if not already present. Each email type respects the tier rules already written into Steps 7, 9 and 11.

**Done when**
- A staff member with an overdue SOP receives a reminder email from a `@vericlever.site` address
- Contract renewal alerts fire at 4, 3, 2 and 1 week for Admin and Manager (policy)
- Publishing several policies in a week produces one combined parent email

### Step 20: SOP review cycle and reminder
**Status: built on branch `step-20-review-cycle` 2026-09-07, not merged. Migration 0036 (sop_history) applied to live DB. Spec: `REVISION_SOP_REVIEW_CYCLE.md` "Step 16".**

Built: `sop_history` event log (edit / period_change / review), written by the SOP editor actions. `src/lib/sop-review.ts` `reviewState()` (none / ok / soon / overdue from `next_review_date`). SOP editor Review cycle section: status, cadence + next date (`updateSopReview`), "Mark as reviewed now" (`markSopReviewed`, moves the date to the cadence from today), and a Review history list. An out-of-sequence text edit prompts "reset the review clock?" on save, not automatic; the edit event records the choice. SOP list shows an overdue / due-soon badge and header count. Policy editor gets the same cadence / next date / mark-reviewed controls, no history log. Step 19's digest already consumes `next_review_date`.

`review_period` on every SOP (3 / 6 / 12 months, default 6, fixed options). High-risk SOPs may override, reusing the existing high-risk tag. Computed review due date (last review plus period), overdue flag, reminder ahead of due via Step 19. A single per-SOP history log, `event_type` of `edit` / `period_change` / `review`. An out-of-sequence content edit offers the editor a choice to reset the review clock, not automatic.

**Done when**
- Every SOP has a computed due date and overdue SOPs surface a flag
- A reminder fires ahead of the due date via Step 19
- Every edit, period change and review writes one entry to the SOP history log

### Step 21: SOP practice observation record
**Status: not started. Spec: `REVISION_SOP_REVIEW_CYCLE.md` "Step 17".**

An evidence log per SOP per review cycle: free-text evidence plus an outcome tag (needs-review / continue-as-is). On save, a popup asks whether to reset the review clock (default yes, using the SOP's existing period), respected regardless of the tag. Any manager tier and Admin can log an observation, not plain Staff. A needs-review flag routes into the existing SOP edit and approval pipeline and feeds the Step 27 heatmap.

**Done when**
- A manager can log an observation against any SOP
- needs-review is visible on the SOP and feeds the Step 27 heatmap
- The reset-clock popup on save is offered and its choice respected

### Step 22: SOP outcome evidence capture
**Status: not started. Spec: `REVISION_SOP_REVIEW_CYCLE.md` "Step 18". Introduces a new storage surface, include in the security review.**

An optional "suggested evidence" hint field per SOP, pre-filled for template SOPs, editable or removable. A manager-entered evidence field at review time: free text plus file upload. New Supabase storage bucket with RLS parity to existing tenant isolation. No metrics registry, no live data integration.

**Done when**
- A SOP can carry a suggested-evidence hint
- The review cycle captures a manager-entered evidence field with optional file upload
- Uploaded evidence has RLS parity with existing tenant isolation

### Step 23: Password reset and login trouble
**Status: built on branch `step-23-password-reset` 2026-09-07, not merged. Migration 0035 (password_reset_requests) applied to live DB. Spec: `REVISION_SOP_REVIEW_CYCLE.md` "Step 20". Needs Step 19.**

Built: self-service `/forgot-password` (public route, no account enumeration - same neutral response either way, dev shows the link on screen when email is not sending); a "Forgot your password?" link on `/login`; `sendPasswordResetForStaff` on the staff record page (a "Password" control in the Role and access section) for Admin or an HR manager for staff at their own service, which triggers the email without the leader ever seeing the link; `password_reset_requests` audit table (source self/admin, who, when, whether the email sent) with a "Last reset" line on the record. Reuses Supabase Auth's recovery token via the existing `/auth/confirm` route and `generatePasswordResetLink`. Verified end to end on localhost: self-service link set a password and signed in; admin trigger emailed the Resend account owner and recorded the row; sandbox rejections for other addresses are recorded with email_sent false.

Self-service forgot-password using Supabase Auth's built-in reset token, emails via Resend. Plus an admin-triggered reset: a permitted role triggers the reset email for a staff member without seeing or setting the password. Rate limiting, token expiry and brute-force protection are Supabase's, not rebuilt. An audit trail records who requested, when, self versus admin-triggered.

**Done when**
- A staff member can request and complete a password reset by email
- Admin (and Manager policy) can trigger a reset for another user without seeing or setting the password
- An audit trail exists

### Step 24: Bulk upload wizard, two pages
**Status: built on branch `step-24-bulk-wizard` 2026-09-07, not merged. Migrations 0032 (review_period_months) and 0033 (next_review_date) on sops and policies, applied to live DB. Page 2 sets job roles, a staggered next review date, the cadence, and policy links; the page-1 category dropdown was removed. Merges spec "Step 21" and "Step 24". Trial-relevant.**

Page one: select files (SOPs and/or policies), set a category. Page two: every uploaded document listed, each pre-set to publish, with the extracted-text status shown, the category adjustable, a review period set manually, and a dropdown to link SOPs to policies or policies to SOPs (reusing the Step 6 many-to-many model). One "publish all" action publishes everything through each document type's normal single-approval path. A document whose text extraction returned nothing stays a flagged draft and is excluded from the bulk publish. Job-role attachment is ticked on page one and is what actually controls staff visibility.

**Done when**
- An uploaded SOP with successful extraction is visible on a staff member's list immediately after the page-two publish, no per-document step, provided its job role was ticked
- SOPs and policies with failed extraction remain flagged drafts
- Policy-SOP links can be set from page two
- Review period is set from page two for both document types

### Step 25: Itemised outstanding items on the staff profile
**Status: partly done. Spec: `REVISION_SOP_REVIEW_CYCLE.md` "Step 22". The staff record page already has an "Outstanding items" section from Step 8; this repositions and completes it.**

Move the itemised list to sit directly under the identity line (email, role, service), above the HR manager control and training progress, so it is the first thing an admin sees. Include a count that matches the "Outstanding" figure on the staff list row. Itemise every flag that person carries: overdue SOPs (named), SOPs awaiting countersign, unviewed policies, unsigned contract, unsigned agreements (including code of conduct), unsighted documents, credential expiries, contract renewal. Code of conduct is an agreement (Step 17), not a new record type.

**Done when**
- The staff profile shows a named itemised list under the identity line, before any other section
- The list total matches the "Outstanding" figure on the staff list row

### Step 26: Staff record editors for job role and access tier, plus job-role assignment picker
**Status: not started. Spec: `REVISION_SOP_REVIEW_CYCLE.md` "Step 23", resolved as option B. Trial blocker, build first.**

**a.** Staff record page gets a job role editor: a dropdown of the organisation's job roles plus "No job role", and Save. New action `setStaffJobRole`. Who: Admin anywhere in the organisation, or an HR manager for staff at their own service. Changing the role swaps the SOP suite; old sign-offs stay as history but stop counting.

**b.** Staff record page gets an access tier editor: Staff / Manager (staff) / Manager (staff, policy and procedures) / Admin, and Save. New action `setStaffAccessTier`. Who: Admin only. Guards: cannot change your own, and the last admin in an organisation cannot be demoted.

**c.** Job roles page (`/admin/job-roles/[id]`) gets a staff assignment picker in the "Staff in this role" section: a searchable list of staff not in this role with Assign, and Remove next to each listed person. New actions `assignStaffToRole`, `removeStaffFromRole`. Who: Admin, or an HR manager for staff at their own service.

Option B resolved: the job roles pages stay content-editor only. HR managers use route (a) from the staff record page. Content editors and Admin have both routes.

**Done when**
- An Admin or HR manager (own service) can change a job role from the staff record page and the SOP suite updates immediately
- An Admin can change access tier with both guards enforced
- An Admin or HR manager (own service) can assign or remove staff from a role via the job roles picker
- HR managers cannot reach `/admin/job-roles/[id]`

### Step 27: Admin overview page
**Status: not started. Spec: `REVISION_SOP_REVIEW_CYCLE.md` "Step 25". Supersedes Step 13 and the old Step 19 report scope. Extends the existing `/admin` dashboard, does not replace it with a new page next to it.**

Four sections, top to bottom, ordered by urgency:

1. **Action queue** — overdue and needs-attention items first: SOP and policy review reminders (due and overdue, from Step 20), and unresolved needs-review flags from Step 21. Extends the existing "needs attention" list on `/admin`.
2. **Structural integrity** — orphan SOPs (no policy link), orphan policies (no SOP link), and the link map, reusing the Step 6 linking model and the Step 24 linking dropdown.
3. **Compliance heatmap** — the old Step 13 scope. Sites as rows, categories as columns, red/amber/green. Depends on Steps 8, 10, 11 and the Step 21 needs-review flags.
4. **Review history log** — reads the Step 20 history log. Collapsed by default or reached by drill-down, not rendered in full on load.

Separate from Step 25 (per-staff), but shares the same "outstanding" query logic where data overlaps.

**Done when**
- One admin page shows the action queue, structural integrity, heatmap, and a drill-down review history
- All four sections read existing data (Step 20 log, Step 6 links, Step 21 flags, Steps 8/10/11 heatmap inputs), not a duplicated dataset

## Before RSG staff can use the portal

Independent of the numbered steps. Roughly in order:

1. **Merge the open branch.** Step 18 and Policy categories, verified, on `step-18-payroll-screening`.
2. **Buy the VeriClever domain, register the ABN, verify the domain with Resend.** Unblocks every email feature at once. Zeke's action.
3. **Load RSG's content.** Re-run the importer or upload the current SOPs and policies through the admin screens, then classify the policies into categories and publish.
4. **Deploy.** Push `main` to `github.com/vericlever/ecec-portal`, connect Vercel, set the environment variables, confirm it runs against the live database at a real address.
5. **Camera capture and a mobile pass** (Step 12), so it works on the phones and tablets staff will actually use.
6. **Clear the test data.** The throwaway `delivered@resend.dev` account, and the demo records left on Sam Rivers and others during verification.
7. **Create the real staff accounts** and send the invite links.

## Explicitly deferred or cut

- **Webhook receiver for external course completions (cut 3 September).** Was Step 12. Too speculative, it depended on Gecko Training or an equivalent existing and offering a webhook. Nothing was built for it. External completions are entered by hand through the training records screen. Revisit only if a real integration partner appears.
- **Native app in the app stores.** A PWA (the new Step 12) covers the need without a separate project.
- Comprehension check questions (parked, schema-ready placeholder only)
- Live MYOB or Xero sync
- Live NQAITS import or export
- Live Gecko Training integration
- Live WWCC verification against any external register, placeholder field only, do not imply this is live anywhere in UI copy
- SRF public registration and payment flow

## Notes for Claude Code

- Australian English spelling throughout any user-facing copy or generated documentation
- No em dashes in generated documentation or commit messages where prose is used
- No Oxford comma in generated prose
- Confirm each step's "done when" criteria against real, manually verified logins and data, not assumed from a prior step's claimed completion
- One feature branch per step, committed there, `main` left untouched until Zeke merges. Migrations are applied to the live Supabase project as they are written, via `scripts/run-sql.mjs`
- `STAFF_ONBOARDING_NQAITS.md` has the complete NQAITS field list and verified dropdown values, `CONTRACT_MANAGEMENT.md` has the contract detail, `ROLE_ACCESS_MATRIX.md` has the feature-by-role breakdown, read the relevant one before touching that area
- Detailed running state, test accounts, migration list and known test data live in Claude's project memory (`ecec-portal-build-sequence.md`), not in this file
