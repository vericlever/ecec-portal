-- 0041_fix_import_documents_fn.sql
--
-- import_documents() (migration 0005) predates several breaking schema
-- changes and no longer runs:
--   * it queries public.sites, renamed public.services in migration 0007
--     (site_id -> service_id on policies and sops);
--   * its SOP upsert targets ON CONFLICT (organisation_id, target_tier, name),
--     a constraint migration 0024 dropped - SOPs are unique on
--     (organisation_id, name) only since;
--   * its authorisation check calls public.has_org_admin_access(), which
--     migration 0007's RLS rewrite replaced with public.is_admin();
--   * its accepted signoff_type values are 'self' and 'supervisor', but
--     migration 0023 renamed 'supervisor' to 'self_and_manager'. Historical
--     payloads (supabase/import/rsg/rsg_import.sql) still say "supervisor",
--     so this function maps it forward rather than requiring every payload
--     to be edited.
--
-- Behaviour is otherwise unchanged - see 0005's header comment.

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
  v_service_id uuid;
  v_service_name text;
  v_sop_id uuid;
  v_policy_id uuid;
  v_signoff text;
begin
  if (select auth.uid()) is not null
     and not public.is_admin(p_organisation_id) then
    raise exception 'not authorised to import documents for organisation %', p_organisation_id;
  end if;

  if not exists (select 1 from public.organisations where id = p_organisation_id) then
    raise exception 'organisation % does not exist', p_organisation_id;
  end if;

  -- Policies -------------------------------------------------------------
  for v_policy in
    select value from jsonb_array_elements(coalesce(p_payload->'policies', '[]'::jsonb))
  loop
    v_service_id := null;
    v_service_name := nullif(trim(v_policy->>'site'), '');
    if v_service_name is not null and lower(v_service_name) <> 'multicampus' then
      v_service_id := (
        select s.id from public.services s
        where s.organisation_id = p_organisation_id and s.name = v_service_name
        limit 1
      );
      if v_service_id is null then
        v_warnings := v_warnings || format('policy "%s": unknown site "%s", imported as multicampus',
          v_policy->>'name', v_service_name);
      end if;
    end if;

    insert into public.policies (
      organisation_id, name, status, is_parent_facing, document_type, program, service_id, metadata
    ) values (
      p_organisation_id,
      v_policy->>'name',
      coalesce(nullif(v_policy->>'status', '')::public.policy_status, 'in_library'),
      coalesce(nullif(v_policy->>'is_parent_facing', '')::boolean, false),
      coalesce(nullif(v_policy->>'document_type', ''), 'policy'),
      nullif(v_policy->>'program', ''),
      v_service_id,
      coalesce(v_policy->'metadata', '{}'::jsonb)
    )
    on conflict (organisation_id, name) do update set
      status           = excluded.status,
      is_parent_facing = excluded.is_parent_facing,
      document_type    = excluded.document_type,
      program          = excluded.program,
      service_id       = excluded.service_id,
      metadata         = excluded.metadata;
    v_policies_upserted := v_policies_upserted + 1;
  end loop;

  -- SOPs ----------------------------------------------------------------
  for v_sop in
    select value from jsonb_array_elements(coalesce(p_payload->'sops', '[]'::jsonb))
  loop
    v_service_id := null;
    v_service_name := nullif(trim(v_sop->>'site'), '');
    if v_service_name is not null and lower(v_service_name) <> 'multicampus' then
      v_service_id := (
        select s.id from public.services s
        where s.organisation_id = p_organisation_id and s.name = v_service_name
        limit 1
      );
      if v_service_id is null then
        v_warnings := v_warnings || format('sop "%s": unknown site "%s", imported as multicampus',
          v_sop->>'name', v_service_name);
      end if;
    end if;

    -- Historical payloads say "supervisor"; the enum has said
    -- "self_and_manager" since migration 0023.
    v_signoff := nullif(v_sop->>'signoff_type', '');
    if v_signoff = 'supervisor' then
      v_signoff := 'self_and_manager';
    end if;

    insert into public.sops (
      organisation_id, name, target_tier, service_id, status, signoff_type, priority, notes, metadata
    ) values (
      p_organisation_id,
      v_sop->>'name',
      (v_sop->>'target_tier')::public.sop_tier,
      v_service_id,
      nullif(v_sop->>'status', '')::public.sop_status,
      coalesce(v_signoff::public.signoff_type, 'self'),
      nullif(v_sop->>'priority', '')::int,
      nullif(v_sop->>'notes', ''),
      coalesce(v_sop->'metadata', '{}'::jsonb)
    )
    on conflict (organisation_id, name) do update set
      target_tier  = excluded.target_tier,
      service_id   = excluded.service_id,
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
        'unresolved link: %s -> %s',
        v_link->>'sop_name', v_link->>'policy_name'
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
