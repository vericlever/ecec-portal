-- 0042_contract_signatures.sql
--
-- Step 39. Revises the contract signing mechanism from Step 11/17
-- (contracts.signed_at / signed_name, a tick-box), adding a second,
-- independent countersignature slot and a hash of the exact document each
-- signature was taken against. A contract with only the employee slot filled
-- is queryable as not fully executed - both slots stay separate, never a
-- single signed/unsigned flag.
--
-- Deed carve-out (Zeke's decision, see BUILD_TAGGING_AND_REPORTS.md): a
-- typed name is not necessarily sufficient execution for a document drafted
-- as a deed (which generally needs an attesting witness). is_deed is set by
-- HR/Admin on upload; a deed row is never offered for in-app typed-name
-- signing on either slot and is reported as "signed on paper", not unsigned.
--
-- No contracts have been signed in-app yet (per the spec), so this applies
-- going forward only - no backfill of signed_at rows against the new hash
-- columns.

alter table public.contracts
  add column is_deed boolean not null default false,
  add column signed_by uuid references public.profiles(id) on delete set null,
  add column signed_content_hash text,
  add column countersigned_at timestamptz,
  add column countersigned_name text,
  add column countersigned_by uuid references public.profiles(id) on delete set null,
  add column countersigned_content_hash text;

comment on column public.contracts.is_deed is
  'Set by HR/Admin on upload. True means this contract is a deed and must be signed on paper - the in-app typed-name signature is not offered for it.';
comment on column public.contracts.countersigned_at is
  'HR manager or Admin countersignature, independent of the employee signature. Full execution = signed_at is not null and countersigned_at is not null.';
