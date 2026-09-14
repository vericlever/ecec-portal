import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DisplayNameForm } from "./display-name-form";

export const dynamic = "force-dynamic";

export default async function OrganisationSettingsPage() {
  const me = await requireAdmin();
  const supabase = createClient();

  const { data: org } = await supabase
    .from("organisations")
    .select("name, display_name")
    .eq("id", me.organisation_id)
    .maybeSingle();

  return (
    <div className="max-w-lg">
      <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-900">
        ← Overview
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Organisation settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        The display name is shown to every staff member throughout the portal,
        next to their own name. It does not change your account or billing
        records.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <dl className="text-sm">
          <dt className="text-slate-500">Account name</dt>
          <dd className="text-slate-800">{org?.name ?? "—"}</dd>
        </dl>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <DisplayNameForm initialValue={org?.display_name ?? ""} />
        </div>
      </div>
    </div>
  );
}
