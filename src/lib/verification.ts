import { createClient } from "@/lib/supabase/server";
import { executionState, type ContractRow } from "@/lib/contracts";
import { contractDueDate, dueSignoffPhrase } from "@/lib/signoff-clock";

type ServerClient = ReturnType<typeof createClient>;

// The document tables a leader sights during onboarding verification.
const SIGHTABLE_TABLES = [
  "wwcc_checks",
  "teacher_registrations",
  "qualifications",
  "training_records",
  "identity_documents",
] as const;

type VerifiableTable = (typeof SIGHTABLE_TABLES)[number];

// How many unsighted documents are waiting, per staff member. RLS already limits
// the rows to workers the caller manages, so this is the caller's real queue.
// The caller's own documents are never their own to sight, so they are excluded.
export async function pendingSightingsByProfile(
  supabase: ServerClient,
  excludeProfileId: string,
): Promise<Map<string, number>> {
  const results = await Promise.all(
    SIGHTABLE_TABLES.map((table) =>
      supabase.from(table).select("profile_id").is("sighted_at", null),
    ),
  );

  const counts = new Map<string, number>();
  for (const { data } of results) {
    for (const row of data ?? []) {
      const pid = row.profile_id as string;
      if (pid === excludeProfileId) continue;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
  }
  return counts;
}

export type VerificationItem =
  | { kind: "sighting"; table: VerifiableTable; recordId: string; label: string }
  | { kind: "contract_countersign"; contractId: string; label: string; documentId: string | null }
  // Nothing for the viewer to act on - only the employee can sign their own
  // contract - but shown so a leader can see who is behind and chase it up.
  | { kind: "contract_unsigned"; label: string; documentId: string | null };

export type VerificationGroup = {
  profileId: string;
  name: string;
  items: VerificationItem[];
};

function sightingLabel(table: VerifiableTable, row: Record<string, unknown>): string {
  switch (table) {
    case "wwcc_checks":
      return `Working with Children Check${row.check_number ? ` — ${row.check_number}` : ""}`;
    case "teacher_registrations":
      return `Teacher registration${row.check_number ? ` — ${row.check_number}` : ""}`;
    case "qualifications":
      return `Qualification — ${row.qualification_type ?? "unspecified"}`;
    case "training_records":
      return `Training — ${row.training_type}${row.other_description ? ` (${row.other_description})` : ""}`;
    case "identity_documents": {
      const kindLabel =
        row.kind === "photo_id"
          ? "Photo ID"
          : row.kind === "visa"
            ? "Visa document"
            : "Identity document";
      return row.label ? `${kindLabel} — ${row.label}` : kindLabel;
    }
  }
}

// Every outstanding sighting or contract-countersignature item, grouped by the
// staff member it belongs to - the "Complete staff sign-off" hub. RLS already
// limits every query here to workers the caller manages (or is HR for), so
// this is the caller's real queue; the caller's own items are never their own
// to act on, so they are excluded. Only active staff are included - someone
// made inactive drops off this list along with everything else about them.
export async function verificationGroups(
  supabase: ServerClient,
  excludeProfileId: string,
): Promise<VerificationGroup[]> {
  const [sightingResults, { data: contractRows }] = await Promise.all([
    Promise.all(
      SIGHTABLE_TABLES.map((table) =>
        supabase.from(table).select("*").is("sighted_at", null),
      ),
    ),
    supabase
      .from("contracts")
      .select(
        "id, profile_id, requires_countersign, signed_at, countersigned_at, superseded_at, created_at, document_id, signed_copy_document_id",
      )
      .is("superseded_at", null),
  ]);

  const byProfile = new Map<string, VerificationItem[]>();
  function push(profileId: string, item: VerificationItem) {
    if (profileId === excludeProfileId) return;
    const list = byProfile.get(profileId);
    if (list) list.push(item);
    else byProfile.set(profileId, [item]);
  }

  SIGHTABLE_TABLES.forEach((table, i) => {
    for (const row of sightingResults[i].data ?? []) {
      push(row.profile_id as string, {
        kind: "sighting",
        table,
        recordId: row.id as string,
        label: sightingLabel(table, row),
      });
    }
  });

  const contracts = (contractRows ?? []) as unknown as ContractRow[];
  const profileIds = [...new Set(contracts.map((c) => c.profile_id))];
  const { data: signingProfiles } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, signing_paused_at, signing_paused_days_banked")
        .in("id", profileIds)
    : { data: [] as { id: string; signing_paused_at: string | null; signing_paused_days_banked: number | null }[] };
  const pauseOf = new Map((signingProfiles ?? []).map((p) => [p.id, p]));

  for (const contract of contracts) {
    const state = executionState(contract);
    // The signed copy (original + execution page, employee's signature already
    // on it) once it exists - the document a countersigner should actually be
    // reviewing - falling back to the as-uploaded original if it doesn't yet.
    const documentId = contract.signed_copy_document_id ?? contract.document_id;
    if (state === "awaiting_countersign") {
      push(contract.profile_id, {
        kind: "contract_countersign",
        contractId: contract.id,
        label: "Employment contract — awaiting countersignature",
        documentId,
      });
    } else if (state === "unsigned") {
      const pause = pauseOf.get(contract.profile_id);
      const due = contractDueDate(contract.created_at, pause?.signing_paused_days_banked ?? 0);
      const status = pause?.signing_paused_at ? "Paused" : dueSignoffPhrase(due);
      push(contract.profile_id, {
        kind: "contract_unsigned",
        label: `Employment contract — not signed yet · ${status}`,
        documentId,
      });
    }
  }

  if (byProfile.size === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, is_active");
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
  const activeOf = new Map((profiles ?? []).map((p) => [p.id, p.is_active as boolean]));

  return [...byProfile.entries()]
    .filter(([id]) => activeOf.get(id) ?? true)
    .map(([profileId, items]) => ({
      profileId,
      name: nameOf.get(profileId) ?? "Unknown",
      items,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}