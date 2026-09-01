// Bulk staff import (step 5d). Pure parsing and validation, no server imports,
// so it can be reasoned about and tested on its own. The import UI and the
// account-creating server action are in src/app/admin/staff/import/.
//
// The file an admin uploads is the Portal's own flat template (one header row),
// as a delimited file (CSV) or a JSON array of objects with the same keys. This
// is deliberately not the raw NQAITS Worker Register layout - that stays with
// the deferred live-NQAITS integration.

import { TIER_LABELS, type AccessTier } from "@/lib/roles";
import {
  AU_STATES,
  EMPLOYMENT_NATURES,
  NON_EDUCATOR_ROLES,
  NQAITS_POSITIONS,
  QUALIFICATION_TYPES,
  SIGHTED_BY,
  TITLES,
  TRAINING_TYPES,
  type TrainingType,
} from "@/lib/nqaits";

// ---------------------------------------------------------------------------
// Column schema
// ---------------------------------------------------------------------------

const TRAINING_BLOCKS: { prefix: string; type: TrainingType }[] = [
  { prefix: "firstaid", type: "First Aid" },
  { prefix: "anaphylaxis", type: "Anaphylaxis" },
  { prefix: "asthma", type: "Asthma" },
  { prefix: "childsafety", type: "Child Safety" },
  { prefix: "childprotection", type: "Child Protection" },
  { prefix: "other_training", type: "Other" },
];

// The ordered list of column keys the template exposes. Kept in one place so the
// downloadable template and the parser never drift apart.
export const IMPORT_COLUMNS: string[] = [
  // identity and portal placement
  "email",
  "title",
  "first_name",
  "middle_name",
  "last_name",
  "previously_known_as",
  "other_names",
  "date_of_birth",
  "phone",
  "mobile",
  "ref_number",
  "access_tier",
  "job_role",
  "service",
  "start_date",
  "employment_nature",
  "nqaits_position",
  "non_educator_role",
  "on_probation",
  "probation_start_date",
  "onboarding_complete",
  // home address
  "home_line1",
  "home_line2",
  "home_suburb",
  "home_state",
  "home_postcode",
  // postal address
  "postal_same_as_home",
  "postal_line1",
  "postal_line2",
  "postal_suburb",
  "postal_state",
  "postal_postcode",
  // WWCC
  "wwcc_exempt",
  "wwcc_exemption_reason",
  "wwcc_check_number",
  "wwcc_expiry_date",
  "wwcc_state_of_issue",
  "wwcc_sighted_date",
  "wwcc_sighted_by",
  // teacher registration (Early Childhood Teacher only)
  "teacher_check_number",
  "teacher_expiry_date",
  "teacher_state_of_issue",
  "teacher_sighted_date",
  "teacher_sighted_by",
  // qualification
  "has_no_qualifications",
  "qualification_type",
  "qualification_rto_name",
  "qualification_rto_number",
  "qualification_course_code",
  "qualification_working_towards",
  "qualification_date_attained",
  "qualification_date_commenced",
  "qualification_sighted_date",
  "qualification_sighted_by",
  // training blocks
  ...TRAINING_BLOCKS.flatMap((b) => {
    const cols = [
      `${b.prefix}_rto_name`,
      `${b.prefix}_rto_number`,
      `${b.prefix}_course_code`,
      `${b.prefix}_date_attained`,
      `${b.prefix}_expiry_date`,
      `${b.prefix}_sighted_date`,
      `${b.prefix}_sighted_by`,
    ];
    return b.type === "Other" ? [`${b.prefix}_description`, ...cols] : cols;
  }),
];

