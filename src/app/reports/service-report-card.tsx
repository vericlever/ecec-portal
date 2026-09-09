"use client";

import { useState } from "react";
import { ReportDownloadButton } from "./report-download-button";

// A report that can be scoped to one service, or (Admin only) every service
// at once. Manager (policy) never gets the selector - the API layer pins
// them to their own service regardless, so showing a selector they cannot
// actually use would be misleading, not just decorative.
export function ServiceReportCard({
  title,
  description,
  routeBase,
  services,
  isAdmin,
  ownServiceId,
  ownServiceName,
  allowAll = true,
}: {
  title: string;
  description: string;
  routeBase: string; // e.g. "/reports/service-overview"
  services: { id: string; name: string }[];
  isAdmin: boolean;
  ownServiceId: string | null;
  ownServiceName: string | null;
  allowAll?: boolean;
}) {
  const [serviceId, setServiceId] = useState<string>(
    isAdmin ? (services[0]?.id ?? "") : (ownServiceId ?? ""),
  );

  if (!isAdmin && !ownServiceId) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
        <p className="mt-2 text-xs text-slate-400">
          You are not assigned to a service, so this report has nothing to
          scope to.
        </p>
      </div>
    );
  }

  const href = isAdmin
    ? `${routeBase}?service=${encodeURIComponent(serviceId)}`
    : `${routeBase}?service=${encodeURIComponent(ownServiceId as string)}`;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isAdmin ? (
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {allowAll && <option value="">All services</option>}
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-slate-600">{ownServiceName}</span>
        )}
        <ReportDownloadButton
          href={
            isAdmin && !serviceId
              ? `${routeBase}?service=all`
              : href
          }
          label="Download PDF"
        />
      </div>
    </div>
  );
}
