-- 0009_service_type_codes.sql
-- The NQAITS Worker Register's own data validation uses the codes CBC and FDC
-- for service type, not the long names. Align to that (the register is the
-- source of truth for these lists).

alter type public.service_type rename value 'Centre Based Day Care' to 'CBC';
alter type public.service_type rename value 'Family Day Care' to 'FDC';

alter table public.services alter column service_type set default 'CBC';

comment on column public.services.service_type is
  'CBC (Centre Based Day Care) or FDC (Family Day Care). NQAITS Worker Register code.';
