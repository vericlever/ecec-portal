import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { policyCategories } from "@/lib/policy-categories";
import { NewPolicyForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewPolicyPage() {
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
      <h1 className="mt-3 text-xl font-semibold">New policy</h1>
      <p className="mt-1 text-sm text-slate-500">
        Create the policy, then upload its document or paste the text on the next
        screen. To bring in several at once, use bulk upload.
      </p>
      <NewPolicyForm categories={categories} />
    </div>
  );
}
