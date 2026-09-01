-- 0015_import_source_json.sql
-- The bulk staff import (step 5d) accepts a delimited file or a JSON file.
-- staff_import_records.source only allowed 'csv' among the file paths; add
-- 'json' so the provenance of each imported row is recorded honestly.

alter table public.staff_import_records
  drop constraint staff_import_records_source_check;

alter table public.staff_import_records
  add constraint staff_import_records_source_check
  check (source in ('manual', 'csv', 'json', 'myob', 'xero', 'nqaits'));
