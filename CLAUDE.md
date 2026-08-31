# The Portal — Project Instructions for Claude Code

## What this is

A staff-facing compliance and training platform for early childhood education and care (ECEC) providers, starting with the Australian market. Sits under Understorey Learning, structured independently from any single childcare operator so it remains portable and saleable.

This is not a full LMS. It is a light LMS adjacent tool: depth of SOP comprehension, sign-off and audit capability, built on genuine regulatory depth (Reg 168, Reg 172, ACECQA, NQF alignment), not a content library.

## Non-negotiable architecture decisions

- **Multi-tenant from day one.** Every table that holds organisation-specific data carries `organisation_id`. Row-level security policies filter on it. This is not a later migration, it is the first migration.
- **Site-level scoping within an organisation.** Organisations can have multiple sites. Tables that are site-specific (staff assignment, site-specific sign-off reporting) carry `site_id` as well as `organisation_id`. Do not conflate site and organisation, they are different boundaries.
- **Policy and SOP are separate tiers, never conflated.** Policies govern and carry parent-facing obligations for a defined subset. SOPs are what staff actually train on and sign off against. All interactive features (read-and-sign, text-to-speech, comprehension checks) belong at the SOP tier only. Reg 172 parent notification triggers at the policy tier only, and only on a finalised version with both centre director and approved provider sign-off recorded, never on every edit.
- **Credentials are generic, not SOP-specific.** WWCC, external course completions (Gecko Training or equivalent), and any future credential type all live in one generic `credentials` table keyed to a `credential_types` lookup, not as one-off fields bolted onto users.
- **SRF training and any external course provider integrate through a webhook boundary, not a shared schema.** The Portal's compliance database does not contain public registration or payment logic. External completions write into `credentials` via a webhook endpoint. This preserves the same structural separation already applied to brand and entity (RSG kept absent from public Portal presence, SRF commercially distinct from the Portal).
- **MYOB, Xero, and NQAITS (National Quality Agenda IT System) are schema-ready placeholders in this phase, not live integrations.** `staff_import_records.source` accepts `myob` and `xero` as valid values now. No connector exists yet. The CSV import path is the only one built end to end initially. The NQAITS-aligned import/export template is a defined goal (help organisations pre-populate the worker register) but the field mapping is not finalised until a reference export has been supplied and reviewed.

## Tenants for this build

- **Ready Set Go (real)**: one organisation, two sites, Timboon and Mortlake. Seeded with real SOP and policy data (see `seed/rsg_policy_sop_seed.sql`, generated from the Policy to SOP Architecture v2 spreadsheet).
- **Science Kinder (dummy)**: one organisation, no real staff, no real sites populated beyond a placeholder. Exists solely to prove organisation-level RLS isolation actually holds before a real second customer is ever onboarded. Any cross-tenant query test should run against this pair.

## Admin tiers

- **Platform superuser** (Understorey Learning level): designs and builds the system itself, manages organisations, manages platform-level lookup tables (`credential_types`, `external_providers`).
- **Organisation admin** (approved provider or centre director tier): can assign or create SOP and policy templates within their own organisation. Cannot touch platform structure or see other organisations' data.

## Stack

- Next.js, deployed on Vercel
- Supabase (Postgres, Auth, Row Level Security), Sydney region
- Resend for transactional email (reminders, Reg 172 notifications)
- Auth method: TBC between email/password and magic link, lean toward whichever is more usable from a phone given educators are not desk-based

## Build sequence (do not reorder without discussion)

1. Schema and migrations, multi-tenant, including `credentials`, `staff_import_records`, `notification_rules`, `credential_types` seeded with WWCC and Gecko Training as placeholder rows
2. Seed script: Ready Set Go populated from the real spreadsheet data, Science Kinder created empty
3. One working SOP page with functional read-and-sign, no auth yet, hardcoded user against the RSG tenant
4. Supabase Auth and RLS, admin portal account creation (organisation admin can create staff accounts within their own org)
5. CSV bulk staff import (name, email, role, site, start date as baseline fields, expect additions once the NQAITS reference export is supplied)
6. Reminder engine (`notification_rules`): SOP incomplete, credential expiring, running on a scheduled job through Resend
7. Policy library, policy-SOP linking (many-to-many, several SOPs are governed by more than one policy), version cascade logic on update
8. Reg 172 notification trigger, policy tier only, dual sign-off gated
9. Credential tracking UI, director view of what is expiring across staff at their site(s)
10. Webhook receiver endpoint for external course completion, writing into `credentials` without touching core schema

Steps 1 to 5 are the minimum viable target for the 1 November staff training day, when all RSG staff need portal access. Steps 6 onward can follow.

## Explicitly deferred, do not build ahead of schedule

- Live MYOB or Xero sync
- Live NQAITS import/export (mapping pending reference file)
- Live Gecko Training integration (currently a named placeholder only)
- Live WWCC verification against any external register (placeholder field only, no automated check, this is a compliance-sensitive gap, do not imply it is live anywhere in the UI copy)
- SRF public registration and payment flow (lives outside this repo entirely, connects only via webhook)

## Style

Australian English spelling throughout in any user-facing copy or documentation generated by Claude Code (organise not organize, centre not center). No em dashes in generated documentation or commit messages where prose is used.