// A short example row for the template so an admin can see the expected shape.
export const IMPORT_TEMPLATE_EXAMPLE: Record<string, string> = {
  email: "jordan.example@readyset.au",
  title: "Ms",
  first_name: "Jordan",
  last_name: "Example",
  date_of_birth: "1994-03-21",
  mobile: "0400000000",
  access_tier: "staff",
  job_role: "Educator",
  service: "Timboon",
  start_date: "2026-01-20",
  employment_nature: "Direct",
  nqaits_position: "Educator",
  on_probation: "yes",
  probation_start_date: "2026-01-20",
  onboarding_complete: "yes",
  home_line1: "1 Example Street",
  home_suburb: "Timboon",
  home_state: "VIC",
  home_postcode: "3268",
  postal_same_as_home: "yes",
  wwcc_exempt: "no",
  wwcc_check_number: "WWC-0000000A-01",
  wwcc_expiry_date: "2029-03-01",
  wwcc_state_of_issue: "VIC",
  has_no_qualifications: "no",
  qualification_type: "Diploma",
  qualification_rto_name: "Example Institute",
  qualification_course_code: "CHC50121",
  qualification_working_towards: "no",
  qualification_date_attained: "2020-11-01",
  firstaid_rto_name: "St John",
  firstaid_course_code: "HLTAID012",
  firstaid_date_attained: "2025-01-10",
  firstaid_expiry_date: "2028-01-10",
};

// ---------------------------------------------------------------------------
// Delimited-file parsing (RFC 4180-ish: quotes, embedded commas and newlines)
// ---------------------------------------------------------------------------

export function parseDelimited(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // strip a UTF-8 BOM
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // handled by the \n branch; ignore
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // trailing field / row (no final newline)
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // drop fully blank rows
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export type RawRecord = { line: number; values: Record<string, string> };

export type ParseResult =
  | { ok: true; records: RawRecord[] }
  | { ok: false; error: string };

export function parseImportFile(text: string, format: "csv" | "json"): ParseResult {
  const known = new Set(IMPORT_COLUMNS);

  if (format === "json") {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: "The file is not valid JSON." };
    }
    if (!Array.isArray(data)) {
      return { ok: false, error: "The JSON file must be an array of staff objects." };
    }
    const records: RawRecord[] = [];
    data.forEach((item, idx) => {
      const values: Record<string, string> = {};
      if (item && typeof item === "object") {
        for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
          if (known.has(k)) values[k] = v == null ? "" : String(v).trim();
        }
      }
      records.push({ line: idx + 1, values });
    });
    return { ok: true, records };
  }

  const grid = parseDelimited(text);
  if (grid.length === 0) return { ok: false, error: "The file is empty." };

  const header = grid[0].map((h) => h.trim());
  const unknownCols = header.filter((h) => h !== "" && !known.has(h));
  if (header.filter((h) => known.has(h)).length === 0) {
    return {
      ok: false,
      error:
        "No recognised column headers. Use the downloadable template - the first row must be the column names.",
    };
  }

  const records: RawRecord[] = grid.slice(1).map((cells, i) => {
    const values: Record<string, string> = {};
    header.forEach((h, c) => {
      if (known.has(h)) values[h] = (cells[c] ?? "").trim();
    });
    return { line: i + 2, values }; // +2: 1 for header, 1 for 1-based
  });

  // Unknown columns are a soft warning surfaced by the caller, not a failure.
  return { ok: true, records: unknownCols.length ? tagUnknown(records, unknownCols) : records };
}

// carry the unknown-columns note on the first record so the UI can show it once
function tagUnknown(records: RawRecord[], unknown: string[]): RawRecord[] {
  if (records[0]) {
    (records[0] as RawRecord & { _unknownColumns?: string[] })._unknownColumns =
      unknown;
  }
  return records;
}

// ---------------------------------------------------------------------------
// Per-row validation and normalisation
// ---------------------------------------------------------------------------

export type CredentialInput = {
  check_number: string | null;
  expiry_date: string | null;
  state_of_issue: string | null;
  sighted_at: string | null;
  sighted_by: string | null;
};

export type QualificationInput = {
  qualification_type: string | null;
  rto_name: string | null;
  rto_number: string | null;
  course_code: string | null;
  working_towards: boolean;
  date_attained: string | null;
  date_commenced: string | null;
  sighted_at: string | null;
  sighted_by: string | null;
};

