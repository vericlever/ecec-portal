-- 0069_bulk_sop_tags.sql
--
-- The bulk SOP review screen was missing the NQS quality area / Child Safe
-- Standard tagging every single-SOP edit already has (migrations 0039/0040).
-- commit_bulk_sops needs to write document_quality_areas /
-- document_child_safe_standards for the same reason it already writes
-- job_role_sops and policy_sop_links inline: the commit is one atomic
-- SECURITY DEFINER call, so tag writes have to happen inside it too rather
-- than as a follow-up loop from the client that could partially fail.
--
-- p_items gains two optional arrays per item: quality_area_ids (int[]),
-- child_safe_standard_ids (int[]). The per-table max-tags triggers (0039/
-- 0040) are still the enforcement backstop - exceeding the cap raises and
-- rolls back the whole batch commit, same as any other bad row in it.

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
  v_qa_id int;
  v_css_id int;
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

      -- Replace means the whole record's content is being superseded -
      -- clear the old tag set rather than merging into it.
      delete from public.document_quality_areas
        where document_type = 'sop' and document_id = v_new_id;
      delete from public.document_child_safe_standards
        where document_type = 'sop' and document_id = v_new_id;
      for v_qa_id in select jsonb_array_elements_text(coalesce(v_item->'quality_area_ids', '[]'::jsonb))::int
      loop
        insert into public.document_quality_areas (organisation_id, document_type, document_id, quality_area_id, created_by)
          values (v_org, 'sop', v_new_id, v_qa_id, v_actor);
      end loop;
      for v_css_id in select jsonb_array_elements_text(coalesce(v_item->'child_safe_standard_ids', '[]'::jsonb))::int
      loop
        insert into public.document_child_safe_standards (organisation_id, document_type, document_id, standard_id, created_by)
          values (v_org, 'sop', v_new_id, v_css_id, v_actor);
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

    for v_qa_id in select jsonb_array_elements_text(coalesce(v_item->'quality_area_ids', '[]'::jsonb))::int
    loop
      insert into public.document_quality_areas (organisation_id, document_type, document_id, quality_area_id, created_by)
        values (v_org, 'sop', v_new_id, v_qa_id, v_actor);
    end loop;
    for v_css_id in select jsonb_array_elements_text(coalesce(v_item->'child_safe_standard_ids', '[]'::jsonb))::int
    loop
      insert into public.document_child_safe_standards (organisation_id, document_type, document_id, standard_id, created_by)
        values (v_org, 'sop', v_new_id, v_css_id, v_actor);
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
