# RSG canonical import - review notes

Source: `RSG_All_Tiers_SOP_Inventory.xlsx` (SOP list, per your decision) plus
`1. Policies for Parents.docx` (parent-facing flag).

Counts: `policies.csv` 70, `sops.csv` 129, `policy_sop_links.csv` 56.

## Decisions taken

| # | Decision | Applied as |
|---|---|---|
| 1 | Every SOP has a sign-off type, defaulting to `self`. Supervisor-verified: Medication Handling, Sleep/Rest, Manual Handling, Anaphylaxis Response, Bottle/Breast Milk Prep, Child Protection (Educator), Psychosocial Hazard, Bushfire, Site Emergency - 9 in total, all Educator tier, from the inventory. Switchable per SOP in the admin view. | `sops.signoff_type` keeps `not null`, gains `default 'self'` in `0004`; non-Educator rows set to `self` |
| 2 | Add a document type. | `policies.document_type` added in `0004`; handbooks, procedures and disaster plans tagged accordingly |
| 3 | Keep both rows for the name-collision pairs, rely on easy admin deletion later. | Nothing merged. Deleting a policy in-app cascades to its links (schema already does this). |
| 4 | Policies and SOPs carry a site. Default `Multicampus` (applies at both sites). | `site` column in `policies.csv` and `sops.csv`; `policies.site_id` / `sops.site_id` added in `0004` |
| - | `sop_status` also blank for the four non-Educator tiers (same reasoning as 1). | `sops.status` made nullable in `0004` |
| - | Gap SOPs and not-yet-written policies are imported as records so the portal shows what is outstanding. | 17 Educator gap SOPs, 6 `must_be_written` / `does_not_exist` policies included |
| - | Educator gap-SOP PRIORITY 1/2/3 pulled from the notes into `sops.priority`. | done |
| - | Director-tab source typos fixed (Leaderhsip, Peformance, Pitstop Conservations, Maitenance, "Well being"). | fixed in `sops.csv` |

## Left in deliberately (per decision 3) - resolve in-app when convenient

Probably the same document under two names:

| Row A | Row B |
|---|---|
| `Nutrition and Oral Health Policy` (governs a SOP) | `Healthy Eating & Oral Policy` (parent list) |
| `Immunisation` (governs a SOP) | parent list `Immunisation Policy` |
| `Sick Children Policy` | parent list `Sick Children` |

`CCTV Policy` and `CCTV Policy Timboon` are NOT a duplicate: they are two
site-specific policies (`CCTV Policy` = Mortlake, `CCTV Policy Timboon` = Timboon).
Confirm that mapping in `policies.csv`.

### Site column

Fill the `site` column in `policies.csv` and `sops.csv` for anything that is one
site only. `Multicampus` (the default) means it shows at both sites. Pre-filled:

| Document | Site |
|---|---|
| CCTV Policy | Mortlake |
| CCTV Policy Timboon | Timboon |
| Disaster Plan Timboon | Timboon |
| Disaster Plan Mortlake | Mortlake |
| RSG PARENT HANDBOOK Timboon | Timboon |
| RSG HANDBOOK Mortlake | Mortlake |

All 129 SOPs are currently `Multicampus`. Flag any that are Timboon-only or
Mortlake-only (for example a site-specific disaster response).

Genuinely distinct or not, your call:

| Rows |
|---|
| `Complaint Procedure`, `Complaints and Feedback Policy`, `Procedure for Dealing with Complaints` |
| `Emergency Evacuation Policy` (parent list, no SOP link) vs the "Emergency and Evacuation Policy" the Director SOPs imply |

Possible duplicate SOP (Director tab), near-identical QA and Child Safe mapping:
`Hazards Maintenance and Repairs` and `Hazard Maintenance Management`. Both imported.

Four `policies.csv` rows are handbooks, not policies: `RSG PARENT HANDBOOK Timboon`,
`RSG HANDBOOK Mortlake`, `Kinder Handbook RSG June`, and the payment handbooks.
Imported with `document_type = handbook` so they can be filtered or removed.

## Not used

`Policy_SOP_Connections.xlsx` has candidate policy links for the Room Leader,
Educational Leader and Director tiers with confidence ratings. Not used, per your
decision to work from the inventory file. Say the word if you want them folded in
as a lower-confidence starting set rather than linking those tiers by hand.
