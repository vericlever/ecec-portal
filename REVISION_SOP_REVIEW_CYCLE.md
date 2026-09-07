# Revision Spec: SOP Review Cycle, Practice Observation & Evidence Capture

**Date:** 2026-09-06
**Status:** Draft — proposes new steps 16–18, 20–22, 24–25 for BUILD_PLAN.md, and supersedes the original scope of Steps 13 and 19 (folded into Step 25).
**Context:** New scope, not a clarification of existing steps. Adds a recurring review cycle to every SOP, a sustained practice-observation record for high-risk SOPs, an optional outcome-evidence capture at review time (scoped to SOP and policy-outcome effectiveness, not individual staff performance), a login trouble / password reset flow, a fix to bulk import so SOPs publish on upload rather than sitting as drafts, an itemised outstanding items view on the individual staff profile, staff record editors for job role and access tier plus a job-role assignment picker, a bulk approval page for policies and SOPs with linking and review date, and a single admin overview page (action queue, structural integrity, heatmap, review history) that replaces the original separate scope of Steps 13 and 19.

## Constraints (do not lose these when building)

- Evidence captured in Steps 18 is self-reported by the reviewing manager at review time. No metrics registry, no live outcome-data integration in this revision, consistent with existing deferred items (live NQAITS, Xero, Gecko sync all remain deferred). Do not build toward automated data integration as part of this spec.
- Reuse existing infrastructure wherever possible: SOP versioning/approval pipeline, the existing high-risk tag, Step 7's reminder email system, the compliance heatmap (now part of Step 25). Do not stand up parallel systems for any of these.

## New steps

### Step 16 — SOP review cycle & reminder
- Add `review_period` to every SOP record, constrained to three fixed options: 3 months / 6 months / 12 months. Default 6 months. Not a free-text field.
- High-risk SOPs may override the default period from the same three options. **Reuse the existing high-risk tag** — do not create a second risk taxonomy.
- **Out-of-sequence edits:** if a SOP is edited outside its scheduled review (a direct content edit, not a Step 17 observation), present the editor with an option to reset the review clock, extending the next due date by the SOP's selected period from the edit date. This is a choice offered at edit time, **not automatic**.
- **History log required:** any change to a SOP's review period, any content edit, and any Step 17 observation must write to a single per-SOP history log (one event table, `event_type` of `edit` / `period_change` / `review`, rather than three separate logs). This is what lets someone see, in order, why the clock reset each time. Step 25's review history section reads from this log — build the log now rather than deriving history retroactively later.
- Reminder scheduling extends Step 7's reminder email infrastructure. Do not build a second notification system.
- **Done-when:** every SOP has a computed review due date (last review + period); overdue SOPs surface a flag; a reminder fires ahead of the due date via the existing Step 7 mechanism; every edit, period change, and review writes one entry to the SOP's history log.

