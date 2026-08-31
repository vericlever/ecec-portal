# RSG document import

Bootstraps the Ready Set Go tenant's policy and SOP library. RSG has a training
day before the in-app policy editor exists, so its content is imported once now
through the same `import_documents()` function the admin UI will call later.

## Files

| File | What it is |
|---|---|
| `policies.csv` | 70 policy-tier documents. Editable source of truth. `site` column: `Multicampus` or a site name. |
| `sops.csv` | 129 SOPs across five role tiers. Editable source of truth. `site` column as above. |
| `policy_sop_links.csv` | 56 SOP-to-policy links (Educator tier only). Editable source of truth. |
| `build_payload.ps1` | Regenerates the two files below from the three CSVs. |
| `rsg_documents.json` | Generated payload. Do not edit by hand. |
| `rsg_import.sql` | Generated `select import_documents(...)` call. Do not edit by hand. |
| `REVIEW_NOTES.md` | Decisions taken and open items. |

The CSVs were extracted from `RSG_All_Tiers_SOP_Inventory.xlsx` (SOP list, tiers,
Educator-tier status and sign-off) and `1. Policies for Parents.docx` (the
`is_parent_facing` flag), then reconciled.

## Apply order

1. Migrations `0001`-`0005`.
2. `../../seed/0001_tenants.sql` (creates the RSG organisation this import targets).
3. `rsg_import.sql`.

Run `rsg_import.sql` in the Supabase SQL editor. It returns a summary:

```json
{ "policies_upserted": 70, "sops_upserted": 129, "links_upserted": 56, "link_warnings": [] }
```

Any name in `link_warnings` is a link whose SOP or policy title did not match;
fix the CSV and re-run.

## Editing and re-running

The import is an additive upsert keyed on document name (SOPs also on tier). It
never deletes. To change the library:

- **Edit a CSV**, then `powershell -File build_payload.ps1`, then re-run
  `rsg_import.sql`. Changed rows are updated in place.
- **Remove a document**: delete it in the app (admin), or by hand in SQL. Taking
  a row out of the CSV does not remove it from the database.

## Known follow-ups

- SOP bodies are not imported. Every SOP lands with an empty body for RSG to
  write and upload.
- Room Leader / Educational Leader / Director / Finance & Admin SOPs have no
  `sop_status`, `signoff_type` or policy links yet. Those get set in the app.
- See `REVIEW_NOTES.md` for the name collisions left in deliberately.
