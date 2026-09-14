-- Step 48: search on /admin/sops and /admin/policies. At 139 procedures and
-- 71 policies (soon triple that once the Educator suite restoration lands)
-- a flat alphabetical scroll with client-side filtering does not hold up.
-- Trigram index makes ILIKE '%term%' searches on title use an index rather
-- than a sequential scan.

create extension if not exists pg_trgm;

create index if not exists sops_name_trgm_idx on public.sops using gin (name gin_trgm_ops);
create index if not exists policies_name_trgm_idx on public.policies using gin (name gin_trgm_ops);