### Step 17 — SOP practice observation record (high-risk SOPs, sustained verification)
- New evidence log per SOP per review cycle: free-text evidence field plus an outcome tag (needs-review / continue-as-is).
- **Resolved: manual reset via popup, independent of the outcome tag.** On saving any observation, whether tagged needs-review or continue-as-is, a popup asks the manager whether to update the review clock, with options to update or not update. Default is update, using the SOP's existing review period unchanged (a SOP on a six month cycle resets to six months from today, a three month cycle resets to three months from today). Declining leaves the due date as it was. This replaces the earlier recommendation of an automatic reset tied only to continue-as-is, the reset is now always a manual choice regardless of outcome tag.
- Role permission needed: confirm which of the four tiers (from Step 4, in progress) can submit this evidence. Likely Manager-staff+policy and Admin, not plain Staff.
- **Resolved: any manager tier and Admin.** Both Manager (staff) and Manager (staff, policy and procedures), plus Admin, can log an observation. Plain Staff cannot.
- A needs-review flag should route back into the existing SOP edit/approval pipeline, not sit in an orphaned queue.
- **Done-when:** a manager can log an observation against any SOP; needs-review is visible on the SOP and feeds the heatmap (Step 25); on save, a popup offers to update the review clock (default yes, using the SOP's existing period), and the choice is respected regardless of the outcome tag chosen.

### Step 18 — SOP outcome evidence capture (optional, self-reported)
- Each SOP gets an optional "suggested evidence" example field, pre-filled for template SOPs (e.g. ratio SOP suggests roster/attendance data; transitions SOP suggests parent survey score), editable or removable by the customer.
- Manager-entered evidence field at review time: free text plus file upload.
- File upload requires a Supabase storage bucket and RLS policy. This is a new storage surface holding evidence of SOP and policy-outcome effectiveness, not a record about any individual staff member — **fold into the Step 5 security review as a new storage surface regardless, do not treat as ordinary CRUD, but the sensitivity driver is tenant data isolation, not personal staff records.**
- No metrics registry, no live data integration — explicitly deferred.
- **Done-when:** a SOP can carry a suggested-evidence hint; the review cycle captures a manager-entered evidence field with optional file upload; uploaded evidence has RLS parity with existing tenant isolation.

### Step 19 — SUPERSEDED, folded into Step 25 below
- Original scope (SOP revision report reading from the Step 16 history log) is retained but now built as one section of Step 25's admin overview page, not as a standalone report. See Step 25.

### Step 20 — Login trouble & password reset
- Self-service reset: standard "forgot password" flow using Supabase Auth's built-in reset-token mechanism. Do not build a parallel token/verification system — this is Supabase's job.
- Reset emails route through **existing Resend infrastructure (Step 7)**, not a second email pathway.
- **Decision required before build:** does this stay self-service only, or is there also an admin/Manager-tier "trigger reset for this staff member" action, for low-tech-literacy staff who get stuck in their own email? Recommendation: support both — self-service as default, with an admin-triggered fallback for staff who can't complete the email flow unassisted.
- Role permission: if the admin-triggered fallback is built, confirm which tier(s) can trigger a reset on another user's behalf (likely Manager-staff+policy and Admin, consistent with Step 4's model) — same open dependency as Steps 17/18.
- Rate limiting, token expiry, and brute-force protection on login/reset are handled by Supabase Auth natively — explicitly not to be rebuilt.
- **Done-when:** a staff member can request a password reset and complete it via email; an audit trail exists (who requested, when, self vs admin-triggered); if the admin fallback is in scope, a permitted role can trigger a reset for another user without seeing or setting their password directly.

### Step 21 — Bulk import: publish on upload, category field, job role attachment
- Root cause (for reference): SOPs are only visible to a staff member if attached to their own job role. Bulk upload defaulted to Educator only, so anyone in a different job role (e.g. Room Leader) saw nothing, even for the 3 SOPs that were published. The other 22 were still sitting as unpublished drafts regardless of job role. The "Category" dropdown (`target_tier`) is a cosmetic label only and has no effect on visibility, it is a separate field from job-role attachment despite the names overlapping.
- **a. Publish immediately.** `bulkImportSops` currently extracts document text into `body` and stops there, leaving every SOP as an unpublished draft. Extend the same step to snapshot `body` into `published_body`, set `published_version = 1`, and `published_at = now()`. Guard: if text extraction returns empty, leave that SOP as a draft and flag it in the results rather than publishing a blank SOP.
- **b. Category from the form.** Add a category dropdown to the bulk upload form, pass it through as `newCategory`, and write it to `target_tier` on the new SOPs. Cosmetic only, does not affect visibility.
- **c. Job role attachment.** No code change required, this is a form-usage fix: tick every job role that should see the SOP in the bulk upload form, not just Educator.
- **Open decision:** the empty-extraction guard only catches zero-content extraction. A partial or garbled OCR result (a bad scan that returns a few lines of nonsense rather than nothing) will pass the guard and publish live to staff. Decide whether a minimum length or word-count threshold is needed on the guard before this ships, given a published unusable SOP that staff can sign off against is worse than a stuck draft.
- **Done-when:** an uploaded SOP with successful text extraction is visible on a staff member's SOP list immediately on upload completion, with no manual publish step, provided their job role was ticked in the bulk form; SOPs with failed extraction remain as flagged drafts.

