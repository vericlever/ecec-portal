# NQAITS Worker Register - field mapping

Source: `WorkerRegister_Timboon Updated v3.ods`, sheet "Worker Register". Row 12
is the header row, data starts row 13. This is the column layout the bulk
upload (step 5d) reads and the export writes.

**The register's data validation lists are the source of truth**, not the
sample data (which has known errors - see bottom).

## Validation lists (from the .ods data validation rules)

| Field | Allowed values | Our enum |
|---|---|---|
| Service Type | `SELECT`, `CBC`, `FDC` | `service_type` (CBC / FDC; SELECT = unset) |
| Title | Br, Dr, Fr, Master, Miss, Mr, Mrs, Ms, Sr, Mx | `title_prefix` |
| State / Territory (all) | ACT, NSW, NT, QLD, SA, TAS, VIC, WA | `au_state` |
| FDC Location Type | FDC Venue, FDC Residence | text |
| Position (CBC) | Educator, Volunteer, Student, Non-Educator Staff, Early Childhood Teacher, Co-ordinator, Assistant, Contractor | `nqaits_position` |
| Position (FDC variant) | Educators, FDC Educator, Volunteer, Student, Non-Educator Staff, Early Childhood Teacher, Co-ordinator, FDC Coordinator, Assistant, FDC Educator Assistant, Contractor | not modelled yet (RSG is CBC) |
| Non-Educator Role | Bus Driver, Centre Director, Cook, Cleaner, Gardener, Other | `non_educator_role` |
| Nature of Employment | Direct, Indirect | `employment_nature` |
| Yes/No fields | Yes, No | boolean |
| Qualification Type | Certificate III, Certificate IV, Diploma, ECT, Degree, Masters | `qualification_type` |
| Sighted By (all) | Provider, Nominated Supervisor | `sighted_by` |

## Column layout

| Cols | Group | Maps to |
|---|---|---|
| A | Ref# | `worker_details.ref_number` |
| B | Title | `worker_details.title` |
| C-E | First / Middle / Last Name | `worker_details.first_name/middle_name/last_name` |
| F | Names Previously Known As | `worker_details.previously_known_as` |
| G | Alias / Other Names Known By | `worker_details.other_names` |
| H | Date of Birth | `worker_details.date_of_birth` |
| I | Email | `profiles.email` (account identity) |
| J-K | Phone / Mobile Number | `worker_details.phone/mobile` |
| L-R | FDC address (FDC services only) | `worker_details.fdc_*` |
| S-W | Home Address (Line 1, Line 2, Suburb/Town, State, Post Code) | `worker_details.home_*` |
| X-AB | Postal Address (same five) | `worker_details.postal_*` |
| AC | Position | `worker_details.nqaits_position` |
| AD | Non-Educator Role | `worker_details.non_educator_role` |
| AE | Start Date | `profiles.start_date` |
| AF | Nature of Employment / Engagement / Appointment | `worker_details.employment_nature` |
| AG | Currently on Probationary Period | `worker_details.on_probation` |
| AH | WWCC Exemption | `worker_details.wwcc_exempt` |
| AI | Reason for Exemption | `worker_details.wwcc_exemption_reason` |
| AJ-AN | WWCC1: Check Number, Expiry, State of Issue, Date Sighted, Sighted By | `wwcc_checks` row 1 |
| AO-AS | WWCC2: same five | `wwcc_checks` row 2 |
| AT-AX | Teacher Registration: Check Number, Expiry, State, Date Sighted, Sighted By | `teacher_registrations` |
| AY | "Worker has no relevant Qualifications or Training" | `worker_details.has_no_qualifications` |
| AZ-BH | Qualification: Type, RTO, RTO Number, Course Code, Working Towards, Date Attained, Date Commenced, Date Sighted, Sighted By | `qualifications` |
| BI-BO | First Aid Certificate: RTO, RTO Number, Course Code, Date Attained, Expiry Date, Date Sighted, Sighted By | `training_records` (training_type = First Aid) |
| BP-BV | Anaphylaxis Training | `training_records` (Anaphylaxis) |
| BW-CC | Asthma Training | `training_records` (Asthma) |
| CD-CJ | Child Safety Training | `training_records` (Child Safety) |
| CK-CQ | Child Protection Training | `training_records` (Child Protection) |
| CR | Other Training (free-text description) | `training_records.other_description` (Other) |
| CS-CY | Other Training: RTO, RTO Number, Course Code, Date Attained, Expiry Date, Date Sighted, Sighted By | `training_records` (Other) |

## Known errors in RSG's uploaded data (correct on import, do not carry across)

- **Nature of Employment** reads `Employee` for existing staff - not a valid
  value. Map to null and flag for correction to Direct / Indirect per person.
- Some **RTO** name cells contain `Yes` - a misaligned entry. Ignore.
- Service Type cell shows the long name; the validation says `CBC`.
