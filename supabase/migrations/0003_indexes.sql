-- 0003_indexes.sql
-- Supporting indexes. Every organisation_id column is indexed because RLS
-- filters on it on every query. Foreign key columns used for joins and the
-- columns the reminder engine (step 6) and director views (step 9) will scan
-- are indexed here too.

-- sites
create index sites_organisation_id_idx on public.sites (organisation_id);

-- profiles
create index profiles_organisation_id_idx on public.profiles (organisation_id);
create index profiles_site_id_idx on public.profiles (site_id);
create index profiles_organisation_role_idx on public.profiles (organisation_id, role);
create index profiles_email_lower_idx on public.profiles (lower(email));

-- policies / sops
create index policies_organisation_id_idx on public.policies (organisation_id);
create index sops_organisation_id_idx on public.sops (organisation_id);

-- policy_sop_links
create index policy_sop_links_organisation_id_idx on public.policy_sop_links (organisation_id);
create index policy_sop_links_sop_id_idx on public.policy_sop_links (sop_id);

-- sign_offs
create index sign_offs_organisation_id_idx on public.sign_offs (organisation_id);
create index sign_offs_user_id_idx on public.sign_offs (user_id);
create index sign_offs_sop_id_idx on public.sign_offs (sop_id);
create index sign_offs_site_id_idx on public.sign_offs (site_id);

-- policy_approvals
create index policy_approvals_organisation_id_idx on public.policy_approvals (organisation_id);
create index policy_approvals_policy_id_idx on public.policy_approvals (policy_id);
create index policy_approvals_pending_notification_idx
  on public.policy_approvals (organisation_id)
  where finalised_at is not null and parent_notification_sent_at is null;

-- credentials
create index credentials_organisation_id_idx on public.credentials (organisation_id);
create index credentials_user_id_idx on public.credentials (user_id);
create index credentials_credential_type_id_idx on public.credentials (credential_type_id);
create index credentials_expiry_date_idx on public.credentials (expiry_date);

-- staff_import_records
create index staff_import_records_organisation_id_idx on public.staff_import_records (organisation_id);
create index staff_import_records_status_idx on public.staff_import_records (organisation_id, status);

-- notification_rules
create index notification_rules_organisation_id_idx on public.notification_rules (organisation_id);
create index notification_rules_active_idx
  on public.notification_rules (organisation_id, rule_type)
  where is_active;
