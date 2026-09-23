-- Step 57 follow-up. Every contract requires countersignature - there is no
-- longer a per-upload choice (the upload form's checkbox is gone). Backfill
-- any existing contract that was uploaded with the toggle off, then lock the
-- column at true so a direct insert/update can't reintroduce the choice.
update contracts set requires_countersign = true where requires_countersign = false;

alter table contracts
  add constraint contracts_requires_countersign_check check (requires_countersign = true);