### Step 22 — Itemised outstanding items on individual staff profile
- Currently the staff list view shows a single "Outstanding" count per staff member (e.g. "Outstanding: 1"), but the individual staff profile page only shows aggregate empty states ("This job role has no SOPs attached yet", "No published policies target this person yet") with no itemisation and no outstanding count at all.
- Add an itemised outstanding items section to the individual staff profile, positioned directly under the identity line (email, role, service) and above the HR manager checkbox and training progress sections, so it is the first thing visible.
- Outstanding items to itemise: SOPs overdue for completion (per SOP, named), unsigned contract, unsigned code of conduct. Each item should be listed individually, not just totalled.
- **Open decision:** confirm whether "code of conduct" is modelled as its own signable document type or as a policy/contract subtype, since this determines where the underlying data comes from. Flag if it does not yet exist as a distinct record type.
- **Open decision:** whether this itemised list should also include credential expiries (Step 10) and contract renewal alerts (Step 11) once those are live, or stay scoped to SOP and contract/code-of-conduct sign-off for now. Recommend scoping to what already has data and adding the rest once Steps 10 and 11 land, rather than wiring to data that does not exist yet.
- **Done-when:** the individual staff profile shows a named, itemised list of outstanding actions (not just a count) immediately under the identity line, before any other section; the total matches the "Outstanding" figure already shown on the staff list row.

### Step 23 — Staff record editors for job role and access tier, plus job-role assignment picker
Depends on Step 4 (role model) and Step 5 (staff management) being solid, since this writes directly against both.

**a. Staff record page, job role editor.** `/admin/staff/[profileId]` gets a "Job role" control: a dropdown of the organisation's job roles plus "No job role", and a Save button, same pattern as the existing probation and HR manager controls. New action `setStaffJobRole(profileId, jobRoleId)`. Who: Admin anywhere in the organisation, or an HR manager for staff at their own service. Help text: changing the role swaps the person's SOP suite, old sign-offs stay as history but stop counting toward progress, and the new role's SOPs appear on their list immediately.

**b. Staff record page, access tier editor.** Same page gets an "Access level" control: a dropdown of Staff, Manager (staff), Manager (staff, policy and procedures), Admin, and a Save button. New action `setStaffAccessTier(profileId, tier)`. Who: Admin only, an HR manager cannot change this for the same reason they cannot make someone an admin. Guards: cannot change your own access level, and the last remaining admin in an organisation cannot be demoted, so the organisation can never lock itself out. Help text: promoting to a manager tier grants those capabilities immediately, demoting a Manager (policy) to Staff removes content editing.

**c. Job roles page, assign a staff member.** `/admin/job-roles/[id]`, in the "Staff in this role" section: a searchable picker of staff not currently in this role with an "Assign" button, and a "Remove" link next to each person listed. New actions `assignStaffToRole(roleId, profileId)` and `removeStaffFromRole(roleId, profileId)`. Assigning moves the person onto this role off their previous one, removing sets them to "no job role". Who: Admin, or an HR manager for staff at their own service.

**Decision resolved: option B.** The job roles pages stay content-editor only (Admin and Manager policy), HR managers are not given access to them. HR managers change roles from the staff record page instead, which is (a) above. Admin and content editors have both routes available. Rejected option A would have widened the job roles pages and the Manage menu item to admit HR managers, exposing rename, delete and SOP suite editing to a role tier that should only touch staff assignment, not content structure, so B keeps the HR manager surface area consistent with their existing scope.

