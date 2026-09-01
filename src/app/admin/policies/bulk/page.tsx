import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { BulkUpload } from "./bulk-upload";

export const dynamic = "force-dynamic";

export default async function BulkPolicyUploadPage() {
  await requireContentEditor();
  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/policies"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Policies
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Bulk upload policies</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Select several policy documents at once. Each becomes a draft with its
        name taken from the file name and its text pulled out automatically.
        Word (.docx), PDF, plain text and HTML are read; a file whose name
        matches an existing policy is attached to it rather than duplicated.
        Nothing is shown to staff until you publish it.
      </p>
      <BulkUpload />
    </div>
  );
}
