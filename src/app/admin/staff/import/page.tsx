import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { IMPORT_COLUMNS } from "@/lib/nqaits-import";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function ImportStaffPage() {
  await requireAdmin();

  return (
    <div>
      <Link
        href="/admin/staff"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Staff
      </Link>

      <h1 className="mt-3 text-xl font-semibold">Bulk import staff</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Upload a spreadsheet (CSV) or JSON file to create several staff accounts
        at once, each with their NQAITS Worker Register details. Bulk import is
        for new people only. Existing accounts are left untouched and reported as
        skipped.
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <p className="font-medium">Before you start</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
          <li>
            Download the template, fill one row per person, keep the header row.
          </li>
          <li>
            <span className="font-medium">email</span>,{" "}
            <span className="font-medium">first_name</span> and{" "}
            <span className="font-medium">last_name</span> are required on every
            row.
          </li>
          <li>
            <span className="font-medium">service</span> and{" "}
            <span className="font-medium">job_role</span> must match names that
            already exist in your organisation.
          </li>
          <li>
            Leave <span className="font-medium">access_tier</span> blank for
            ordinary staff. Dates can be <code>YYYY-MM-DD</code> or{" "}
            <code>DD/MM/YYYY</code>.
          </li>
          <li>
            Each new account gets a temporary password you download at the end
            and pass on.
          </li>
        </ul>
        <p className="mt-3">
          <a
            href="/admin/staff/import/template"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Download CSV template
          </a>
          <span className="ml-3 text-xs text-slate-400">
            {IMPORT_COLUMNS.length} columns
          </span>
        </p>
      </div>

      <ImportClient />
    </div>
  );
}
