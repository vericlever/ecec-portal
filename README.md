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

_Setup instructions to be added once the initial migration and app scaffold are committed._

## License

Proprietary — all rights reserved.
