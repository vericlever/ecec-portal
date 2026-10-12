"use client";

import Link from "next/link";
import { useState } from "react";
import { ReportDownloadButton } from "./report-download-button";

// Card for the Child safety standards and Quality area reports. Same service
// selector pattern as ServiceReportCard, but All Services is an option (and
// the default) for anyone whose reach spans every service. Everyone else is
// pinned to their own service by the API, so they see it as plain text.
export function TagReportCard({
  title,
  description,
  slug,
  services,
  broadReach,
  ownServiceId,
  ownServiceName,
}: {
  title: string;
  description: string;
  slug: "quality-area" | "child-safety-standards";
  services: { id: string; name: string }[];
  broadReach: boolean;
  ownServiceId: string | null;
  ownServiceName: string | null;
}) {
  const [serviceId, setServiceId] = useState<string>("all");

  if (!broadReach && !ownServiceId) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
        <p className="mt-2 text-xs text-slate-400">
          You are not assigned to a service, so this report has nothing to scope to.
        </p>
      </div>
    );
  }

  const selected = broadReach ? serviceId : (ownServiceId as string);
  const query = `service=${encodeURIComponent(selected)}`;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        {broadReach ? (
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            aria-label="Service"
          >
            <option value="all">All Services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="py-1.5 text-sm text-slate-600">{ownServiceName}</span>
        )}
        <Link
          href={`/reports/preview/${slug}?${query}`}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Preview and edit statements
        </Link>
        <ReportDownloadButton href={`/reports/${slug}?${query}`} label="Download PDF" />
      </div>
    </div>
  );
}
