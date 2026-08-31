-- seed/0003_dev_sop_body.sql
-- DEV ONLY. A placeholder body on one SOP so the step 3 page renders content
-- end to end. Replace the text with the real Active Supervision procedure (or
-- set bodies through the app once editing exists).

update public.sops
set body =
$body$PLACEHOLDER - this is not the real SOP text. Replace it with RSG's written Active Supervision procedure.

Purpose
Every child is actively supervised at all times so that educators can respond immediately to children's needs and to hazards.

What active supervision means
- Positioning yourself to see and hear the children you are responsible for.
- Scanning and counting continuously, not just at transitions.
- Staying engaged: supervision is not a task you do while doing something else.

At handover
- Confirm the count out loud with the educator taking over.
- Do not leave the space until the incoming educator has acknowledged the count.

If you cannot maintain supervision
- Call for support before you step away.
- Never reduce the group below the required ratio to cover a break.
$body$
where organisation_id = 'a0000000-0000-4000-8000-000000000001'
  and target_tier = 'educator'
  and name = 'Active Supervision';
