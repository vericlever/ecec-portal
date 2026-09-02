import { createClient } from "@/lib/supabase/server";
import { pendingSightingsByProfile } from "@/lib/verification";

type ServerClient = ReturnType<typeof createClient>;

export type StaffStat = {
  sopSigned: number;
  sopTotal: number;
  sopPct: number | null;
  policyViewed: number;
  policyTotal: number;
  policyPct: number | null;
  outstanding: number;
};

// Batch version of the per-person figures shown on a staff record: SOP sign-off
// %, policy view %, and the count of outstanding HR tasks. Computed set-based so
// a staff list of any size is a fixed number of queries. RLS already limits
// every table to rows the caller may see, which matches the people list.
export async function staffStatsByProfile(
  supabase: ServerClient,
  people: { id: string; job_role_id: string | null; service_id: string | null }[],
  currentProfileId: string,
): Promise<Map<string, StaffStat>> {
  const jobRoleIds = Array.from(
    new Set(
      people.map((p) => p.job_role_id).filter((x): x is string => Boolean(x)),
    ),
  );

  const [
    { data: roleSops },
    { data: sops },
    { data: signOffs },
    { data: policies },
    { data: policyViews },
    { data: workerDetails },
    pendingSightings,
  ] = await Promise.all([
    supabase
      .from("job_role_sops")
      .select("job_role_id, sop_id")
      .in("job_role_id", jobRoleIds),
    supabase
      .from("sops")
      .select("id, published_version, signoff_type")
      .not("published_version", "is", null),
    supabase
      .from("sign_offs")
      .select("user_id, sop_id, sop_version, verified_at"),
    supabase.rpc("org_published_policies"),
    supabase.from("policy_views").select("user_id, policy_id, policy_version"),
    supabase.from("worker_details").select("profile_id, onboarding_completed_at"),
    pendingSightingsByProfile(supabase, currentProfileId),
  ]);

  // Only published SOPs count. A self_and_manager SOP is not "signed" until the
  // manager has countersigned too.
  const publishedSop = new Map(
    (sops ?? []).map((s) => [
      s.id as string,
      {
        version: s.published_version as number,
        needsManager: s.signoff_type === "self_and_manager",
      },
    ]),
  );
  const suiteByRole = new Map<string, string[]>();
  for (const rs of roleSops ?? []) {
    const list = suiteByRole.get(rs.job_role_id as string) ?? [];
    list.push(rs.sop_id as string);
    suiteByRole.set(rs.job_role_id as string, list);
  }

  const signedByUser = new Map<string, Map<string, boolean>>();
  for (const s of signOffs ?? []) {
    const m = signedByUser.get(s.user_id as string) ?? new Map<string, boolean>();
    m.set(`${s.sop_id}:${s.sop_version}`, Boolean(s.verified_at));
    signedByUser.set(s.user_id as string, m);
  }

  // Every published policy in the org, with its site scope. A person is
  // "expected to view" a policy if it has no site scope or matches their site.
  // (Job-role targeting is deferred - no audience rows exist for it yet.)
  type PubPolicy = { id: string; published_version: number; service_id: string | null };
  const publishedPolicies = (policies ?? []) as PubPolicy[];
  const viewedByUser = new Map<string, Set<string>>();
  for (const v of policyViews ?? []) {
    const set = viewedByUser.get(v.user_id as string) ?? new Set<string>();
    set.add(`${v.policy_id}:${v.policy_version}`);
    viewedByUser.set(v.user_id as string, set);
  }

  const onboarded = new Set(
    (workerDetails ?? [])
      .filter((w) => w.onboarding_completed_at)
      .map((w) => w.profile_id as string),
  );

  const out = new Map<string, StaffStat>();
  for (const p of people) {
    const suite = (p.job_role_id ? (suiteByRole.get(p.job_role_id) ?? []) : [])
      .filter((sopId) => publishedSop.has(sopId));
    const sopTotal = suite.length;
    const signed = signedByUser.get(p.id) ?? new Map<string, boolean>();
    const sopSigned = suite.filter((sopId) => {
      const pub = publishedSop.get(sopId)!;
      const verified = signed.get(`${sopId}:${pub.version}`);
      if (verified === undefined) return false;
      return pub.needsManager ? verified : true;
    }).length;

    const expected = publishedPolicies.filter(
      (pol) => pol.service_id == null || pol.service_id === p.service_id,
    );
    const policyTotal = expected.length;
    const viewed = viewedByUser.get(p.id) ?? new Set<string>();
    const policyViewed = expected.filter((pol) =>
      viewed.has(`${pol.id}:${pol.published_version}`),
    ).length;

    // Everything still expected of this person: onboarding questionnaire,
    // documents a leader has not sighted, SOPs not fully signed (a
    // self_and_manager SOP counts until the manager countersigns), and
    // published policies not yet viewed. This is the number the staff record
    // page breaks down item by item.
    const onboardingOutstanding =
      p.job_role_id && !onboarded.has(p.id) ? 1 : 0;
    const outstanding =
      onboardingOutstanding +
      (pendingSightings.get(p.id) ?? 0) +
      (sopTotal - sopSigned) +
      (policyTotal - policyViewed);

    out.set(p.id, {
      sopSigned,
      sopTotal,
      sopPct: sopTotal > 0 ? Math.round((sopSigned / sopTotal) * 100) : null,
      policyViewed,
      policyTotal,
      policyPct:
        policyTotal > 0 ? Math.round((policyViewed / policyTotal) * 100) : null,
      outstanding,
    });
  }
  return out;
}
