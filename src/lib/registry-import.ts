// Parse a training.gov.au bulk extract (RTOs, or training components) into rows
// ready to upsert into rto_registry / training_components. Delimited files only;
// the column headers are matched loosely so a range of extract formats work.

import { parseDelimited } from "@/lib/nqaits-import";

export type RegistryKind = "rto" | "component";

export type RtoRow = {
  code: string;
  legal_name: string;
  trading_name: string | null;
  status: string | null;
  state: string | null;
  source_updated_at: string | null;
};

export type ComponentRow = {
  code: string;
  title: string;
  component_type: "qualification" | "unit" | "skillset" | "accredited_course";
  status: string | null;
  source_updated_at: string | null;
};

export type ParseResult<T> =
  | { ok: true; rows: T[]; skipped: number }
  | { ok: false; error: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

// Find the first header whose normalised form matches one of the candidates.
function pick(headers: string[], candidates: string[]): number {
  const wanted = candidates.map(norm);
  for (let i = 0; i < headers.length; i++) {
    if (wanted.includes(norm(headers[i]))) return i;
  }
  return -1;
}

function isoDate(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (m)
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function parseRtoExtract(text: string): ParseResult<RtoRow> {
  const grid = parseDelimited(text);
  if (grid.length < 2) return { ok: false, error: "The file has no data rows." };
  const headers = grid[0].map((h) => h.trim());

  const cCode = pick(headers, ["code", "rtocode", "rto code", "provider code", "toid"]);
  const cLegal = pick(headers, ["legalname", "legal name", "name", "rtoname", "provider name", "organisation name"]);
  const cTrading = pick(headers, ["tradingname", "trading name", "businessname"]);
  const cStatus = pick(headers, ["status", "rtostatus", "registrationstatus"]);
  const cState = pick(headers, ["state", "statecode", "stateterritory"]);
  const cDate = pick(headers, ["updated", "lastmodified", "datelastmodified", "modified"]);

  if (cCode < 0 || cLegal < 0) {
    return {
      ok: false,
      error: "Could not find a code column and a name column. Expected headers like 'Code' and 'Legal Name'.",
    };
  }

  const rows: RtoRow[] = [];
  let skipped = 0;
  for (const cells of grid.slice(1)) {
    const code = (cells[cCode] ?? "").trim();
    const legal = (cells[cLegal] ?? "").trim();
    if (!code || !legal) {
      skipped++;
      continue;
    }
    rows.push({
      code,
      legal_name: legal,
      trading_name: cTrading >= 0 ? (cells[cTrading] ?? "").trim() || null : null,
      status: cStatus >= 0 ? (cells[cStatus] ?? "").trim() || null : null,
      state: cState >= 0 ? (cells[cState] ?? "").trim().toUpperCase() || null : null,
      source_updated_at: cDate >= 0 ? isoDate(cells[cDate] ?? "") : null,
    });
  }
  return { ok: true, rows, skipped };
}

const TYPE_MAP: Record<string, ComponentRow["component_type"]> = {
  qualification: "qualification",
  qualifications: "qualification",
  unit: "unit",
  unitofcompetency: "unit",
  units: "unit",
  skillset: "skillset",
  skillsets: "skillset",
  accreditedcourse: "accredited_course",
  course: "accredited_course",
  accreditedcourses: "accredited_course",
};

function guessTypeFromCode(code: string): ComponentRow["component_type"] {
  // Qualifications: 3 letters + 5+ digits (CHC50121). Accredited courses:
  // digits + letters (22578VIC, 10392NAT). Otherwise treat as a unit.
  if (/^[A-Za-z]{3}\d{5}/.test(code)) return "qualification";
  if (/^\d{4,5}[A-Za-z]{2,3}$/.test(code)) return "accredited_course";
  return "unit";
}

export function parseComponentExtract(text: string): ParseResult<ComponentRow> {
  const grid = parseDelimited(text);
  if (grid.length < 2) return { ok: false, error: "The file has no data rows." };
  const headers = grid[0].map((h) => h.trim());

  const cCode = pick(headers, ["code", "componentcode", "nrtcode", "trainingcomponentcode"]);
  const cTitle = pick(headers, ["title", "componenttitle", "name"]);
  const cType = pick(headers, ["type", "componenttype", "category", "nrttype"]);
  const cStatus = pick(headers, ["status", "componentstatus"]);
  const cDate = pick(headers, ["updated", "lastmodified", "datelastmodified", "modified"]);

  if (cCode < 0 || cTitle < 0) {
    return {
      ok: false,
      error: "Could not find a code column and a title column. Expected headers like 'Code' and 'Title'.",
    };
  }

  const rows: ComponentRow[] = [];
  let skipped = 0;
  for (const cells of grid.slice(1)) {
    const code = (cells[cCode] ?? "").trim();
    const title = (cells[cTitle] ?? "").trim();
    if (!code || !title) {
      skipped++;
      continue;
    }
    const rawType = cType >= 0 ? norm(cells[cType] ?? "") : "";
    const component_type = TYPE_MAP[rawType] ?? guessTypeFromCode(code);
    rows.push({
      code,
      title,
      component_type,
      status: cStatus >= 0 ? (cells[cStatus] ?? "").trim() || null : null,
      source_updated_at: cDate >= 0 ? isoDate(cells[cDate] ?? "") : null,
    });
  }
  return { ok: true, rows, skipped };
}
