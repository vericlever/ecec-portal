-- 0005_import_documents_fn.sql
-- Generic document importer.
--
-- One organisation's policies, SOPs and policy-SOP links arrive as a jsonb
-- payload and are upserted under that organisation. This is the mechanism every
-- provider uses to bring their library in: the RSG bootstrap calls it once from
-- the SQL editor, and the admin UI (later) parses an uploaded spreadsheet into
-- the same payload and calls it over RPC.
--
-- Behaviour:
--   * Additive upsert. Policies match on (organisation_id, name); SOPs on
--     (organisation_id, target_tier, name); links on (policy_id, sop_id).
--   * Never deletes. Removing a document is a separate admin action.
--   * "site": omitted, empty or "multicampus" means the document applies at every
--     site. Any other value is resolved to a site of that name in the
--     organisation; an unknown site name is reported in warnings and the document
--     still imports as multicampus.
--   * A link whose SOP or policy name does not resolve is skipped and reported in
--     warnings, not fatal.
--   * The whole call is one transaction: any raised error rolls it all back.
--
-- Security: invoker rights. A trusted psql/service-role session bypasses RLS.
-- A UI caller is subject to RLS, which already restricts these writes to
-- organisation admins; the explicit check below is only for a clearer error.

create or replace function public.import_documents(
  p_organisation_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_policy jsonb;
  v_sop jsonb;
  v_link jsonb;
  v_policies_upserted int := 0;
  v_sops_upserted int := 0;
  v_links_upserted int := 0;
  v_warnings text[] := '{}';
  v_site_id uuid;
  v_site_name text;
  v_sop_id uuid;
  v_policy_id uuid;
begin
  if (select auth.uid()) is not null
     and not public.has_org_admin_access(p_organisation_id) then
    raise exception 'not authorised to import documents for organisation %', p_organisation_id;
  end if;

  if not exists (select 1 from public.organisations where id = p_organisation_id) then
    raise exception 'organisation % does not exist', p_organisation_id;
  end if;

  -- Policies -------------------------------------------------------------
  for v_policy in
    select value from jsonb_array_elements(coalesce(p_payload->'policies', '[]'::jsonb))
  loop
    v_site_id := null;
    v_site_name := nullif(trim(v_policy->>'site'), '');
    if v_site_name is not null and lower(v_site_name) <> 'multicampus' then
      v_site_id := (
        select s.id from public.sites s
        where s.organisation_id = p_organisation_id and s.name = v_site_name
        limit 1
      );
      if v_site_id is null then
        v_warnings := v_warnings || format('policy "%s": unknown site "%s", imported as multicampus',
          v_policy->>'name', v_site_name);
      end if;
    end if;

    insert into public.policies (
      organisation_id, name, status, is_parent_facing, document_type, program, site_id, metadata
    ) values (
      p_organisation_id,
      v_policy->>'name',
      coalesce(nullif(v_policy->>'status', '')::public.policy_status, 'in_library'),
      coalesce(nullif(v_policy->>'is_parent_facing', '')::boolean, false),
      coalesce(nullif(v_policy->>'document_type', ''), 'policy'),
      nullif(v_policy->>'program', ''),
      v_site_id,
      coalesce(v_policy->'metadata', '{}'::jsonb)
    )
    on conflict (organisation_id, name) do update set
      status           = excluded.status,
      is_parent_facing = excluded.is_parent_facing,
      document_type    = excluded.document_type,
      program          = excluded.program,
      site_id          = excluded.site_id,
      metadata         = excluded.metadata;
    v_policies_upserted := v_policies_upserted + 1;
  end loop;

  -- SOPs ----------------------------------------------------------------
  for v_sop in
    select value from jsonb_array_elements(coalesce(p_payload->'sops', '[]'::jsonb))
  loop
    v_site_id := null;
    v_site_name := nullif(trim(v_sop->>'site'), '');
    if v_site_name is not null and lower(v_site_name) <> 'multicampus' then
      v_site_id := (
        select s.id from public.sites s
        where s.organisation_id = p_organisation_id and s.name = v_site_name
        limit 1
      );
      if v_site_id is null then
        v_warnings := v_warnings || format('sop "%s": unknown site "%s", imported as multicampus',
          v_sop->>'name', v_site_name);
      end if;
    end if;

    insert into public.sops (
      organisation_id, name, target_tier, site_id, status, signoff_type, priority, notes, metadata
    ) values (
      p_organisation_id,
      v_sop->>'name',
      (v_sop->>'target_tier')::public.sop_tier,
      v_site_id,
      nullif(v_sop->>'status', '')::public.sop_status,
      coalesce(nullif(v_sop->>'signoff_type', '')::public.signoff_type, 'self'),
      nullif(v_sop->>'priority', '')::int,
      nullif(v_sop->>'notes', ''),
      coalesce(v_sop->'metadata', '{}'::jsonb)
    )
    on conflict (organisation_id, target_tier, name) do update set
      site_id      = excluded.site_id,
      status       = excluded.status,
      signoff_type = excluded.signoff_type,
      priority     = excluded.priority,
      notes        = excluded.notes,
      metadata     = excluded.metadata;
    v_sops_upserted := v_sops_upserted + 1;
  end loop;

  -- Links -------------------------------------------------------------
  for v_link in
    select value from jsonb_array_elements(coalesce(p_payload->'links', '[]'::jsonb))
  loop
    v_sop_id := (
      select sp.id from public.sops sp
      where sp.organisation_id = p_organisation_id
        and sp.target_tier = (v_link->>'sop_tier')::public.sop_tier
        and sp.name = v_link->>'sop_name'
      limit 1
    );

    v_policy_id := (
      select pol.id from public.policies pol
      where pol.organisation_id = p_organisation_id
        and pol.name = v_link->>'policy_name'
      limit 1
    );

    if v_sop_id is null or v_policy_id is null then
      v_warnings := v_warnings || format(
        'unresolved link: %s / %s -> %s',
        v_link->>'sop_tier', v_link->>'sop_name', v_link->>'policy_name'
      );
      continue;
    end if;

    insert into public.policy_sop_links (organisation_id, policy_id, sop_id, confidence, note)
    values (
      p_organisation_id, v_policy_id, v_sop_id,
      nullif(v_link->>'confidence', ''), nullif(v_link->>'note', '')
    )
    on conflict (policy_id, sop_id) do update set
      confidence = excluded.confidence,
      note       = excluded.note;
    v_links_upserted := v_links_upserted + 1;
  end loop;

  return jsonb_build_object(
    'organisation_id',   p_organisation_id,
    'policies_upserted', v_policies_upserted,
    'sops_upserted',     v_sops_upserted,
    'links_upserted',    v_links_upserted,
    'warnings',          to_jsonb(v_warnings)
  );
end;
$$;

grant execute on function public.import_documents(uuid, jsonb) to authenticated;
