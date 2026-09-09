import Link from "next/link";
import { requireProfile, isWorker, TIER_LABELS } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data: org }, { data: service }, { data: jobRole }] =
    await Promise.all([
      profile.organisation_id
        ? supabase
            .from("organisations")
            .select("name")
            .eq("id", profile.organisation_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      profile.service_id
        ? supabase
            .from("services")
            .select("name")
            .eq("id", profile.service_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      profile.job_role_id
        ? supabase
            .from("job_roles")
            .select("name")
            .eq("id", profile.job_role_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const worker = isWorker(profile);

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold">{profile.full_name}</h1>
      <p className="mt-1 text-sm text-slate-500">Your profile</p>

      <dl className="mt-6 grid grid-cols-3 gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <dt className="text-slate-500">Email</dt>
        <dd className="col-span-2 text-slate-800">{profile.email}</dd>

        <dt className="text-slate-500">Access level</dt>
        <dd className="col-span-2 text-slate-800">
          {TIER_LABELS[profile.access_tier]}
          {profile.hr_manager && " · HR manager"}
        </dd>

        <dt className="text-slate-500">Organisation</dt>
        <dd className="col-span-2 text-slate-800">{org?.name ?? "—"}</dd>

        <dt className="text-slate-500">Site</dt>
        <dd className="col-span-2 text-slate-800">
          {service?.name ?? "All sites"}
        </dd>

        <dt className="text-slate-500">Job role</dt>
        <dd className="col-span-2 text-slate-800">
          {jobRole?.name ?? "None"}
        </dd>
      </dl>

      <div className="mt-6 space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Manage your account
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/account/password"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Change password
          </Link>
          {worker && (
            <>
              <Link
                href="/onboarding"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Your details
              </Link>
              <Link
                href="/agreements"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Your agreements
              </Link>
            </>
          )}
        </div>
        {!worker && (
          <p className="text-xs text-slate-400">
            You do not have a job role, so there is no Worker Register record or
            procedure suite attached to this account.
          </p>
        )}
      </div>

      <form action="/logout" method="post" className="mt-8">
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
