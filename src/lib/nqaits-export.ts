// NQAITS Worker Register export. Produces a file in the exact column layout of
// the NQAITS Worker Register bulk template (sheet "Worker Register", field
// headers on row 12, one worker per row from row 13), so a service's staff data
// captured in the Portal can be handed to NQAITS without re-keying.
//
// The 103 header strings below are taken verbatim from the real template
// (WorkerRegister_Timboon Updated v3.ods). The sample data rows in that file
// are in a legacy compressed layout and are NOT authoritative - row 12 is.
//
// Caveat: NQAITS templates drift. Validate a real upload against the live NQAITS
// portal before relying on this for a submission.

import type { TrainingType } from "@/lib/nqaits";

export const NQAITS_SHEET_NAME = "Worker Register";

// row 12 of the template, columns A .. CY
export const NQAITS_HEADERS: string[] = [
  "Ref#",
  "Title",
  "First Name",
  "Middle Name",
  "Last Name",
  "Names Previously Known As",
  "Alias / Other Names Known By",
  "Date of Birth",
  "Email",
  "Phone Number",
  "Mobile Number",
  "FDC Location Type",
  "FDC Venue-Address ID",
  "FDC Residence Address-Address Line 1",
  "FDC Residence Address-Address Line 2",
  "FDC Residence Address-Suburb/Town",
  "FDC Residence Address-State",
  "FDC Residence Address-Post Code",
  "Home Address-Address Line 1",
  "Home Address-Address Line 2",
  "Home Address-Suburb/Town",
  "Home-State",
  "Home-Post Code",
  "Postal Address-Address Line 1",
  "Postal Address-Address Line 2",
  "Postal Address-Suburb/Town",
  "Postal Address-State",
  "Postal Address-Post Code",
  "Position",
  "Non-Educator Role",
  "Start Date",
  "Nature of Employment / Engagement / Appointment",
  "Currently on Probationary Period",
  "Working With Children Check Exemption",
  "Reason for Exemption",
  "WWCC1-Check Number",
  "WWCC1-Check Expiry Date",
  "WWCC1-State or Territory of Issue",
  "WWCC1-Date Sighted",
  "WWCC1-Sighted By",
  "WWCC2-Check Number",
  "WWCC2-Check Expiry Date",
  "WWCC2-State or Territory of Issue",
  "WWCC2-Date Sighted",
  "WWCC2-Sighted By",
  "Teacher Registration-Check Number",
  "Teacher Registration-Check Expiry Date",
  "Teacher Registration-State or Territory of Issue",
  "Teacher Registration-Date Sighted",
  "Teacher Registration-Sighted By",
  "Qualification-The Worker does not have any relevant Qualifications or Training",
  "Qualification-Type",
  "Qualification-Registered Training Organisation",
  "Qualification-RTO Number",
  "Qualification-Course Code",
  "Qualification-Is the Worker workingtowards this qualification",
  "Qualification-Date Attained",
  "Qualification-Date Commenced",
  "Qualification-Date Sighted",
  "Qualification-Sighted By",
  "First Aid Certificate-Registered Training Organisation",
  "First Aid Certificate-RTO Number",
  "First Aid Certificate-Course Code",
  "First Aid Certificate-Date Attained",
  "First Aid Certificate-Expiry Date",
  "First Aid Certificate-Date Sighted",
  "First Aid Certificate-Sighted By",
  "Anaphylaxis Training-Registered Training Organisation",
  "Anaphylaxis Training-RTO Number",
  "Anaphylaxis Training-Course Code",
  "Anaphylaxis Training-Date Attained",
  "Anaphylaxis Training-Expiry Date",
  "Anaphylaxis Training-Date Sighted",
  "Anaphylaxis Training-Sighted By",
  "Asthma Training-Registered Training Organisation",
  "Asthma Training-RTO Number",
  "Asthma Training-Course Code",
  "Asthma Training-Date Attained",
  "Asthma Training-Expiry Date",
  "Asthma Training-Date Sighted",
  "Asthma Training-Sighted By",
  "Child Safety Training-Registered Training Organisation",
  "Child Safety Training-RTO Number",
  "Child Safety Training-Course Code",
  "Child Safety Training-Date Attained",
  "Child Safety Training-Expiry Date",
  "Child Safety Training-Date Sighted",
  "Child Safety Training-Sighted By",
  "Child Protection Training-Registered Training Organisation",
  "Child Protection Training-RTO Number",
  "Child Protection Training-Course Code",
  "Child Protection Training-Date Attained",
  "Child Protection Training-Expiry Date",
  "Child Protection Training-Date Sighted",
  "Child Protection Training-Sighted By",
  "Other Training",
  "Other Training-Registered Training Organisation",
  "Other Training-RTO Number",
  "Other Training-Course Code",
  "Other Training-Date Attained",
  "Other Training-Expiry Date",
  "Other Training-Date Sighted",
  "Other Training-Sighted By",
];

