import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManager, isAdmin } from "@/lib/auth";
import { NewStaffForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewStaffPage() {
  const me = await requireManager();
  const supabase = createClient();

  const [{ data: services }, { data: jobRoles }] = await Promise.all([
    supabase.from("services").select("id, name").order("name"),
    supabase.from("job_roles").select("id, name, is_placeholder").order("name"),
  ]);

  return (
    <div className="max-w-md">
      <Link
        href="/admin/staff"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Staff
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Add staff member</h1>
      <p className="mt-1 text-sm text-slate-500">
        Creates an account in your organisation. You will get a temporary
        password to pass on; they change it after signing in.
      </p>

      <NewStaffForm
        canSetTier={isAdmin(me.access_tier)}
        services={(services ?? []) as { id: string; name: string }[]}
        jobRoles={
          (jobRoles ?? []) as {
            id: string;
            name: string;
            is_placeholder: boolean;
          }[]
        }
      />
    </div>
  );
}
