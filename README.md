# ECEC Portal

A multi-tenant staff compliance and training platform for Australian early childhood education and care (ECEC) providers.

> **Status:** Pre-MVP. Core schema and Steps 1–5 (minimum viable staff access) targeted for **1 November**, tied to a scheduled training day.

## What this is

The Portal sits between static document libraries (e.g. Childcare Centre Desktop's original model) and full LMS platforms (e.g. Employment Hero). It's built as a portable, independently saleable B2B SaaS product — not an internal tool for a single provider.

The differentiation is depth: SOP comprehension, audit capability, and staff knowledge-building, rather than just a document sign-off tracker.

- **Regulatory context:** Australian NQF, Regulation 168 (staff training/sign-off), Regulation 172 (parent notification), ACECQA, NQS Quality Areas
- **First tenant:** Ready Set Go (RSG) — sites at Timboon and Mortlake
- **Test tenant:** Science Kinder (used to verify organisational isolation)
- **Longer-term markets:** UK, US

## Architecture

### Multi-tenancy
Every table carries `organisation_id` and `site_id` from migration 1. Row-Level Security (RLS) enforces tenant isolation at the database layer.

### Two-tier document model (do not conflate)

| | Policies | SOPs |
|---|---|---|
| Role | Higher-level governing documents | Operational documents staff train on |
| Audience | Parent-facing obligations, sit behind the scenes | Staff, direct sign-off |
| Relationship | Many-to-many with SOPs | Many-to-many with Policies |
| Key features | Approval workflow before publish; triggers parent email notification (Reg 172) on approved/finalised versions only | Read-and-sign, optional text-to-speech readout, optional comprehension check questions, click-through links back to source policies |

Parent notifications are a policy-tier feature only, and fire only once a policy is signed off by both the Centre Director and the Approved Provider/admin — not on every edit.

## Stack

- **Frontend/Backend:** Next.js
- **Database/Auth:** Supabase (Sydney region)
- **Hosting:** Vercel
- **Email:** Resend
- **Build tooling:** Claude Code

## Scope

**In scope now:**
- Multi-tenant schema (`0001_init_schema.sql`) — orgs, sites, policies, SOPs, credentials, notification infrastructure
- Generic credential tracking (WWCC, external providers e.g. Gecko Training)
- CSV bulk staff import aligned with NQAITS field structure
- Policy ↔ SOP relationships, sign-off, and parent notification workflow

**Explicitly deferred (schema-ready, not built):**
- MYOB / Xero integration
- NQAITS live integration
- SRF registration/payment
- Extended credential and notification infrastructure beyond MVP

## Getting started

### Database

See `supabase/README.md`. Apply the migrations, then `supabase/seed/0001_tenants.sql`
and `supabase/import/rsg/rsg_import.sql`.

### App

Requires Node.js 18.18+ and the database set up.

```bash
npm install
cp .env.local.example .env.local   # then fill NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

Both keys come from the Supabase dashboard → Project Settings → API.

**Accounts.** In the dashboard → Authentication → Users, add `zeke@readyset.au`
with a password (Auto Confirm on). Then run `supabase/seed/0002_dev_user.sql` to
give it an approved-provider profile at Ready Set Go, and
`supabase/seed/0003_dev_sop_body.sql` for the sample SOP content. Optionally
`supabase/seed/0004_isolation_check.sql` to make cross-tenant isolation testable.

**Auth model.** Every normal query runs through `@supabase/ssr` under the
signed-in user's session, so row-level security scopes it to their
organisation. The service-role key is used only by the admin staff-creation
flow. Middleware redirects unauthenticated requests to `/login`.

Open http://localhost:3000 → `/login`. Sign in as `zeke@readyset.au`. The SOP
list and read-and-sign work as before, now under a real session. As an admin you
also get **Staff** → **Add staff member**, which creates an account in your own
organisation and hands back a temporary password.

## License

Proprietary — all rights reserved.