export type TrainingInput = {
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

export type ParsedWorker = {
  email: string;
  full_name: string;
  access_tier: AccessTier;
  service_id: string | null;
  job_role_id: string | null;
  onboarding_complete: boolean;
  worker_details: Record<string, unknown>;
  wwcc: CredentialInput | null;
  teacher: CredentialInput | null;
  qualification: QualificationInput | null;
  training: TrainingInput[];
};

export type RowValidation =
  | { line: number; email: string; name: string; ok: true; worker: ParsedWorker; warnings: string[] }
  | { line: number; email: string; name: string; ok: false; errors: string[] };

export type ImportContext = {
  services: { id: string; name: string }[];
  jobRoles: { id: string; name: string }[];
};

const TIER_BY_INPUT = new Map<string, AccessTier>();
for (const t of ["staff", "manager_staff", "manager_policy", "admin"] as AccessTier[]) {
  TIER_BY_INPUT.set(t, t);
  TIER_BY_INPUT.set(TIER_LABELS[t].toLowerCase(), t);
}

function normDate(v: string): string | null | "invalid" {
  const t = v.trim();
  if (t === "") return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (m) return iso(+m[3], +m[2], +m[1]); // day/month/year (AU)
  return "invalid";
}

function iso(y: number, mo: number, d: number): string | "invalid" {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "invalid";
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return "invalid";
  }
  return `${y.toString().padStart(4, "0")}-${mo
    .toString()
    .padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

function yesNo(v: string): boolean | null {
  const t = v.trim().toLowerCase();
  if (t === "") return null;
  if (["yes", "y", "true", "1"].includes(t)) return true;
  if (["no", "n", "false", "0"].includes(t)) return false;
  return null; // caller decides if that is an error
}

function matchEnum(v: string, allowed: readonly string[]): string | null {
  const t = v.trim().toLowerCase();
  if (t === "") return null;
  return allowed.find((a) => a.toLowerCase() === t) ?? "invalid";
}

// "Yes" turns up in RTO name cells in the real register - a misaligned entry.
function cleanRto(v: string): string | null {
  const t = v.trim();
  if (t === "" || t.toLowerCase() === "yes") return null;
  return t;
}

const str = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export function validateRow(rec: RawRecord, ctx: ImportContext): RowValidation {
  const g = rec.values;
  const errors: string[] = [];
  const warnings: string[] = [];

  const unknown = (rec as RawRecord & { _unknownColumns?: string[] })._unknownColumns;
  if (unknown && unknown.length) {
    warnings.push(`Ignored unrecognised columns: ${unknown.join(", ")}`);
  }

  const email = (g.email ?? "").trim().toLowerCase();
  const first = str(g.first_name);
  const last = str(g.last_name);
  const name = [first, last].filter(Boolean).join(" ") || email || "(no name)";

  if (!email || !email.includes("@")) errors.push("A valid email is required.");
  if (!first) errors.push("First name is required.");
  if (!last) errors.push("Last name is required.");

  // access tier
  let accessTier: AccessTier = "staff";
  const tierRaw = (g.access_tier ?? "").trim();
  if (tierRaw !== "") {
    const t = TIER_BY_INPUT.get(tierRaw.toLowerCase());
    if (!t) errors.push(`Unknown access tier "${tierRaw}".`);
    else accessTier = t;
  }

  // service
  let serviceId: string | null = null;
  const serviceRaw = (g.service ?? "").trim();
  if (serviceRaw === "") {
    if (ctx.services.length === 1) serviceId = ctx.services[0].id;
    else if (ctx.services.length > 1)
      errors.push("Service is required (more than one service in this organisation).");
  } else {
    const s = ctx.services.find(
      (x) => x.name.toLowerCase() === serviceRaw.toLowerCase(),
    );
    if (!s) errors.push(`No service named "${serviceRaw}" in this organisation.`);
    else serviceId = s.id;
  }

  // job role
  let jobRoleId: string | null = null;
  const roleRaw = (g.job_role ?? "").trim();
  if (roleRaw !== "") {
    const r = ctx.jobRoles.find(
      (x) => x.name.toLowerCase() === roleRaw.toLowerCase(),
    );
    if (!r) errors.push(`No job role named "${roleRaw}" in this organisation.`);
    else jobRoleId = r.id;
  }

  // enums
  const title = checkEnum(g.title, TITLES, "title", errors);
  const position = checkEnum(g.nqaits_position, NQAITS_POSITIONS, "position", errors);
  const nonEducatorRole = checkEnum(
    g.non_educator_role,
    NON_EDUCATOR_ROLES,
    "non-educator role",
    errors,
  );
  const employmentRaw = (g.employment_nature ?? "").trim();
  let employmentNature: string | null = null;
  if (employmentRaw !== "") {
    const e = matchEnum(employmentRaw, EMPLOYMENT_NATURES);
    if (e === "invalid") {
      errors.push(
        employmentRaw.toLowerCase() === "employee"
          ? 'Nature of employment "Employee" is not valid - use Direct or Indirect.'
          : `Nature of employment must be Direct or Indirect, not "${employmentRaw}".`,
      );
    } else employmentNature = e;
  }
  const homeState = checkEnum(g.home_state, AU_STATES, "home state", errors);
  const postalState = checkEnum(g.postal_state, AU_STATES, "postal state", errors);

  // dates
  const dob = checkDate(g.date_of_birth, "date of birth", errors);
  const startDate = checkDate(g.start_date, "start date", errors);
  const probationStart = checkDate(
    g.probation_start_date,
    "probation start date",
    errors,
  );

  // yes/no
  const onProbation = yesNo(g.on_probation ?? "");
  const wwccExempt = yesNo(g.wwcc_exempt ?? "") ?? false;
  const hasNoQuals = yesNo(g.has_no_qualifications ?? "") ?? false;
  const postalSame = yesNo(g.postal_same_as_home ?? "") ?? true;
  const onboardingComplete = yesNo(g.onboarding_complete ?? "") ?? true;

  // WWCC
  const wwcc = buildCredential(
    {
      check_number: g.wwcc_check_number,
      expiry_date: g.wwcc_expiry_date,
      state_of_issue: g.wwcc_state_of_issue,
      sighted_date: g.wwcc_sighted_date,
      sighted_by: g.wwcc_sighted_by,
    },
    "WWCC",
    errors,
  );
  if (wwccExempt && wwcc) {
    warnings.push("Marked WWCC-exempt but WWCC details were given - details kept, exemption recorded.");
  }

  // teacher registration
  const teacher = buildCredential(
    {
      check_number: g.teacher_check_number,
      expiry_date: g.teacher_expiry_date,
      state_of_issue: g.teacher_state_of_issue,
      sighted_date: g.teacher_sighted_date,
      sighted_by: g.teacher_sighted_by,
    },
    "teacher registration",
    errors,
  );
  if (teacher && position && position !== "Early Childhood Teacher") {
    warnings.push(
      "Teacher registration given but position is not Early Childhood Teacher - registration kept.",
    );
  }

  // qualification
  let qualification: QualificationInput | null = null;
  const qualType = checkEnum(
    g.qualification_type,
    QUALIFICATION_TYPES,
    "qualification type",
    errors,
  );
  const qualHasData =
    !!qualType ||
    !!cleanRto(g.qualification_rto_name ?? "") ||
    !!str(g.qualification_course_code) ||
    (g.qualification_date_attained ?? "").trim() !== "";
  if (qualHasData && !hasNoQuals) {
    qualification = {
      qualification_type: qualType,
      rto_name: cleanRto(g.qualification_rto_name ?? ""),
      rto_number: str(g.qualification_rto_number),
      course_code: str(g.qualification_course_code),
      working_towards: yesNo(g.qualification_working_towards ?? "") ?? false,
      date_attained: checkDate(g.qualification_date_attained, "qualification date attained", errors),
      date_commenced: checkDate(g.qualification_date_commenced, "qualification date commenced", errors),
      sighted_at: checkDate(g.qualification_sighted_date, "qualification sighted date", errors),
      sighted_by: checkEnum(g.qualification_sighted_by, SIGHTED_BY, "qualification sighted by", errors),
    };
  }

  // training blocks
  const training: TrainingInput[] = [];
  for (const block of TRAINING_BLOCKS) {
    const p = block.prefix;
    const rto = cleanRto(g[`${p}_rto_name`] ?? "");
    const course = str(g[`${p}_course_code`]);
    const attained = (g[`${p}_date_attained`] ?? "").trim();
    const desc = block.type === "Other" ? str(g[`${p}_description`]) : null;
    if (!rto && !course && attained === "" && !desc) continue;
    training.push({
      training_type: block.type,
      other_description: desc,
      rto_name: rto,
      rto_number: str(g[`${p}_rto_number`]),
      course_code: course,
      date_attained: checkDate(g[`${p}_date_attained`], `${block.type} date attained`, errors),
      expiry_date: checkDate(g[`${p}_expiry_date`], `${block.type} expiry date`, errors),
      sighted_at: checkDate(g[`${p}_sighted_date`], `${block.type} sighted date`, errors),
      sighted_by: checkEnum(g[`${p}_sighted_by`], SIGHTED_BY, `${block.type} sighted by`, errors),
    });
  }

  if (errors.length) {
    return { line: rec.line, email, name, ok: false, errors };
  }

  const worker: ParsedWorker = {
    email,
    full_name: name,
    access_tier: accessTier,
    service_id: serviceId,
    job_role_id: jobRoleId,
    onboarding_complete: onboardingComplete,
    worker_details: {
      ref_number: str(g.ref_number),
      title,
      first_name: first,
      middle_name: str(g.middle_name),
      last_name: last,
      previously_known_as: str(g.previously_known_as),
      other_names: str(g.other_names),
      date_of_birth: dob,
      phone: str(g.phone),
      mobile: str(g.mobile),
      home_line1: str(g.home_line1),
      home_line2: str(g.home_line2),
      home_suburb: str(g.home_suburb),
      home_state: homeState,
      home_postcode: str(g.home_postcode),
      postal_same_as_home: postalSame,
      postal_line1: postalSame ? null : str(g.postal_line1),
      postal_line2: postalSame ? null : str(g.postal_line2),
      postal_suburb: postalSame ? null : str(g.postal_suburb),
      postal_state: postalSame ? null : postalState,
      postal_postcode: postalSame ? null : str(g.postal_postcode),
      nqaits_position: position,
      non_educator_role: position === "Non-Educator Staff" ? nonEducatorRole : null,
      employment_nature: employmentNature,
      on_probation: onProbation,
      probation_start_date: onProbation ? probationStart : null,
      wwcc_exempt: wwccExempt,
      wwcc_exemption_reason: wwccExempt ? str(g.wwcc_exemption_reason) : null,
      has_no_qualifications: hasNoQuals,
      start_date: startDate,
    },
    wwcc,
    teacher,
    qualification,
    training,
  };

  return { line: rec.line, email, name, ok: true, worker, warnings };
}

function checkEnum(
  raw: string | undefined,
  allowed: readonly string[],
  label: string,
  errors: string[],
): string | null {
  const r = matchEnum(raw ?? "", allowed);
  if (r === "invalid") {
    errors.push(`Invalid ${label} "${(raw ?? "").trim()}". Allowed: ${allowed.join(", ")}.`);
    return null;
  }
  return r;
}

function checkDate(
  raw: string | undefined,
  label: string,
  errors: string[],
): string | null {
  const r = normDate(raw ?? "");
  if (r === "invalid") {
    errors.push(`Could not read ${label} "${(raw ?? "").trim()}". Use YYYY-MM-DD or DD/MM/YYYY.`);
    return null;
  }
  return r;
}

function buildCredential(
  raw: {
    check_number?: string;
    expiry_date?: string;
    state_of_issue?: string;
    sighted_date?: string;
    sighted_by?: string;
  },
  label: string,
  errors: string[],
): CredentialInput | null {
  const check = str(raw.check_number);
  const hasData =
    !!check ||
    (raw.expiry_date ?? "").trim() !== "" ||
    (raw.state_of_issue ?? "").trim() !== "";
  if (!hasData) return null;
  return {
    check_number: check,
    expiry_date: checkDate(raw.expiry_date, `${label} expiry date`, errors),
    state_of_issue: checkEnum(raw.state_of_issue, AU_STATES, `${label} state of issue`, errors),
    sighted_at: checkDate(raw.sighted_date, `${label} sighted date`, errors),
    sighted_by: checkEnum(raw.sighted_by, SIGHTED_BY, `${label} sighted by`, errors),
  };
}

// The CSV template as a string: header row, then one filled example row.
export function templateCsv(): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = IMPORT_COLUMNS.map(esc).join(",");
  const example = IMPORT_COLUMNS.map((c) => esc(IMPORT_TEMPLATE_EXAMPLE[c] ?? "")).join(",");
  return `${header}\r\n${example}\r\n`;
}
