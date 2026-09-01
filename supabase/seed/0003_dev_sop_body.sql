-- seed/0003_dev_sop_body.sql
-- DEV. Real written procedures on a handful of SOPs so the pages render genuine
-- content. Sources: RSG's own SOP .docx files. Idempotent.
--
-- If a statement updates 0 rows, check the SOP name:
--   select target_tier, name from public.sops where name ilike '%<keyword>%';

-- Educator: Nappy Changing and Toilet Training -----------------------------
update public.sops set body =
$body$Nappy Changing & Toileting

PURPOSE
To safely and hygienically support children's personal care needs while promoting comfort, dignity, independence and learning.

FREQUENCY
As required throughout the day, as per the Daily Educator Jobs SOP.

RESPONSIBLE PERSON
All educators (trainees and new staff once prepared and signed off on this SOP).


NAPPY CHANGING

Step 1 - Prepare area
Ensure all required supplies (gloves, wipes, clean nappy, paper towel/liner, spare clothes) are within reach before beginning. Check that the nappy size is correct for the child.

Step 2 - Place / walk up child safely
Place paper towel on the mat before placing the child. Place the child onto the change mat and keep one hand on the child at all times. Encourage older children to walk up the steps and lift at the knees for safety.

Step 3 - Communicate with the child and respect their body
Before touching a child for changing, explain what will happen in simple language, e.g. "I'm going to help you change your nappy now; do you mind?" Wait for verbal or non-verbal acknowledgement before proceeding. Invite the child to assist where possible (pulling up pants, placing wipes in the bin, washing hands) to reinforce ownership of their body and routines.

Step 3 notes - execution (meeting Reg. 77 and Child Safe Standards)
The change must always occur when required for hygiene or comfort. Children's agency is supported through calm explanation and small participatory choices (e.g. "Would you like to stand or lie down?", "Would you like to hold a toy?"), but the care itself is not negotiable. Refusal or distress is a cue for extra reassurance, not for stopping the process.

Step 4 - Remove soiled items
Remove soiled clothing/nappy. Clean the child front-to-back with wipes. Place soiled items in the correct disposal system or a sealed bag as per site setup.

Step 5 - Apply clean nappy
Remove gloves before touching clean clothing or nappies. Apply a clean, fresh nappy and dress the child. Only apply nappy cream if authorised by parents (verbal permission is OK). No Bepanthen cream, as it contains nuts. Parents can supply specific creams as needed. When using shared creams, avoid "double dipping" and change gloves if you need to apply more cream.

Step 6 - Hand hygiene for child
Assist the child to wash and dry hands using soap and water.

Step 7 - Clean area
Clean and dry the change mat after each change with disinfectant. Dispose of gloves, wipes and paper towel. Wash your hands after cleaning.

Step 8 - Documentation
Record nappy changes and toileting outcomes in OWNA.


TOILETING

Step 1 - Communicate readiness
When educators notice signs of toilet readiness (staying dry longer, showing interest in the toilet, communicating need), discuss this with families and agree on a starting approach. Update OWNA using the toileting drop-down box on the child's profile. Ensure parents provide spare clothes for all children who are toileting - a minimum of 4 pairs of undies - and pull-ups will be used for children who exhaust their supply.

Step 2 - Introducing toileting
Take children to the bathroom when they show interest or during routine times. Maintain direct supervision at all times.

Step 3 - Support independence
Encourage children to assist with steps such as undressing, using the toilet, flushing and washing hands. Provide help where needed.

Step 4 - Manage accidents respectfully
Treat accidents calmly and without fuss. Place soiled clothing in a sealed bag for families and assist the child to wash hands and change. At Timboon, use the tubs provided until the end of the day and place a tag on the bag as a reminder to look for dirty clothes (Timboon only). Encourage the child to dress themselves independently where possible. Spare clothes can be provided if family clothes are exhausted; do not provide used underwear - use a pull-up if no undies are available.