- **Done-when:** an Admin or HR manager (at their own service) can change a staff member's job role from the staff record page and see the SOP suite update immediately; an Admin can change access tier from the same page with both guards enforced; an Admin or HR manager (at their own service) can assign or remove a staff member from a job role via the job roles page picker; HR managers cannot reach `/admin/job-roles/[id]` directly.

### Step 24 — Bulk approval page for policies and SOPs, with linking and review date
- Same underlying problem as the one Step 21 fixes for SOPs: policies sit as unpublished drafts until someone opens each one individually, this is the bottleneck to remove for policies too, but the approval mechanics are not identical between the two document types.
- New page listing all draft policies and SOPs pending approval, with a bulk approve action.
- **Feature 1: policy-to-SOP linking.** A dropdown on this page to link a policy to its procedures directly, reusing the many-to-many policy-SOP linking model from Step 6 rather than a separate linking mechanism.
- **Feature 2: review date.** Set `review_period` (the Step 16 field, 3/6/12 months) for both SOPs and policies from this same page, rather than requiring a separate visit to each document.
- **Open decision, needs resolving before build:** policies are approval-gated at two levels, Centre Director and Approved Provider/admin, and Reg 172 parent notification only fires once both approvals are in place on a published version. A single bulk-approve click must not collapse this into a one-step publish the way Step 21 does for SOPs. Confirm whether: (i) this page only ever represents one of the two approval levels and a policy bulk-approved here still needs the second sign-off elsewhere, or (ii) the page is restricted to a role that can only act on policies where the other level is already approved, so bulk-approving here always completes the gate rather than skipping it. Whichever way it's decided, the bulk action must run through the same approval-gate logic as the existing single-document flow, not a parallel shortcut.
- **Open decision:** confirm bulk-approving several policies in one session does not cause duplicate Reg 172 notifications. Weekly digest batching should already absorb multiple approvals in the same week into one email, but this is the first workflow that deliberately approves many policies at once, worth a specific check rather than assuming existing batching covers it.
- **Done-when:** a single page lists all pending-draft policies and SOPs; bulk approving publishes them through the same gate logic each document type already has (SOPs single-step per Step 21, policies via whichever dual-approval resolution is chosen above); policies can be linked to SOPs via dropdown from this page; review period can be set for both document types from this page; a policy that completes both required approval levels through this page fires exactly one Reg 172 notification, batched as normal.

### Step 25 — Admin overview page (structural integrity, action queue, heatmap and review history)
Supersedes the original scope of Step 13 (compliance heatmap) and Step 19 (SOP revision report). Both are retained as sections within this single page rather than separate surfaces, since Zeke's intent is a genuine command centre view: one landing page for admins showing the whole policy-to-procedure-to-outcome cycle, not a merged report.

Structured as four sections top to bottom, ordered by urgency, not by build origin:

