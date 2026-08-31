import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { NewStaffForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewStaffPage() {
  await requireAdmin();
  const supabase = createClient();
  const { data: sites } = await supabase
    .from("sites")
    .select("id, name")
    .order("name");

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

      <NewStaffForm sites={(sites ?? []) as { id: string; name: string }[]} />
    </div>
  );
}