Step 5 - Create a consistent plan
Work with families to establish toileting routines, hygiene expectations and language used. Using shared language is helpful.

Step 6 - Daily updates to families
Provide short positive updates to families verbally or via OWNA to support consistency between home and care. Any Ready Set Go clothes used should be washed and returned to the centre.
$body$
where organisation_id = 'a0000000-0000-4000-8000-000000000001'
  and target_tier = 'educator' and name = 'Nappy Changing and Toilet Training';

-- Educator: Active Supervision -------------------------------------------
update public.sops set body =
$body$Active Supervision

PURPOSE
To ensure continuous, proactive supervision that protects children from harm and supports engagement and learning.

FREQUENCY
At all times when responsible for children.

RESPONSIBLE PERSON
All educators.

Step 1 - Position yourself effectively
Follow supervision plans for rooms and outdoor areas. Stand where you can see and hear all children. Maintain sightlines and avoid turning your back on children.

Step 2 - Continuously scan the environment
Move your eyes and attention around the space. Look and listen for changes in behaviour, tone, or movement. Anticipate areas of higher risk.

Step 3 - Engage with children
Interact and play while still monitoring the wider group. Stay alert to what is happening around you during interactions.

Step 4 - Maintain ratios and headcounts
Count children regularly. Check that staffing always meets ratio requirements indoors and outdoors.

Step 5 - Manage movements and transitions
If you need to step away, clearly hand over supervision and wait for acknowledgment. Ensure no space is left unsupervised at any time.

Step 6 - Prevent distractions
Avoid extended conversations, phone use, or admin tasks when supervising. Stay focused and present with the children.

Step 7 - Adjust for risk
Stay close to high-risk activities such as climbing, running, or water play. Reposition if the environment changes or behaviours escalate.

Step 8 - Communicate and collaborate
Share safety information with others. When you leave a space, verbally hand over children to another educator and confirm they have taken responsibility before you move away. Update others if children move to different areas.

Step 9 - Support safety and agency
Encourage children to explore and take safe risks while being ready to intervene quickly if needed.

Step 10 - Respond quickly
Immediately and safely respond to hazards, conflict, or distress. Support children and redirect unsafe behaviour as required.

Step 11 - Record and review issues
Take headcounts when entering or exiting a room and record attendance changes in OWNA. Document incidents, hazards, and supervision concerns. Review improvements at team meetings.

Step 12 - Follow the supervision plan
Refer to the indoor and outdoor supervision maps daily to ensure correct positioning. Update plans if room layouts or routines change.
$body$
where organisation_id = 'a0000000-0000-4000-8000-000000000001'
  and target_tier = 'educator' and name = 'Active Supervision';

-- Director: Leadership Meetings -----------------------------------------
update public.sops set body =
$body$Leadership Meetings

PURPOSE
To ensure leadership meetings are professional, efficient, and outcome-focused.

FREQUENCY
Weekly or as scheduled.

RESPONSIBLE PERSON
Leadership team including CEO, Directors, and Educational Leader.

Step 1 - Arrive prepared
Review the agenda beforehand and ensure all relevant staffing, compliance, programming, QIP and operational updates are ready to discuss. Any professional reading should be completed ahead of time.

Step 2 - Arrive on time
Be punctual to begin the meeting at the scheduled time. If delayed, notify the team as soon as possible.

Step 3 - Bring required resources
Bring devices, notes, files and data needed to participate effectively in the meeting.

Step 4 - Professional conduct
Listen actively, allow others to speak, stay focused, and contribute respectfully and constructively.

Step 5 - Stay agenda focused
Keep all contributions aligned with the agenda and priorities. Note any future discussion items for AOB.

Step 6 - Positive collaboration
Maintain a solutions-focused approach and align decisions to improving outcomes for children, families and staff.

Step 7 - Confirm actions
Ensure tasks are assigned clearly to individuals with agreed due dates before the meeting ends.

Step 8 - Document decisions
Record key decisions and actions accurately during the meeting.