// row 10 of the template: the group label sits at the first column of its group.
const GROUP_LABELS: { at: number; label: string }[] = [
  { at: 0, label: "Personal and Contact Details" },
  { at: 11, label: "Family Day Care Only - FDC Address" },
  { at: 18, label: "Workers Home Address" },
  { at: 23, label: "Workers Postal Address" },
  { at: 28, label: "Position Details" },
  { at: 35, label: "Working with Childrens Check (WWCC) Details" },
  { at: 40, label: "Additional Working with Childrens Check Details" },
  { at: 45, label: "Teacher Registration Details" },
  { at: 50, label: "Qualification Details" },
  { at: 60, label: "First Aid Training Details" },
  { at: 67, label: "Anaphlaxis Training Details" },
  { at: 74, label: "Asthma Training Details" },
  { at: 81, label: "Child Safety Training Details" },
  { at: 88, label: "Child Protection Training Details" },
  { at: 95, label: "Other Training Details" },
];

export type ExportCredential = {
  check_number: string | null;
  expiry_date: string | null;
  state_of_issue: string | null;
  sighted_at: string | null;
  sighted_by: string | null;
};

export type ExportQualification = {
  qualification_type: string | null;
  rto_name: string | null;
  rto_number: string | null;
  course_code: string | null;
  working_towards: boolean | null;
  date_attained: string | null;
  date_commenced: string | null;
  sighted_at: string | null;
  sighted_by: string | null;
};

export type ExportTraining = {
  training_type: TrainingType;
  other_description: string | null;
  rto_name: string | null;
  rto_number: string | null;
  course_code: string | null;
  date_attained: string | null;
  expiry_date: string | null;
  sighted_at: string | null;
  sighted_by: string | null;
};

export type ExportWorker = {
  email: string;
  wd: Record<string, unknown> | null;
  wwcc: ExportCredential[];
  teacher: ExportCredential[];
  qualifications: ExportQualification[];
  training: ExportTraining[];
};

