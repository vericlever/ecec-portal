-- 0079_content_chunks_org_wide_search.sql
--
-- content_chunks_select (migration 0075) gated retrieval on policy_visible()/
-- sop_visible() - the same per-staff job-role/site targeting used for the
-- staff-facing /policies and /sops pages. That's wrong for this feature:
--
-- 1. sop_visible() requires an exists() match against profile_job_roles. An
--    Admin has no job role at all, so it returns false for every procedure,
--    always - Admin search for anything procedure-related always came back
--    empty, regardless of what was asked.
-- 2. policy_visible() compares the policy's service_id and any
--    policy_audiences row against the caller's own service_id/job_role_id.
--    An Admin (or anyone with no service_id) fails any site-scoped or
--    audience-targeted policy, surfacing only untargeted, all-sites
--    policies - exactly why a site-specific policy like "Delivery and
--    Collection of Children" never appeared for that search even though it
--    was the strongest match by far.
--
-- Zeke's call: at this stage the Ask feature should search every published
-- policy and procedure in the organisation, for every asker, with no
-- role or site targeting narrowing what can be found. This is safe to do
-- narrowly on content_chunks (not by changing policy_visible/sop_visible
-- themselves, which the staff-facing library pages still rely on for their
-- own targeting): every row here already corresponds to a document's
-- published_body specifically (reembedDocument only ever embeds a published
-- version), so there is no draft or unpublished content to protect - the
-- only real boundary left to enforce is the tenant one.

drop policy content_chunks_select on public.content_chunks;

create policy content_chunks_select on public.content_chunks
  for select using (public.in_org(organisation_id));
