import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AgreementEditor } from "./agreement-editor";

export const dynamic = "force-dynamic";

export default async function AgreementDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireContentEditor();
  const supabase = createClient();

  const [{ data: agreement }, { data: jobRoles }, { data: policies }] =
    await Promise.all([
      supabase.from("hr_agreements").select("*").eq("id", params.id).maybeSingle(),
      supabase.from("job_roles").select("id, name").order("name"),
      supabase
        .from("policies")
        .select("id, name")
        .not("published_version", "is", null)
        .order("name"),
    ]);

  if (!agreement || agreement.organisation_id !== me.organisation_id) notFound();

  const [{ data: roleLinks }, { data: signoffs }, { data: staff }] =
    await Promise.all([
      supabase
        .from("hr_agreement_job_roles")
        .select("job_role_id")
        .eq("agreement_id", params.id),
      supabase
        .from("hr_agreement_signoffs")
        .select("user_id, agreement_version, signed_at")
        .eq("agreement_id", params.id),
      supabase
        .from("profiles")
        .select("id, full_name, job_role_id, is_active")
        .neq("access_tier", "admin"),
    ]);

  const linkedRoleIds = (roleLinks ?? []).map((l) => l.job_role_id as string);
  const roleSet = new Set(linkedRoleIds);

  // Who is expected to sign, and whether they have signed the current version.
  const signedNow = new Map<string, string>();
  for (const s of signoffs ?? []) {
    if (s.agreement_version === agreement.published_version) {
      signedNow.set(s.user_id as string, s.signed_at as string);
    }
  }
  const roster =
    agreement.published_version == null
      ? []
      : (staff ?? [])
          .filter(
            (p) =>
              p.is_active &&
              (agreement.all_staff ||
                (p.job_role_id != null && roleSet.has(p.job_role_id))),
          )
          .map((p) => ({
            id: p.id as string,
            name: p.full_name as string,
            signedAt: signedNow.get(p.id as string) ?? null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/agreements"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Agreements
      </Link>
      <AgreementEditor
        agreement={{
          id: agreement.id,
          name: agreement.name,
          body: agreement.body ?? "",
          published_body: agreement.published_body ?? "",
          published_version: agreement.published_version,
          published_at: agreement.published_at,
          all_staff: agreement.all_staff,
          linked_policy_id: agreement.linked_policy_id,
        }}
        jobRoles={(jobRoles ?? []) as { id: string; name: string }[]}
        policies={(policies ?? []) as { id: string; name: string }[]}
        linkedRoleIds={linkedRoleIds}
        roster={roster}
      />
    </div>
  );
}
