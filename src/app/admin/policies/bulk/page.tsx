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
        Select several policy documents at once. Each takes its name from the
        file name and has its text pulled out automatically. Word (.docx), PDF,
        plain text and HTML are read. Nothing is created until you review and
        commit on the next page - a likely duplicate, a filename-style title,
        or a file with no readable text are all flagged there for you to
        decide, rather than silently becoming a policy.
      </p>
      <BulkUpload />
    </div>
  );
}
