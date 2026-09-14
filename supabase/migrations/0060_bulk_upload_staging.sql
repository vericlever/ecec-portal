-- Step 47: bulk upload review and duplicate detection.
--
-- Today bulkImportSops/bulkImportPolicies write real sops/policies rows (plus
-- a real documents row and Storage object) the moment a file is uploaded -
-- before anyone has reviewed anything. This table is the fix: a file is
-- parsed and stored, but nothing durable is created in sops/policies until
-- an explicit commit. Cancelling a batch, or abandoning the browser tab,
-- leaves the library untouched either way.
--
-- The commit itself has to be all-or-nothing across several tables (the
-- entity row, its documents row, its role/category/link rows), which plain
-- RLS-scoped inserts cannot express as a single atomic unit - so, per the
-- project's standing rule (RLS is the enforcement layer; where it cannot
-- express the shape, write a SECURITY DEFINER function and call it with
-- .rpc() rather than reaching for the service-role client), the commit is
-- two SECURITY DEFINER functions below, one per content kind, each
-- re-verifying can_edit_content() itself since SECURITY DEFINER bypasses RLS.

create table public.bulk_upload_staging (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  batch_id uuid not null,
  kind text not null check (kind in ('sop', 'policy')),
  original_filename text not null,
  derived_title text not null,
  storage_path text not null,
  mime_type text,
  byte_size integer,
  extracted_text text,
  extraction_note text,
  duplicate_of_id uuid,
  duplicate_of_name text,
  duplicate_score numeric,
  filename_flag boolean not null default false,
  blank_flag boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'committed', 'discarded')),
  committed_object_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index bulk_upload_staging_batch_idx on public.bulk_upload_staging (batch_id);
create index bulk_upload_staging_org_idx on public.bulk_upload_staging (organisation_id);

comment on table public.bulk_upload_staging is
  'Step 47. One row per uploaded file, parsed and stored but not yet a real sops/policies row. A batch_id groups one upload session; nothing in sops/policies/documents exists for a row until commit_bulk_sops/commit_bulk_policies processes it.';

alter table public.bulk_upload_staging enable row level security;

create policy bulk_upload_staging_select on public.bulk_upload_staging
  for select using (public.can_edit_content(organisation_id));
create policy bulk_upload_staging_write on public.bulk_upload_staging
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

