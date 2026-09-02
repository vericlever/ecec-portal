import { createClient } from "@/lib/supabase/server";

type ServerClient = ReturnType<typeof createClient>;

export type AgreementListItem = {
  id: string;
  name: string;
  publishedVersion: number;
  linkedPolicyId: string | null;
  signed: boolean;
};

// The published agreements a person is expected to sign, and whether they have
// signed the current version. An agreement applies if all_staff is true, or if
// the person's job role is one of the agreement's targeted roles.
export async function agreementsForProfile(
  supabase: ServerClient,
  profile: { id: string; job_role_id: string | null },
): Promise<AgreementListItem[]> {
  const [{ data: agreements }, { data: roleLinks }, { data: signoffs }] =
    await Promise.all([
      supabase
        .from("hr_agreements")
        .select("id, name, published_version, all_staff, linked_policy_id")
        .not("published_version", "is", null)
        .order("name"),
      supabase.from("hr_agreement_job_roles").select("agreement_id, job_role_id"),
      supabase
        .from("hr_agreement_signoffs")
        .select("agreement_id, agreement_version")
        .eq("user_id", profile.id),
    ]);

  const rolesByAgreement = new Map<string, Set<string>>();
  for (const r of roleLinks ?? []) {
    const set = rolesByAgreement.get(r.agreement_id as string) ?? new Set();
    set.add(r.job_role_id as string);
    rolesByAgreement.set(r.agreement_id as string, set);
  }
  const signedVersions = new Map<string, Set<number>>();
  for (const s of signoffs ?? []) {
    const set = signedVersions.get(s.agreement_id as string) ?? new Set();
    set.add(s.agreement_version as number);
    signedVersions.set(s.agreement_id as string, set);
  }

  const out: AgreementListItem[] = [];
  for (const a of agreements ?? []) {
    const applies =
      a.all_staff ||
      (profile.job_role_id != null &&
        rolesByAgreement.get(a.id as string)?.has(profile.job_role_id));
    if (!applies) continue;
    out.push({
      id: a.id as string,
      name: a.name as string,
      publishedVersion: a.published_version as number,
      linkedPolicyId: (a.linked_policy_id as string | null) ?? null,
      signed: Boolean(
        signedVersions.get(a.id as string)?.has(a.published_version as number),
      ),
    });
  }
  return out;
}

// Batch: how many published agreements each person still has to sign. Used by
// the staff list and dashboard roll-ups. RLS scopes the signoffs to the
// caller's staff.
export async function unsignedAgreementsByProfile(
  supabase: ServerClient,
  people: { id: string; job_role_id: string | null }[],
): Promise<Map<string, number>> {
  const [{ data: agreements }, { data: roleLinks }, { data: signoffs }] =
    await Promise.all([
      supabase
        .from("hr_agreements")
        .select("id, published_version, all_staff")
        .not("published_version", "is", null),
      supabase.from("hr_agreement_job_roles").select("agreement_id, job_role_id"),
      supabase
        .from("hr_agreement_signoffs")
        .select("user_id, agreement_id, agreement_version"),
    ]);

  const rolesByAgreement = new Map<string, Set<string>>();
  for (const r of roleLinks ?? []) {
    const set = rolesByAgreement.get(r.agreement_id as string) ?? new Set();
    set.add(r.job_role_id as string);
    rolesByAgreement.set(r.agreement_id as string, set);
  }
  const signedByUser = new Map<string, Set<string>>();
  for (const s of signoffs ?? []) {
    const set = signedByUser.get(s.user_id as string) ?? new Set();
    set.add(`${s.agreement_id}:${s.agreement_version}`);
    signedByUser.set(s.user_id as string, set);
  }

  const out = new Map<string, number>();
  for (const p of people) {
    let unsigned = 0;
    for (const a of agreements ?? []) {
      const applies =
        a.all_staff ||
        (p.job_role_id != null &&
          rolesByAgreement.get(a.id as string)?.has(p.job_role_id));
      if (!applies) continue;
      const signed = signedByUser
        .get(p.id)
        ?.has(`${a.id}:${a.published_version}`);
      if (!signed) unsigned += 1;
    }
    out.set(p.id, unsigned);
  }
  return out;
}
