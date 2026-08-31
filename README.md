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

### App (step 3: one working SOP page)

Requires Node.js 18.18+ and the database set up.

```bash
npm install
cp .env.local.example .env.local        # then set DATABASE_URL
npm run dev
```

`DATABASE_URL` is the Supabase **session pooler** connection string (dashboard →
Project Settings → Database → Connection string → "Session pooler"). Step 3 has
no auth, so it queries Postgres directly, scoped to the RSG organisation in SQL.
Step 4 switches to the Supabase auth client with row-level security.

Also run the dev-only seeds once (Supabase SQL editor):
`supabase/seed/0002_dev_user.sql` and `supabase/seed/0003_dev_sop_body.sql`.

Open http://localhost:3000 - it redirects to `/sops`. Open **Nappy Changing and
Toilet Training** (the one SOP with real content so far), read it, tick the box,
Sign. A `sign_offs` row is written and the page shows the signed state on
refresh. Everything runs as one hardcoded test educator (zeke@readyset.au)
against the Ready Set Go tenant (`src/lib/constants.ts`).

## License

Proprietary — all rights reserved.
