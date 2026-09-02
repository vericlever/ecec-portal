import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { SopBulkUpload } from "./bulk-upload";

export const dynamic = "force-dynamic";

export default async function BulkSopUploadPage() {
  await requireContentEditor();
  return (
    <div className="max-w-2xl">
      <Link href="/admin/sops" className="text-sm text-slate-500 hover:text-slate-900">
        ← SOPs
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Bulk upload SOPs</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Select several SOP documents at once. Each becomes a draft with its name
        from the file name and its text pulled out automatically. A file whose
        name matches an existing SOP is attached to it and fills its empty
        content, rather than duplicating. Nothing is shown to staff until you
        publish it and attach it to a job role.
      </p>
      <SopBulkUpload />
    </div>
  );
}
