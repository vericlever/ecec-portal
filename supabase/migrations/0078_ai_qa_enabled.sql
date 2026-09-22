-- 0078_ai_qa_enabled.sql
--
-- AI Staff Q&A. Per-tenant feature flag, off by default for any tenant
-- beyond RSG until confidence is established (spec, "Tenant and usage
-- controls"). Science Kinder (is_test_tenant) stays off too - it exists to
-- prove RLS isolation, not to pilot a paid AI feature.

alter table public.organisations
  add column ai_qa_enabled boolean not null default false;

update public.organisations
  set ai_qa_enabled = true
  where id = 'a0000000-0000-4000-8000-000000000001';
