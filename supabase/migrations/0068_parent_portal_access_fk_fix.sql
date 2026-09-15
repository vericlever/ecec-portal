-- 0068_parent_portal_access_fk_fix.sql
--
-- 0067 left service_parent_access.service_id as a plain FK to services(id),
-- with nothing tying it to the SAME organisation_id as the row itself. The
-- write RLS policy only checks is_admin(organisation_id) - it has no way to
-- also verify service_id actually belongs to that organisation, so a bug
-- upstream (or a malformed call) could otherwise write a row pairing one
-- org's organisation_id with another org's service_id. Every other child
-- table in this schema that references a service closes this with a
-- composite FK to services(id, organisation_id) (see job_role_sops in
-- 0007_access_tiers.sql); this table should have had the same guarantee from
-- the start.

alter table public.service_parent_access
  drop constraint service_parent_access_service_id_fkey;

alter table public.service_parent_access
  add constraint service_parent_access_service_id_fkey
  foreign key (service_id, organisation_id)
  references public.services (id, organisation_id)
  on delete cascade;
