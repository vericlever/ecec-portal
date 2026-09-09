import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SopBulkUpload } from "./bulk-upload";

export const dynamic = "force-dynamic";

export default async function BulkSopUploadPage() {
  await requireContentEditor();
  const supabase = createClient();
  const { data: jobRoles } = await supabase
    .from("job_roles")
    .select("id, name")
    .order("name");

  return (
    <div className="max-w-2xl">
      <Link href="/admin/sops" className="text-sm text-slate-500 hover:text-slate-900">
        ← Procedures
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Bulk upload procedures</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Select several procedure documents at once. Each takes its name from the file
        name and has its text pulled out automatically. A file whose name
        matches an existing procedure is attached to it and fills its empty content,
        rather than duplicating. The next page lists everything ready to
        publish in one step; a file with no readable text stays a draft.
      </p>
      <SopBulkUpload
        jobRoles={(jobRoles ?? []) as { id: string; name: string }[]}
      />
    </div>
  );
}
