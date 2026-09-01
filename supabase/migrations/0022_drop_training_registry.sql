-- 0022_drop_training_registry.sql
--
-- Removes the training.gov.au register mirror added in 0016/0018. The
-- autocomplete it fed was low value for the number of times it runs (once per
-- staff member at onboarding), and keeping the data current needed a
-- training.gov.au feed that was never worth setting up. The RTO name, RTO
-- number and course code fields on onboarding stay as plain text.
--
-- Nothing else references these objects: no foreign keys point at them, no
-- other table's row-level security policy mentions them, and they share no
-- enum or function with the rest of the schema. Dropping the tables also drops
-- their own policies and indexes.

drop function if exists public.search_rto_registry(text);
drop function if exists public.search_training_components(text, text);

drop table if exists public.registry_refreshes;
drop table if exists public.training_components;
drop table if exists public.rto_registry;
