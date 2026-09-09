import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { NewSopForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewSopPage() {
  await requireContentEditor();
  return (
    <div className="max-w-2xl">
      <Link href="/admin/sops" className="text-sm text-slate-500 hover:text-slate-900">
        ← Procedures
      </Link>
      <h1 className="mt-3 text-xl font-semibold">New Procedure</h1>
      <p className="mt-1 text-sm text-slate-500">
        Create the procedure, then upload its document or write the text and attach it
        to job roles on the next screen. To bring in several at once, use bulk
        upload.
      </p>
      <NewSopForm />
    </div>
  );
}
