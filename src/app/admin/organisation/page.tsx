import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DisplayNameForm } from "./display-name-form";
import { BulkDeleteControl } from "./bulk-delete-control";
import { bulkDeleteProcedures, bulkDeletePolicies } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrganisationSettingsPage() {
  const me = await requireAdmin();
  const supabase = createClient();

  const [{ data: org }, { count: sopCount }, { count: policyCount }] = await Promise.all([
    supabase
      .from("organisations")
      .select("name, display_name")
      .eq("id", me.organisation_id)
      .maybeSingle(),
    supabase.from("sops").select("id", { count: "exact", head: true }),
    supabase.from("policies").select("id", { count: "exact", head: true }),
  ]);

  const orgLabel = org?.display_name || org?.name || "your organisation";
  const supportSubject = encodeURIComponent(`Support request - ${orgLabel}`);
  const supportBody = encodeURIComponent(
    `Organisation: ${orgLabel}\nSigned in as: ${me.full_name} (${me.email})\n\nWhat's happening:\n`,
  );

  return (
    <div className="max-w-lg">
      <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-900">
        ← Overview
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Organisation settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage your organisation's account, subscription and content library.
      </p>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Company information
        </h2>
        <dl className="mt-2 text-sm">
          <dt className="text-slate-500">Account name</dt>
          <dd className="text-slate-800">{org?.name ?? "—"}</dd>
        </dl>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <DisplayNameForm initialValue={org?.display_name ?? ""} />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Subscription
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Subscription management is not available yet. Contact support below for
          anything billing-related in the meantime.
        </p>
        <button
          type="button"
          disabled
          className="mt-3 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-400"
        >
          Manage subscription
        </button>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Support
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Opens your email client, addressed to Vericlever support.
        </p>
        <a
          href={`mailto:info@vericlever.com.au?subject=${supportSubject}&body=${supportBody}`}
          className="mt-3 inline-block rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Ask for help
        </a>
      </section>

      <section className="mt-6 rounded-lg border border-red-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-red-700">
          Danger zone
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          For a full replacement of your content library - clearing everything out
          before a fresh bulk upload, not for removing one or two items. No undo.
        </p>
        <div className="mt-3 space-y-3">
          <BulkDeleteControl
            title={`Permanently delete all procedures (${sopCount ?? 0})`}
            description="Removes every procedure and everything attached to it - job role assignments, sign-off history, review history, comprehension questions and attempts, staff outcome flags."
            confirmMessage={`This cannot be undone. Permanently delete all ${sopCount ?? 0} procedures?`}
            action={bulkDeleteProcedures}
          />
          <BulkDeleteControl
            title={`Permanently delete all policies (${policyCount ?? 0})`}
            description="Removes every policy and everything attached to it - procedure links, category tags, view history, approval history. Linked agreements are unlinked, not deleted."
            confirmMessage={`This cannot be undone. Permanently delete all ${policyCount ?? 0} policies?`}
            action={bulkDeletePolicies}
          />
        </div>
      </section>
    </div>
  );
}
