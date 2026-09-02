import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { NewAgreementForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewAgreementPage() {
  await requireContentEditor();
  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/agreements"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Agreements
      </Link>
      <h1 className="mt-3 text-xl font-semibold">New agreement</h1>
      <p className="mt-1 text-sm text-slate-500">
        Create it, then set the text, choose who signs it and publish on the next
        screen.
      </p>
      <NewAgreementForm />
    </div>
  );
}
