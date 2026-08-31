# Contract storage and renewal, new scope

Adds a new step to `BUILD_PLAN.md`. Not previously covered anywhere in the existing plan, role matrix, or onboarding spec.

## What this covers

- Storing the executed contract document at onboarding
- Tracking contract period, either a fixed term with a calculated expiry, or a no-fixed-period toggle with no expiry at all, per contract, not a single organisation-wide default
- Flagging renewal review on an escalating schedule, 4, 3, 2, and 1 week before expiry, then marking the contract as expired
- Keeping prior contract versions on file when a renewal happens, not overwriting history

## Access

**Viewing** an executed contract: Admin, Manager (staff), Manager (staff, policy and procedures), and the staff member themselves (their own contract only, not anyone else's).

**Uploading or replacing** a contract: Admin and Manager (staff, policy and procedures) only. Manager (staff) can view but not upload or replace, consistent with that tier not having edit rights elsewhere (policies, SOPs) either.

## Data model

- One record per contract period per staff member, not a single mutable "current contract" field, so renewals build a history rather than overwrite it
- Fields: staff member, executed document (file), start date, period type (fixed or no fixed period), duration (manually entered, only applies if period type is fixed, no default assumed), calculated expiry date (null if no fixed period), uploaded by, uploaded date
- Previous periods remain visible in the staff member's record as history, most recent is the "active" one

## Renewal reminder workflow

This reuses the same pattern as the credential verification queue just built for WWCC and training sighting: a flagged, site-visible task, not assigned to one specific person.

- Starting four weeks before a contract's calculated expiry date, a flagged renewal task appears and escalates on a fixed schedule (see Missed renewal escalation below). Admin and Manager (staff, policy and procedures) get the full escalation, email and pop-up included, Manager (staff) sees it as a to-do item only, no pop-up or email, consistent with not having edit rights on this
- The task remains outstanding until a new executed contract is uploaded for that staff member, which closes the old flag and starts the new period
- This slots into the same reminder mechanism from `BUILD_PLAN.md` Step 7 and the same outstanding-items reporting surface from Step 8, rather than being a separate disconnected list

## Contract period model

Not every contract runs 12 months, and not every contract has a fixed end date at all. Each contract is one of two types, set per contract, not per organisation:

- **Fixed period**: start date and duration are entered manually (not a default 12 months assumed automatically), expiry is calculated from those. All the renewal escalation logic (4, 3, 2, 1 week, then expired) applies.
- **No fixed period**: a toggle, when set, means there's no calculated expiry, and none of the renewal escalation logic fires for that contract. It still has a start date and the executed document on file, it just never triggers a renewal flag.

This replaces the earlier assumption that every contract defaults to a fixed 12-month term.

## Missed renewal escalation

If a contract isn't renewed in time, the system escalates rather than sitting as a single static flag.

- **Admin and Manager (staff, policy and procedures)**: get the full alert, email, in-portal pop-up, and to-do list item, since these are the tiers that can actually act on it
- **Manager (staff)**: sees the item on their to-do list only, no email and no pop-up, since they can view but not act on a contract renewal

**Alert schedule**, at each point below:
- 4 weeks before expiry
- 3 weeks before expiry
- 2 weeks before expiry
- 1 week before expiry
- On expiry, shown as an expired contract, not just another warning

Each of these fires once at its trigger point, they don't need to repeat daily within a week, but the to-do list item (and, for Admin and Manager (policy), the pop-up) should persist until the contract is actually renewed, so it can't be missed by being away when a specific week's alert fired.

**Done when**
- Alerts fire correctly at 4, 3, 2, and 1 week before a contract's calculated expiry, by email and in-portal pop-up for Admin and Manager (staff, policy and procedures), and as a to-do item only for Manager (staff)
- An unrenewed contract past its expiry date is shown clearly as expired, distinct from the earlier countdown warnings, not just another week's reminder
- All of this stops firing the moment a new executed contract is uploaded for that staff member

## Done when

- A contract document can be uploaded at onboarding and appears against that staff member's record
- Admin, both manager tiers, and the staff member themselves can view it, no one else can
- Only Admin or Manager (staff, policy and procedures) can upload or replace a contract, Manager (staff) can view the flag and the document but cannot act on it
- A renewal flag appears starting four weeks before the calculated expiry date and escalates on schedule, full alert (email, pop-up, to-do) for Admin and Manager (staff, policy and procedures), to-do item only for Manager (staff)
- A contract set to no fixed period never triggers a renewal flag or expiry alert, at any tier
- Uploading a new executed contract closes the flag, starts a new period, and the prior contract remains visible as history rather than being overwritten
