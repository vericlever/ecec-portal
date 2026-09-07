import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { policyCategories } from "@/lib/policy-categories";
import { BulkUpload } from "./bulk-upload";

export const dynamic = "force-dynamic";

export default async function BulkPolicyUploadPage() {
  await requireContentEditor();
  const categories = await policyCategories(createClient());
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
        plain text and HTML are read; a file whose name matches an existing
        policy is attached to it rather than duplicated. The next page lists
        everything ready to publish in one step; a file with no readable text
        stays a draft.
      </p>
      <BulkUpload categories={categories} />
    </div>
  );
}
