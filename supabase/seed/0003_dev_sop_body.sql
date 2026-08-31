-- seed/0003_dev_sop_body.sql
-- DEV. Puts the real written procedure onto one SOP so the step 3 page renders
-- genuine content end to end. Source: "SOP_ Nappy Changing.pdf" (RSG).
--
-- If this updates 0 rows, check the exact SOP name:
--   select name from public.sops where target_tier = 'educator' and name ilike '%nappy%';
-- and adjust the WHERE clause below.

update public.sops
set body =
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
  and target_tier = 'educator'
  and name = 'Nappy Changing and Toilet Training';
