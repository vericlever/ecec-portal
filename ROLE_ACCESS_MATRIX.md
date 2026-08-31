# Role access matrix (v2, four fixed tiers)

Replaces the earlier toggle-based approach. Manager is now split into two fixed roles rather than a permissions toggle, this keeps the schema simpler, a role enum with four values rather than a separate permissions table, while still giving you the split you actually need.

| Feature area | Staff | Manager (staff) | Manager (staff, policy and procedures) | Admin |
|---|---|---|---|---|
| Own required sign-offs | View, complete | View, complete | View, complete | View, complete |
| Own progress tracking | Percentage complete, to-do list view | Percentage complete, to-do list view | Percentage complete, to-do list view | Percentage complete, to-do list view |
| Policies | View only | View only | View, add, edit | Add, edit, full access |
| SOPs | View and sign only | Assign SOPs for review to staff | Assign SOPs for review to staff, view, add, edit | Add, edit, full access |
| Policy-SOP linking | No access | No access | Create and manage links | Create and manage links |
| Comprehension questions | Answer only, once built | No access | No access | Add and manage, once built (parked for now, see below) |
| Staff sign-off records | Own only | View all staff at their site(s) | View all staff at their site(s) | View all staff across all sites |
| Reminder emails | No access | Send, individual or bulk | Send, individual or bulk | Send, individual or bulk |
| Staff access management | No access | Manage staff access within their site(s) | Manage staff access within their site(s) | Manage staff access across all sites, assign role tier to managers |
| Staff report view | No access | Per-staff report: SOPs completed and policies viewed, percentage and outstanding table, own site(s) | Per-staff report: SOPs completed and policies viewed, percentage and outstanding table, own site(s) | Same report, across all staff and sites |

## Naming: Staff, not Educator

The base tier is named Staff rather than Educator. This names the access tier, not the job function, since a cook, a finance person or an educator all sit at the same access level, none of them touch the manager or admin side. It also keeps the role model sector-agnostic, useful given the longer-term UK and US ambitions outside ECEC, where "Educator" as a role label wouldn't fit at all.

## Comprehension questions, parked but schema-ready

Not built now, but worth structuring the schema so adding it later doesn't require a rework. Practically that means: when Claude Code builds the SOP table structure, leave a nullable or optional relation for comprehension questions from the start (an empty `comprehension_questions` table linked to `sop_id`, simply unused until this is picked up), rather than bolting it on afterwards. Tell Claude Code this explicitly, since it's easy to skip a placeholder relation when a feature isn't being built yet.

## Scope note

This is now treated as the real build target within your two-month window, not a later-phase expansion. `BUILD_PLAN.md` will need revising to reflect four roles instead of the original Step 4 admin/staff split, and to fold in policy add/edit, SOP assignment, reminder sending and staff reporting as part of the near-term sequence rather than Steps 7 to 9. Worth doing that revision before handing more build instructions to Claude Code, so the step sequence and done criteria match what you're actually building now, rather than Claude Code working against an outdated plan sitting in the repo.
