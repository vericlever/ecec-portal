# Staff onboarding questionnaire and bulk upload, aligned to NQAITS Worker Register

Adds to Step 5 (Staff management tools, in-app) in `BUILD_PLAN.md`. This defines the actual field set staff answer when joining an organisation, sourced directly from the NQAITS Worker Register bulk upload template (`WorkerRegister_Timboon_Updated_v3.ods`), so information captured on joining RSG is already in the exact shape needed for the real NQAITS import later (Step 5's deferred live NQAITS integration).

## Why this matters

The Portal's own onboarding questionnaire should ask for the same fields, in the same structure, as NQAITS's Worker Register. That way, the data captured once at staff onboarding is reusable for the actual NQAITS bulk upload later, without a separate re-entry or mapping exercise. NQAITS accepts bulk upload for new people only, via Excel template or JSON, per their published guidance, this is why an Excel/JSON export capability from the Portal, matching their field structure, is worth building rather than just storing the data in an incompatible shape.

## Verified dropdown lists (from the file's actual data validation rules, not inferred from sample data)

The first draft of this document inferred dropdown options from RSG's real entered data alone, which understated several fields, RSG's actual usage is a subset of what the template technically allows. These are the real embedded validation lists:

| Field | Actual dropdown options |
|---|---|
| Title | Br, Dr, Fr, Master, Miss, Mr, Mrs, Ms, Sr, Mx |
| Position | Educator, Volunteer, Student, Non-Educator Staff, Early Childhood Teacher, Co-ordinator, Assistant, Contractor |
| Non-Educator Role | Bus Driver, Centre Director, Cook, Cleaner, Gardener, Other |
| State/Territory (all address and check fields) | ACT, NSW, NT, QLD, SA, TAS, VIC, WA |
| Qualification Type | Certificate III, Certificate IV, Diploma, ECT, Degree, Masters |
| "Sighted By" (all credential fields) | Provider, Nominated Supervisor |
| Nature of Employment / Engagement / Appointment | Direct, Indirect |
| Yes/No fields (probation, exemption, working towards qualification, etc.) | Yes, No |

**Position dropdown note:** RSG's real data only uses Educator and Early Childhood Teacher, but the full list has 8 options. Build the Portal's dropdown against the full list, not just what RSG currently has staff assigned to, so the schema doesn't accidentally exclude a valid NQAITS category the moment RSG hires, say, a Cook or a Co-ordinator.

**Confirmed:** "Nature of Employment / Engagement / Appointment" is Direct / Indirect, a fixed two-value enum. RSG's actual data in that column currently reads "Employee," which doesn't match either value, that's stale or incorrectly entered data in the existing spreadsheet, not a problem with the dropdown itself. When RSG's existing staff are migrated into the Portal, correct this field to Direct or Indirect per person at that point, don't carry "Employee" across as if it were a valid value.

## Field groups (from the NQAITS template)

### Personal and contact details
Ref#, Title, First Name, Middle Name, Last Name, Names Previously Known As, Alias / Other Names Known By, Date of Birth, Email, Phone Number, Mobile Number

*Title: use the verified dropdown list above (Br, Dr, Fr, Master, Miss, Mr, Mrs, Ms, Sr, Mx), as a fixed enum, not free text. Don't narrow this to what RSG's current staff happen to use.*

### Family Day Care only, FDC address
FDC Location Type, FDC Venue-Address ID, FDC Residence Address (Line 1, Line 2, Suburb/Town, State, Post Code)

*Not relevant to RSG (Centre Based Day Care), build the field group but make it conditionally hidden unless the organisation's service type is Family Day Care*

### Worker's home address
Address Line 1, Address Line 2, Suburb/Town, State, Post Code

### Worker's postal address
Address Line 1, Address Line 2, Suburb/Town, State, Post Code

*Should default to "same as home address" with an override, rather than asking twice by default*

### Position details
Position (fixed enum, full verified list: Educator, Volunteer, Student, Non-Educator Staff, Early Childhood Teacher, Co-ordinator, Assistant, Contractor, not narrowed to RSG's current two), Non-Educator Role (fixed enum, only used if Position is Non-Educator Staff: Bus Driver, Centre Director, Cook, Cleaner, Gardener, Other), Start Date, Nature of Employment / Engagement / Appointment (fixed enum: Direct, Indirect, see confirmation note above), Currently on Probationary Period (Yes/No)

**Note:** "Position" here is the NQAITS regulatory position category, not the same as the Portal's own job role concept from `BUILD_PLAN.md` Step 7 (Educator, Room Leader, Ed Leader, etc.) or the four access tiers. These are three genuinely separate concepts and must not be conflated in the schema:
1. Access tier (Staff, Manager, Admin) — who can do what in the Portal
2. Job role (Educator, Room Leader, Cook) — which SOP suite applies
3. NQAITS Position (Educator, Early Childhood Teacher, etc.) — the regulatory category NQAITS itself tracks

### Working with Children Check (WWCC) details
Working With Children Check Exemption (Yes/No), Reason for Exemption (only if exempt)

Then, per check (the template supports up to two WWCC entries per worker, presumably for renewals or dual-state cases):
Check Number, Check Expiry Date, State or Territory of Issue, Date Sighted, Sighted By

This is also the field set that underlies the staff self-service WWCC update from `BUILD_PLAN.md` Step 10, staff updating their own WWCC should be writing into this same structure, not a separate one.

### Teacher registration details
Check Number, Check Expiry Date, State or Territory of Issue, Date Sighted, Sighted By

*Only relevant where Position is Early Childhood Teacher, conditionally shown*

### Qualification details
"The Worker does not have any relevant Qualifications or Training" (Yes/No), Type (fixed enum, full verified list: Certificate III, Certificate IV, Diploma, ECT, Degree, Masters, not narrowed to RSG's current four), Registered Training Organisation, RTO Number, Course Code, Is the Worker working towards this qualification (Yes/No), Date Attained, Date Commenced, Date Sighted, Sighted By

### Training details, repeated structure across six categories
Each of the following uses the same field set: Registered Training Organisation, RTO Number, Course Code, Date Attained, Expiry Date, Date Sighted, Sighted By

- First Aid Training
- Anaphylaxis Training
- Asthma Training
- Child Safety Training
- Child Protection Training
- Other Training (this one also has an additional free-text field for what the training actually was)

This repeated structure is also what feeds the staff self-service training tracking from Step 10, and should share a single underlying table (training type as a column or foreign key, not six separate near-identical tables), since the field set is identical across all six.

## Onboarding questionnaire flow

When a staff member joins the organisation, they answer this as a structured multi-step questionnaire, not one long form:

1. Personal and contact details
2. Home address, then postal address (defaulting to same as home)
3. Position details
4. WWCC details (or exemption and reason, if applicable)
5. Teacher registration (only shown if Position is Early Childhood Teacher)
6. Qualifications
7. Training records (only fields relevant to what they've actually completed, don't force all six categories on every worker if some don't apply)

## Bulk upload

Per NQAITS's own guidance, bulk upload is for new people only, via Excel template or JSON. The Portal should support the same two formats, structured the same way, so that:

- An admin can bulk-import new staff into the Portal using this field structure (this is the same bulk upload capability from `BUILD_PLAN.md` Step 5, now with the full NQAITS-aligned field set rather than the narrower name/email/role/site set originally scoped)
- The same data can later be exported in NQAITS's own format for the deferred live NQAITS integration, without needing to re-map fields

**Done when**
- The onboarding questionnaire captures every field listed above, in the groupings shown, with conditional logic for FDC-only, Early Childhood Teacher-only, and exemption-only fields
- A bulk upload (Excel or JSON) using this field structure creates staff records correctly, matching them to existing organisation and site data
- The three separate role concepts (access tier, job role, NQAITS Position) are stored as distinct fields, not conflated into one

## Verification workflow: Date Sighted and Sighted By

These fields are not answered by the new staff member. When a staff member submits a WWCC, Teacher Registration, Qualification, or Training record, the "Date Sighted" and "Sighted By" fields for that record are left open and the record is flagged as an outstanding verification task, visible to every manager at that staff member's site, not assigned to one specific person.

Any manager at the site can pick up the flagged item, physically sight the actual document, and complete the verification: Date Sighted defaults to the date they complete it, Sighted By is selected from the fixed enum (Provider, Nominated Supervisor) reflecting which of those two capacities they're verifying in, not their personal name.

This means:
- The onboarding questionnaire itself only ever asks the staff member for the document details (check number, expiry date, state of issue, RTO, course code, dates attained, etc.), never Date Sighted or Sighted By
- A new outstanding-verification queue is needed, scoped per site, feeding into the same staff reporting and outstanding-items view from `BUILD_PLAN.md` Step 8, so unverified credentials show up alongside outstanding SOP sign-offs rather than as a separate disconnected list
- This is also a natural fit for the reminder mechanism from Step 7, a manager could get reminded of outstanding verifications the same way staff get reminded of outstanding sign-offs

**Done when**
- Submitting a credential or training record as a staff member creates a flagged, unverified item visible to all managers at that site
- Any manager at the site (not a single assigned one) can complete the verification, and doing so writes Date Sighted and Sighted By
- Unverified items appear in the same outstanding-items reporting surface as outstanding SOP sign-offs

## Question count for a new staff member

With Date Sighted and Sighted By removed from the onboarding questionnaire (they're a manager-side verification task, not a staff-side answer), the field count drops. For a typical new Educator, not an ECT, with one WWCC and a couple of completed trainings rather than all six categories, expect roughly **25 to 30 questions**, down from the 35 to 45 estimated when Date Sighted and Sighted By were still being counted as staff-side fields.

## Not yet resolved

- Whether the verified dropdown lists above are still current, templates like this can drift from the live NQAITS system over time, cross-check against the NQA ITS Portal or Help Centre before finalising strict validation, rather than treating this spreadsheet as the permanent source of truth
- RSG's existing staff records will need "Nature of Employment" corrected from "Employee" to Direct or Indirect per person during migration, this should be a one-time data cleanup step, not something the Portal needs to handle automatically