-- ---------------------------------------------------------------------------
-- commit_bulk_sops
-- ---------------------------------------------------------------------------
-- p_items: jsonb array of
--   { staging_id, action ('create'|'skip'|'replace'), title,
--     job_role_ids (uuid[]), service_id, category_id, signoff_type,
--     review_period_months, signing_window, linked_policy_ids (uuid[]),
--     publish (bool), replace_target_id (uuid, required when action=replace) }
create or replace function public.commit_bulk_sops(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_row public.bulk_upload_staging%rowtype;
  v_new_id uuid;
  v_doc_id uuid;
  v_role_id uuid;
  v_policy_id uuid;
  v_created int := 0;
  v_replaced int := 0;
  v_skipped int := 0;
  v_flagged int := 0;
  v_touched_roles uuid[] := '{}';
  v_next_version int;
begin
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_row from public.bulk_upload_staging
      where id = (v_item->>'staging_id')::uuid
        and kind = 'sop'
        and status = 'pending';
    if not found then
      raise exception 'Staging row % not found or already processed', v_item->>'staging_id';
    end if;

    v_org := v_row.organisation_id;
    if not public.can_edit_content(v_org) then
      raise exception 'Not permitted to commit into organisation %', v_org;
    end if;

    if v_row.duplicate_of_id is not null or v_row.filename_flag or v_row.blank_flag then
      v_flagged := v_flagged + 1;
    end if;

    if v_item->>'action' = 'skip' then
      update public.bulk_upload_staging set status = 'discarded' where id = v_row.id;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_item->>'action' = 'replace' then
      v_new_id := (v_item->>'replace_target_id')::uuid;
      if v_new_id is null or not exists (
        select 1 from public.sops where id = v_new_id and organisation_id = v_org
      ) then
        raise exception 'Replace target % not found in this organisation', v_new_id;
      end if;

      update public.sops set
        name = coalesce(nullif(v_item->>'title', ''), name),
        body = coalesce(v_row.extracted_text, body),
        category_id = nullif(v_item->>'category_id', '')::uuid,
        service_id = nullif(v_item->>'service_id', '')::uuid,
        signing_window = coalesce(v_item->>'signing_window', signing_window),
        review_period_months = coalesce((v_item->>'review_period_months')::int, review_period_months),
        updated_by = v_actor
      where id = v_new_id;

      if (v_item->>'publish')::boolean and v_row.extracted_text is not null and trim(v_row.extracted_text) <> '' then
        select coalesce(published_version, 0) + 1 into v_next_version from public.sops where id = v_new_id;
        update public.sops set
          published_version = v_next_version,
          published_body = v_row.extracted_text,
          published_at = now(),
          published_by = v_actor,
          current_version = v_next_version
        where id = v_new_id;
      end if;

      insert into public.documents (
        organisation_id, owner_type, owner_id, file_name, mime_type, byte_size,
        storage_path, extracted_text, extraction_note, uploaded_by
      ) values (
        v_org, 'sop', v_new_id, v_row.original_filename, v_row.mime_type, v_row.byte_size,
        v_row.storage_path, v_row.extracted_text, v_row.extraction_note, v_actor
      ) returning id into v_doc_id;
      update public.sops set source_document_id = v_doc_id where id = v_new_id;

      for v_role_id in select jsonb_array_elements_text(coalesce(v_item->'job_role_ids', '[]'::jsonb))::uuid
      loop
        insert into public.job_role_sops (organisation_id, job_role_id, sop_id)
          values (v_org, v_role_id, v_new_id)
          on conflict do nothing;
        v_touched_roles := array_append(v_touched_roles, v_role_id);
      end loop;

      for v_policy_id in select jsonb_array_elements_text(coalesce(v_item->'linked_policy_ids', '[]'::jsonb))::uuid
      loop
        insert into public.policy_sop_links (organisation_id, policy_id, sop_id)
          values (v_org, v_policy_id, v_new_id)
          on conflict do nothing;
      end loop;

      update public.bulk_upload_staging set status = 'committed', committed_object_id = v_new_id where id = v_row.id;
      v_replaced := v_replaced + 1;
      continue;
    end if;

    -- action = 'create'
    insert into public.sops (
      organisation_id, name, status, signoff_type, category_id, service_id,
      review_period_months, signing_window, body, updated_by
    ) values (
      v_org,
      coalesce(nullif(v_item->>'title', ''), v_row.derived_title),
      null,
      coalesce(v_item->>'signoff_type', 'self')::public.signoff_type,
      nullif(v_item->>'category_id', '')::uuid,
      nullif(v_item->>'service_id', '')::uuid,
      coalesce((v_item->>'review_period_months')::int, 6),
      coalesce(v_item->>'signing_window', 'week'),
      v_row.extracted_text,
      v_actor
    ) returning id into v_new_id;

    if (v_item->>'publish')::boolean and v_row.extracted_text is not null and trim(v_row.extracted_text) <> '' then
      update public.sops set
        published_version = 1,
        published_body = v_row.extracted_text,
        published_at = now(),
        published_by = v_actor,
        current_version = 1
      where id = v_new_id;
    end if;

    insert into public.documents (
      organisation_id, owner_type, owner_id, file_name, mime_type, byte_size,
      storage_path, extracted_text, extraction_note, uploaded_by
    ) values (
      v_org, 'sop', v_new_id, v_row.original_filename, v_row.mime_type, v_row.byte_size,
      v_row.storage_path, v_row.extracted_text, v_row.extraction_note, v_actor
    ) returning id into v_doc_id;
    update public.sops set source_document_id = v_doc_id where id = v_new_id;

    for v_role_id in select jsonb_array_elements_text(coalesce(v_item->'job_role_ids', '[]'::jsonb))::uuid
    loop
      insert into public.job_role_sops (organisation_id, job_role_id, sop_id)
        values (v_org, v_role_id, v_new_id)
        on conflict do nothing;
      v_touched_roles := array_append(v_touched_roles, v_role_id);
    end loop;

    for v_policy_id in select jsonb_array_elements_text(coalesce(v_item->'linked_policy_ids', '[]'::jsonb))::uuid
    loop
      insert into public.policy_sop_links (organisation_id, policy_id, sop_id)
        values (v_org, v_policy_id, v_new_id)
        on conflict do nothing;
    end loop;

    update public.bulk_upload_staging set status = 'committed', committed_object_id = v_new_id where id = v_row.id;
    v_created := v_created + 1;
  end loop;

  -- A role that gained SOPs is no longer a placeholder.
  update public.job_roles set is_placeholder = false
    where id = any(v_touched_roles) and is_placeholder;

  return jsonb_build_object(
    'created', v_created, 'replaced', v_replaced, 'skipped', v_skipped, 'flagged', v_flagged
  );
end;
$$;

grant execute on function public.commit_bulk_sops(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- commit_bulk_policies - same shape, policies + policy_category_links
-- ---------------------------------------------------------------------------
create or replace function public.commit_bulk_policies(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_row public.bulk_upload_staging%rowtype;
  v_new_id uuid;
  v_doc_id uuid;
  v_category_id uuid;
  v_sop_id uuid;
  v_created int := 0;
  v_replaced int := 0;
  v_skipped int := 0;
  v_flagged int := 0;
  v_next_version int;
begin
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_row from public.bulk_upload_staging
      where id = (v_item->>'staging_id')::uuid
        and kind = 'policy'
        and status = 'pending';
    if not found then
      raise exception 'Staging row % not found or already processed', v_item->>'staging_id';
    end if;

    v_org := v_row.organisation_id;
    if not public.can_edit_content(v_org) then
      raise exception 'Not permitted to commit into organisation %', v_org;
    end if;

    if v_row.duplicate_of_id is not null or v_row.filename_flag or v_row.blank_flag then
      v_flagged := v_flagged + 1;
    end if;

    if v_item->>'action' = 'skip' then
      update public.bulk_upload_staging set status = 'discarded' where id = v_row.id;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_item->>'action' = 'replace' then
      v_new_id := (v_item->>'replace_target_id')::uuid;
      if v_new_id is null or not exists (
        select 1 from public.policies where id = v_new_id and organisation_id = v_org
      ) then
        raise exception 'Replace target % not found in this organisation', v_new_id;
      end if;

      update public.policies set
        name = coalesce(nullif(v_item->>'title', ''), name),
        body = coalesce(v_row.extracted_text, body),
        service_id = nullif(v_item->>'service_id', '')::uuid,
        review_period_months = coalesce((v_item->>'review_period_months')::int, review_period_months),
        next_review_date = nullif(v_item->>'next_review_date', '')::date,
        updated_by = v_actor
      where id = v_new_id;

      if (v_item->>'publish')::boolean and v_row.extracted_text is not null and trim(v_row.extracted_text) <> '' then
        select coalesce(published_version, 0) + 1 into v_next_version from public.policies where id = v_new_id;
        update public.policies set
          published_version = v_next_version,
          published_body = v_row.extracted_text,
          published_at = now(),
          published_by = v_actor,
          current_version = v_next_version
        where id = v_new_id;
      end if;

      insert into public.documents (
        organisation_id, owner_type, owner_id, file_name, mime_type, byte_size,
        storage_path, extracted_text, extraction_note, uploaded_by
      ) values (
        v_org, 'policy', v_new_id, v_row.original_filename, v_row.mime_type, v_row.byte_size,
        v_row.storage_path, v_row.extracted_text, v_row.extraction_note, v_actor
      ) returning id into v_doc_id;
      update public.policies set source_document_id = v_doc_id where id = v_new_id;

      for v_category_id in select jsonb_array_elements_text(coalesce(v_item->'category_ids', '[]'::jsonb))::uuid
      loop
        insert into public.policy_category_links (organisation_id, policy_id, category_id)
          values (v_org, v_new_id, v_category_id)
          on conflict do nothing;
      end loop;

      for v_sop_id in select jsonb_array_elements_text(coalesce(v_item->'linked_sop_ids', '[]'::jsonb))::uuid
      loop
        insert into public.policy_sop_links (organisation_id, policy_id, sop_id)
          values (v_org, v_new_id, v_sop_id)
          on conflict do nothing;
      end loop;

      update public.bulk_upload_staging set status = 'committed', committed_object_id = v_new_id where id = v_row.id;
      v_replaced := v_replaced + 1;
      continue;
    end if;

    -- action = 'create'
    insert into public.policies (
      organisation_id, name, status, service_id, review_period_months,
      next_review_date, body, updated_by
    ) values (
      v_org,
      coalesce(nullif(v_item->>'title', ''), v_row.derived_title),
      'in_library',
      nullif(v_item->>'service_id', '')::uuid,
      coalesce((v_item->>'review_period_months')::int, 6),
      nullif(v_item->>'next_review_date', '')::date,
      v_row.extracted_text,
      v_actor
    ) returning id into v_new_id;

    if (v_item->>'publish')::boolean and v_row.extracted_text is not null and trim(v_row.extracted_text) <> '' then
      update public.policies set
        published_version = 1,
        published_body = v_row.extracted_text,
        published_at = now(),
        published_by = v_actor,
        current_version = 1
      where id = v_new_id;
    end if;

    insert into public.documents (
      organisation_id, owner_type, owner_id, file_name, mime_type, byte_size,
      storage_path, extracted_text, extraction_note, uploaded_by
    ) values (
      v_org, 'policy', v_new_id, v_row.original_filename, v_row.mime_type, v_row.byte_size,
      v_row.storage_path, v_row.extracted_text, v_row.extraction_note, v_actor
    ) returning id into v_doc_id;
    update public.policies set source_document_id = v_doc_id where id = v_new_id;

    for v_category_id in select jsonb_array_elements_text(coalesce(v_item->'category_ids', '[]'::jsonb))::uuid
    loop
      insert into public.policy_category_links (organisation_id, policy_id, category_id)
        values (v_org, v_new_id, v_category_id)
        on conflict do nothing;
    end loop;

    for v_sop_id in select jsonb_array_elements_text(coalesce(v_item->'linked_sop_ids', '[]'::jsonb))::uuid
    loop
      insert into public.policy_sop_links (organisation_id, policy_id, sop_id)
        values (v_org, v_new_id, v_sop_id)
        on conflict do nothing;
    end loop;

    update public.bulk_upload_staging set status = 'committed', committed_object_id = v_new_id where id = v_row.id;
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'created', v_created, 'replaced', v_replaced, 'skipped', v_skipped, 'flagged', v_flagged
  );
end;
$$;

grant execute on function public.commit_bulk_policies(jsonb) to authenticated;

-- Discard an entire pending batch (the user cancels before committing) and
-- clean up its Storage objects. Returns the storage_paths to delete, since
-- Storage removal happens from the calling server action, not from SQL.
create or replace function public.discard_bulk_batch(p_batch_id uuid)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organisation_id into v_org from public.bulk_upload_staging
    where batch_id = p_batch_id limit 1;
  if v_org is null then
    return;
  end if;
  if not public.can_edit_content(v_org) then
    raise exception 'Not permitted to discard this batch';
  end if;

  return query
    update public.bulk_upload_staging
    set status = 'discarded'
    where batch_id = p_batch_id and status = 'pending'
    returning storage_path;
end;
$$;

grant execute on function public.discard_bulk_batch(uuid) to authenticated;