Step 9 - Complete assigned tasks
Action items must be completed within agreed timeframes and progress reported at the next meeting. These are added to our weekly to-do lists and reviewed as per the To Do List SOP.

Step 10 - Distribute notes
Upload meeting notes to the shared folder within two business days.
$body$
where organisation_id = 'a0000000-0000-4000-8000-000000000001'
  and target_tier = 'director' and name = 'Leadership Meetings';

-- Director: Hazard Maintenance Management ------------------------------
update public.sops set body =
$body$Hazard Maintenance Management

PURPOSE
To ensure hazards are identified early and actions are taken to maintain a safe environment.

RESPONSIBLE PERSON
Director (major works: Director and CEO).


LEVEL: IDENTIFICATION  (weekly)

Step 1 - Schedule weekly hazard check
Conduct a planned hazard inspection across indoor and outdoor areas once per week.

Step 2 - Inspect indoor areas
Check rooms, hallways, bathrooms, kitchen, storage, furniture and flooring for hazards, damage or wear.

Step 3 - Inspect outdoor areas
Check outdoor play spaces, gates, fencing, pathways, equipment, shade structures and surfacing for hazards.

Step 4 - Assess risk level
Determine urgency based on likelihood of harm and potential impact - prioritise high-risk hazards.

Step 5 - Record hazards
Enter all hazards into the Hazard and Maintenance Log with clear details and the assessed risk level.

Step 6 - Apply temporary controls
Block access or secure hazards if needed to prevent injury until repairs can be made.

Step 7 - Review existing items
Check progress on previously reported hazards and update their status in the log.

Step 8 - Notify team where required
Inform educators of any hazards still present and controls in place so supervision can be adjusted.

Step 9 - Follow up repairs
Monitor repair status throughout the week and ensure timely completion of outstanding items.

Step 10 - Maintain records
Keep all entries updated for Quality Area 3 evidence and monthly leadership review.


LEVEL: MINOR WORKS  (weekly and as required)

Step 1 - Review hazard log
Check new hazard entries in the Hazard and Maintenance Log.

Step 2 - Prioritise hazards
Assess risk level and urgency and set repair timelines accordingly.

Step 3 - Arrange minor repairs
Complete simple repairs directly or delegate tasks such as bulbs, fixtures, painting, garden upkeep.

Step 4 - Record actions
Document repairs completed, including dates and outcomes, in the Hazard and Maintenance Log.

Step 5 - Monitor progress
Follow up on repairs in progress to ensure timely completion.

Step 6 - Weekly environment check
Conduct weekly visual inspections indoors and outdoors for new maintenance issues.

Step 7 - Monthly log review
Review the Hazard and Maintenance Log monthly to ensure items are completed or in progress.

Step 8 - Close completed items
Confirm repair quality and mark items as completed in the log.

Step 9 - Maintain documentation
Ensure all maintenance records are stored for Quality Area 3 evidence and auditing.


LEVEL: MAJOR WORKS  (as required)

Step 1 - Identify major repairs
Identify repairs costing over $750 or requiring more than one full day of labour.

Step 2 - Notify CEO
Provide photos and details including safety impact, urgency, and recommended action.

Step 3 - Await approval
Do not commence major works until written CEO approval is received.

Step 4 - Coordinate approved works
CEO arranges quotes, contractors, or insurance as required.

Step 5 - Monitor completion
Director follows up with contractors and keeps CEO updated on progress.

Step 6 - Record all actions
Save approvals, quotes, invoices, and outcomes in the Hazard and Maintenance Log.
$body$
where organisation_id = 'a0000000-0000-4000-8000-000000000001'
  and target_tier = 'director' and name = 'Hazard Maintenance Management';

select target_tier, name, length(body) as body_chars
from public.sops
where organisation_id = 'a0000000-0000-4000-8000-000000000001'
  and name in ('Nappy Changing and Toilet Training', 'Active Supervision',
               'Leadership Meetings', 'Hazard Maintenance Management')
order by name;
