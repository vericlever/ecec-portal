"use client";

import { useMemo, useState } from "react";
import { ReportDownloadButton } from "./report-download-button";

export function StaffReportCard({
  staff,
}: {
  staff: { id: string; name: string; serviceName: string }[];
}) {
  const [query, setQuery] = useState("");
  const [profileId, setProfileId] = useState(staff[0]?.id ?? "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (s) => s.name.toLowerCase().includes(q) || s.serviceName.toLowerCase().includes(q),
    );
  }, [query, staff]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">
        Per-staff compliance report
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Everything signed off, everything outstanding, and credential and
        contract status, for one staff member.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a staff member"
          className="w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          className="min-w-[12rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {filtered.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.serviceName}
            </option>
          ))}
        </select>
        <ReportDownloadButton
          href={`/reports/per-staff-compliance?profile=${encodeURIComponent(profileId)}`}
          label="Download PDF"
        />
      </div>
    </div>
  );
}
