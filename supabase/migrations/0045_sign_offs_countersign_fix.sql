-- 0045_sign_offs_countersign_fix.sql
--
-- Found while extending scripts/rls-check.mjs to exercise the manager-cosign
-- path on the nine self_and_manager SOPs: sign_offs_update's "user_id =
-- auth.uid()" branch has no real caller - nobody in the app ever updates
-- their own sign_offs row (self-signing is INSERT-only, see api/sign/route.ts)
-- - but its presence means a staff member could countersign (verify) their
-- own sign-off directly against the database, bypassing the one thing
-- countersignSop's own TypeScript explicitly guards against. RLS was, in
-- effect, granting a permission the app never intended to grant and never
-- exercises. Dropping that branch leaves only covers_service, which is what
-- an actual countersign needs.
drop policy if exists sign_offs_update on public.sign_offs;

create policy sign_offs_update on public.sign_offs
for update
using (covers_service(organisation_id, service_id))
with check (covers_service(organisation_id, service_id));
