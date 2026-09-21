import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SopBulkUpload } from "./bulk-upload";

export const dynamic = "force-dynamic";

export default async function BulkSopUploadPage() {
  const me = await requireContentEditor();
  const supabase = createClient();

  const [{ data: jobRoles }, { data: services }, { data: categories }] =
    await Promise.all([
      supabase
        .from("job_roles")
        .select("id, name")
        .eq("organisation_id", me.organisation_id)
        .order("name"),
      supabase
        .from("services")
        .select("id, name")
        .eq("organisation_id", me.organisation_id)
        .order("name"),
      supabase
        .from("policy_categories")
        .select("id, name")
        .eq("organisation_id", me.organisation_id)
        .eq("applies_to_procedures", true)
        .order("name"),
    ]);

  return (
    <div className="max-w-2xl">
      <Link href="/admin/sops" className="text-sm text-slate-500 hover:text-slate-900">
        ← Our Procedures
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Bulk upload procedures</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Select several procedure documents at once. Each takes its name from the
        file name and has its text pulled out automatically. Nothing is created
        until you review and commit on the next page - a likely duplicate, a
        filename-style title, or a file with no readable text are all flagged
        there for you to decide, rather than silently becoming a procedure.
      </p>
      <SopBulkUpload
        jobRoles={(jobRoles ?? []) as { id: string; name: string }[]}
        services={(services ?? []) as { id: string; name: string }[]}
        categories={(categories ?? []) as { id: string; name: string }[]}
      />
    </div>
  );
}
