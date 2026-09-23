-- 0083_contract_signed_copy_write.sql
--
-- signed_copy_document_id/hash/generated_at are written by
-- generateContractSignedCopy() as a follow-up step after signOwnContract()/
-- countersignContract() succeed - PDF generation is application code, so it
-- can't happen inside the sign/countersign RPCs themselves. But
-- contracts_write (0063) deliberately locks the contract's own owner out of
-- writing the contracts row at all (self-management lock), so a plain
-- employee who just signed their own contract has no RLS path to record
-- where its signed copy landed. Same shape of problem 0044 solved for
-- sign_own_contract itself: a narrow, single-purpose write on an otherwise
-- locked-down row, via a SECURITY DEFINER function rather than a blanket
-- policy change.

create function public.set_contract_signed_copy(
  p_contract_id uuid,
  p_signed_copy_document_id uuid,
  p_signed_copy_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_profile_id uuid;
begin
  select organisation_id, profile_id into v_org, v_profile_id
  from public.contracts
  where id = p_contract_id
  for update;

  if v_org is null then
    raise exception 'Contract not found.';
  end if;
  if not (
    v_profile_id = (select auth.uid())
    or public.is_admin(v_org)
    or (public.can_verify(v_org) and public.worker_service(v_profile_id) = public.current_service())
  ) then
    raise exception 'Not allowed.';
  end if;

  update public.contracts
  set signed_copy_document_id = p_signed_copy_document_id,
      signed_copy_hash = p_signed_copy_hash,
      signed_copy_generated_at = now()
  where id = p_contract_id;
end;
$$;

grant execute on function public.set_contract_signed_copy(uuid, uuid, text) to authenticated;