**1. Action queue (top of page).** Overdue and needs-attention items surfaced first, same principle as the itemised outstanding-items section on the individual staff profile (Step 22). Includes SOP review reminders and policy review reminders (both due and overdue, per Step 16's computed due dates), and needs-review flags raised in Step 17 that have not yet been resolved.

**2. Structural integrity.** New section, not covered by the original Step 13 or Step 19 scope. Shows orphan SOPs (no policy link), orphan policies (no SOP link), and the SOP-to-policy and policy-to-SOP link map, reusing the linking model from Step 6 and the linking dropdown from Step 24. This is where a systemic gap, a policy nobody has connected to a procedure, becomes visible at a glance rather than discovered by accident.

**3. Compliance heatmap.** Original Step 13 scope, visual overview. Carries forward Step 13's existing dependency on Steps 8, 10 and 11, plus the dependency introduced by Step 17, since needs-review flags feed this heatmap.

**4. Review history log.** Original Step 19 scope. Reads directly from the Step 16 history log (edits, period changes, reviews). Recommend this section defaults to collapsed or reached via drill-down from an item elsewhere on the page, rather than a full log rendered by default, to avoid the effective ban on this page's usefulness as a fast at-a-glance view happening because you have to also scroll past a running log every time.

- **Open question, needs resolving before build:** does this page replace the individual staff outstanding-items work in Step 22, or sit alongside it as a separate, org-wide equivalent? Recommend they remain separate: Step 22 is per-staff-member and lives on that person's profile, Step 25 is org-wide and lives on its own admin landing page, but both should reuse the same underlying "outstanding" query logic where the data overlaps (e.g. SOP review overdue), rather than each recalculating it independently.
- **Done-when:** a single admin landing page shows, top to bottom, an action queue of overdue and flagged items, a structural integrity view of orphan SOPs and policies plus the link map, the compliance heatmap, and a drill-down-accessible review history log; all four sections read from existing underlying data (Step 16's history log, Step 6's linking model, Step 17's flags, Steps 8/10/11's heatmap inputs) rather than a duplicated dataset.

## Flagged — not covered by the four items above

1. RESOLVED. Steps 17 and 18 role permissions: any manager tier (Manager staff, or Manager staff plus policy and procedures) plus Admin can log observations and evidence. Plain Staff cannot.
2. File upload in Step 18 introduces a new storage surface holding evidence of SOP and policy-outcome effectiveness (not individual staff performance records). This should still be in scope for the Step 5 security/RLS review, not skipped as routine CRUD, but the driver is tenant isolation rather than personal-data sensitivity.
3. RESOLVED. Needs-review clock logic (Step 17): reset is always a manual choice via popup on save, regardless of the outcome tag chosen. Default is to update using the SOP's existing review period, with an option to decline. Not tied automatically to continue-as-is.
4. Review-period overrides must reuse the existing high-risk tag. A second risk field would fragment the data model.
5. Reminder logic (Step 16) should extend Step 7, not duplicate it.
6. RESOLVED. Steps 13 and 19 are superseded by Step 25, a single admin overview page with four sections (action queue, structural integrity, heatmap, review history log), rather than two separate surfaces.
7. Consider whether any of Steps 16–18 or 25 should wait until after Step 5's security threshold clears, given Step 18 introduces a new file-upload storage surface (SOP and policy-outcome evidence, not staff performance data).
8. Step 20 needs a decision on self-service-only vs. admin-triggered fallback reset before build — same role-permission dependency on Step 4 as Steps 17/18.
9. Step 21's empty-extraction guard needs a decision on whether a minimum length/word-count threshold is required, not just a non-empty check, before bulk publish-on-upload ships.
10. Step 22 needs confirmation of whether code of conduct is its own record type or a subtype of policy/contract, and whether the itemised list stays scoped to SOP and contract sign-off or expands to credentials and contract renewals once Steps 10 and 11 land.
11. Step 24's bulk approve action needs a decision on how it interacts with policies' two-tier approval gate (Centre Director plus Approved Provider/admin) before build, and needs confirmation that bulk-approving several policies in one session cannot cause duplicate Reg 172 notifications.
12. Step 25 needs a decision on whether it replaces Step 22's individual staff outstanding-items work or sits alongside it as a separate org-wide equivalent. Recommendation already in Step 25: keep them separate (per-staff-member on the profile page, org-wide on the admin landing page) but share the same underlying query logic where data overlaps.

## Recommended doc structure

Add steps 16–18, 20–22 and 24–25 as short rows to `BUILD_PLAN.md`'s existing table (status, done-when). Steps 13 and 19 should be marked superseded by Step 25 in that table rather than removed outright, so the history of what changed is visible. Keep this file as the companion spec, same pattern as `ROLE_ACCESS_MATRIX.md` and `STAFF_ONBOARDING_NQAITS.md`. Point Claude Code at both: the table for status tracking, this file for the spec detail.
