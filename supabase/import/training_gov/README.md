# training.gov.au register - local mirror (step 5e)

The Portal keeps a local copy of the training.gov.au National Register so the
onboarding and bulk-import forms can autocomplete and lightly check the **RTO
number** and **course code** fields. Nothing calls training.gov.au at request
time. There is no scraping.

## Tables

- `rto_registry` - registered training organisations, keyed by RTO code
- `training_components` - qualifications, units, skill sets and accredited
  courses, keyed by national code
- `registry_refreshes` - one row per import run

All three are platform-level (not organisation-scoped). Any signed-in user can
read them; only the service-role importer writes.

## Refreshing

`/admin/registry` (Admin only): upload a delimited extract, choose RTOs or
components, Import. Rows are upserted by code, so re-running is safe and picks
up changes. Intended cadence: monthly.

### Expected columns

Headers are matched loosely (case and punctuation ignored), so most extract
formats work. The importer needs at least:

| Extract | Required | Also read if present |
|---|---|---|
| RTOs | a code column (`Code`, `RTO Code`, `TOID`) and a name column (`Legal Name`, `Name`) | `Trading Name`, `Status`, `State`, `Last Modified` |
| Components | a code column (`Code`) and a title column (`Title`) | `Component Type` / `Category`, `Status`, `Last Modified` |

If the component type column is missing, it is guessed from the code shape
(3 letters + 5 digits = qualification, digits + state letters = accredited
course, otherwise unit).

## Where the extract comes from

**Not yet confirmed.** training.gov.au publishes bulk data; the exact file and
URL to use for the monthly pull needs to be settled (candidates: the
training.gov.au bulk extract via its web service, or a data.gov.au dataset).
Until then the tables carry a small starter seed (the stable ECEC qualification
and first-aid unit codes, plus the three RTOs the seeded RSG staff reference).

Once the source is fixed, a scheduled job (e.g. a Vercel cron) can fetch it and
POST to the same import path the `/admin/registry` page uses.