const iso = (v: unknown): string => {
  if (typeof v !== "string") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
const t = (v: unknown): string => (v == null ? "" : String(v));
const yn = (v: unknown): string => (v === true ? "Yes" : v === false ? "No" : "");

function credCells(c: ExportCredential | undefined): string[] {
  if (!c) return ["", "", "", "", ""];
  return [
    t(c.check_number),
    iso(c.expiry_date),
    t(c.state_of_issue),
    iso(c.sighted_at),
    t(c.sighted_by),
  ];
}

function trainingCells(list: ExportTraining[], type: TrainingType): string[] {
  const r = list.find((x) => x.training_type === type);
  if (!r) return ["", "", "", "", "", "", ""];
  return [
    t(r.rto_name),
    t(r.rto_number),
    t(r.course_code),
    iso(r.date_attained),
    iso(r.expiry_date),
    iso(r.sighted_at),
    t(r.sighted_by),
  ];
}

// One worker as a 103-cell row in NQAITS column order.
export function workerToRow(w: ExportWorker): string[] {
  const wd = w.wd ?? {};
  const g = (k: string) => (wd as Record<string, unknown>)[k];
  const q = w.qualifications[0];
  const other = w.training.find((x) => x.training_type === "Other");

  return [
    t(g("ref_number")),
    t(g("title")),
    t(g("first_name")),
    t(g("middle_name")),
    t(g("last_name")),
    t(g("previously_known_as")),
    t(g("other_names")),
    iso(g("date_of_birth")),
    w.email,
    t(g("phone")),
    t(g("mobile")),
    t(g("fdc_location_type")),
    t(g("fdc_venue_address_id")),
    t(g("fdc_residence_line1")),
    t(g("fdc_residence_line2")),
    t(g("fdc_residence_suburb")),
    t(g("fdc_residence_state")),
    t(g("fdc_residence_postcode")),
    t(g("home_line1")),
    t(g("home_line2")),
    t(g("home_suburb")),
    t(g("home_state")),
    t(g("home_postcode")),
    t(g("postal_line1")),
    t(g("postal_line2")),
    t(g("postal_suburb")),
    t(g("postal_state")),
    t(g("postal_postcode")),
    t(g("nqaits_position")),
    t(g("non_educator_role")),
    iso(g("start_date")),
    t(g("employment_nature")),
    yn(g("on_probation")),
    yn(g("wwcc_exempt")),
    t(g("wwcc_exemption_reason")),
    ...credCells(w.wwcc[0]),
    ...credCells(w.wwcc[1]),
    ...credCells(w.teacher[0]),
    yn(g("has_no_qualifications")),
    t(q?.qualification_type),
    t(q?.rto_name),
    t(q?.rto_number),
    t(q?.course_code),
    q ? yn(q.working_towards) : "",
    iso(q?.date_attained),
    iso(q?.date_commenced),
    iso(q?.sighted_at),
    t(q?.sighted_by),
    ...trainingCells(w.training, "First Aid"),
    ...trainingCells(w.training, "Anaphylaxis"),
    ...trainingCells(w.training, "Asthma"),
    ...trainingCells(w.training, "Child Safety"),
    ...trainingCells(w.training, "Child Protection"),
    t(other?.other_description),
    ...trainingCells(w.training, "Other"),
  ];
}

// The full sheet: template preamble (rows 1-12) then one row per worker.
export function buildRegisterGrid(
  serviceTypeLabel: string,
  serviceName: string,
  workers: ExportWorker[],
): string[][] {
  const groupRow: string[] = new Array(NQAITS_HEADERS.length).fill("");
  for (const gl of GROUP_LABELS) groupRow[gl.at] = gl.label;

  const rows: string[][] = [];
  rows.push(["Service Type", serviceTypeLabel]); // 1
  rows.push(["Service ID:", ""]); // 2
  rows.push(["Service Name:", serviceName]); // 3
  rows.push([]); // 4
  rows.push([]); // 5
  rows.push([]); // 6
  rows.push([]); // 7
  rows.push([]); // 8
  rows.push([]); // 9
  rows.push(groupRow); // 10
  rows.push([]); // 11
  rows.push([...NQAITS_HEADERS]); // 12
  for (const w of workers) rows.push(workerToRow(w)); // 13+
  return rows;
}

export function gridToCsv(grid: string[][]): string {
  const esc = (v: string) =>
    /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return grid.map((row) => row.map((c) => esc(c ?? "")).join(",")).join("\r\n") + "\r\n";
}

// JSON: an array of objects keyed by the NQAITS header strings, one per worker.
export function workersToJson(workers: ExportWorker[]): unknown[] {
  return workers.map((w) => {
    const row = workerToRow(w);
    const obj: Record<string, string> = {};
    NQAITS_HEADERS.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
}
