import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PolicyViewPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();
  const supabase = createClient();

  // RLS lets this through only if the policy is published and targets this
  // person (or they are a content editor).
  const { data: policy } = await supabase
    .from("policies")
    .select(
      "id, name, document_type, published_body, published_version, published_at, source_document_id, is_parent_facing",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!policy || policy.published_version == null) notFound();

  // Record that this version has been seen. One row per person per version.
  await supabase.from("policy_views").upsert(
    {
      organisation_id: profile.organisation_id,
      service_id: profile.service_id,
      user_id: profile.id,
      policy_id: policy.id,
      policy_version: policy.published_version,
    },
    { onConflict: "user_id,policy_id,policy_version", ignoreDuplicates: true },
  );

  const { data: links } = await supabase
    .from("policy_sop_links")
    .select("sop_id")
    .eq("policy_id", policy.id);
  const sopIds = (links ?? []).map((l) => l.sop_id);
  const { data: sops } = sopIds.length
    ? await supabase.from("sops").select("id, name").in("id", sopIds)
    : { data: [] };

  return (
    <div>
      <Link
        href="/policies"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Policies
      </Link>

      <h1 className="mt-3 text-xl font-semibold">{policy.name}</h1>
      <p className="mt-1 text-xs text-slate-500">
        {policy.is_parent_facing && "Parent-facing · "}
        Version {policy.published_version}
        {policy.published_at &&
          ` · published ${new Date(policy.published_at).toLocaleDateString("en-AU", { dateStyle: "medium" })}`}
        {" · "}
        <span className="text-green-700">viewed</span>
      </p>

      {policy.source_document_id && (
        <p className="mt-2 text-sm">
          <a
            href={`/api/documents/${policy.source_document_id}`}
            className="text-slate-600 underline"
          >
            Download the original document
          </a>
        </p>
      )}

      <article className="mt-5 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-800">
        {policy.published_body || "(No text)"}
      </article>

      {(sops ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Related Procedures
          </h2>
          <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {(sops ?? []).map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sops/${s.id}`}
                  className="block px-4 py-2.5 text-sm hover:bg-slate-50"
                >
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
