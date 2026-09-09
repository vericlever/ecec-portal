import { requireReportsAccess, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { coverageReport } from "@/lib/reports";
import { ReportDownloadButton } from "./report-download-button";
import { ServiceReportCard } from "./service-report-card";
import { StaffReportCard } from "./staff-report-card";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const me = await requireReportsAccess();
  const admin = isAdmin(me.access_tier);
  const supabase = createClient();

  const [{ data: services }, { data: staffRows }, coverage] = await Promise.all([
    supabase.from("services").select("id, name").order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, service_id")
      .eq("is_active", true)
      .neq("access_tier", "admin")
      .order("full_name"),
    coverageReport(supabase),
  ]);

  const serviceList = (services ?? []) as { id: string; name: string }[];
  const serviceName = new Map(serviceList.map((s) => [s.id, s.name]));
  const ownServiceName = me.service_id ? (serviceName.get(me.service_id) ?? null) : null;
  const staff = (staffRows ?? []).map((s) => ({
    id: s.id as string,
    name: s.full_name as string,
    serviceName: s.service_id ? (serviceName.get(s.service_id as string) ?? "Unassigned") : "Unassigned",
  }));

  return (
    <div>
      <h1 className="text-xl font-semibold">Reports</h1>
      <p className="mt-1 text-sm text-slate-500">
        {admin
          ? "Coverage checks and downloadable reports across your organisation."
          : "Coverage checks and downloadable reports for your service."}
      </p>

      {/* Step 30: coverage / orphan report */}
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Coverage report
      </h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <OrphanCard
          title="Published policies with no linked procedure"
          items={coverage.orphanPolicies.map((p) => p.name)}
          total={coverage.totalPublishedPolicies}
        />
        <OrphanCard
          title="Published procedures with no source policy"
          items={coverage.orphanSops.map((s) => s.name)}
          total={coverage.totalPublishedSops}
        />
        <OrphanCard
          title="Quality areas / child safe standards with no procedure tagged"
          items={coverage.orphanTagsSopLevel.map((t) => `${t.option.code} ${t.option.name}`)}
          total={18}
        />
        <OrphanCard
          title="Quality areas / child safe standards claimed by a policy with nothing operational under it"
          items={coverage.orphanTagsPolicyLevel.map(
            (t) =>
              `${t.option.code} ${t.option.name} (${t.policies.map((p) => p.name).join(", ")})`,
          )}
          total={18}
        />
      </div>

      {/* Steps 31-38: downloadable PDF reports */}
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Reports
      </h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <ServiceReportCard
          title="Service overview"
          description="A per-service version of the admin overview: staff, sign-off and viewing rates, outstanding items."
          routeBase="/reports/service-overview"
          services={serviceList}
          isAdmin={admin}
          ownServiceId={me.service_id}
          ownServiceName={ownServiceName}
          allowAll={false}
        />

        <SimpleReportCard
          title="Child safety standards report"
          description="One section per Child Safe Standard: every procedure tagged to it, its latest review, and what would show it is working."
          href="/reports/child-safety-standards"
        />

        <SimpleReportCard
          title="Quality area report"
          description="Same structure, one section per NQS quality area."
          href="/reports/quality-area"
        />

        <ServiceReportCard
          title="HR expiring items report"
          description="Everything expiring: credentials, WWCC, contracts."
          routeBase="/reports/hr-expiring-items"
          services={serviceList}
          isAdmin={admin}
          ownServiceId={me.service_id}
          ownServiceName={ownServiceName}
        />

        <ServiceReportCard
          title="Policy & procedure review calendar"
          description="Every review date on the books, from the existing review clock."
          routeBase="/reports/review-calendar"
          services={serviceList}
          isAdmin={admin}
          ownServiceId={me.service_id}
          ownServiceName={ownServiceName}
        />

        <StaffReportCard staff={staff} />

        <SimpleReportCard
          title="Stakeholder Notification Report"
          description="Which parent notifications fired, for which policy version, and when. Sources from the Reg 172 trigger event log."
          href="/reports/stakeholder-notifications"
          note="Reg 172 notifications are not live yet (parked on the sending domain), so this will show no records until that is resolved."
        />

        <SimpleReportCard
          title="Version & change history report"
          description="Who edited what and when, across policies and procedures."
          href="/reports/change-history"
        />
      </div>
    </div>
  );
}

function OrphanCard({
  title,
  items,
  total,
}: {
  title: string;
  items: string[];
  total: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <span
          className={`text-sm font-semibold ${items.length > 0 ? "text-amber-700" : "text-slate-400"}`}
        >
          {items.length}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-400">of {total}</p>
      {items.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm">
          {items.slice(0, 8).map((n) => (
            <li key={n} className="text-slate-600">
              {n}
            </li>
          ))}
          {items.length > 8 && (
            <li className="text-xs text-slate-400">and {items.length - 8} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

function SimpleReportCard({
  title,
  description,
  href,
  note,
}: {
  title: string;
  description: string;
  href: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      {note && <p className="mt-1 text-xs text-amber-700">{note}</p>}
      <div className="mt-3">
        <ReportDownloadButton href={href} label="Download PDF" />
      </div>
    </div>
  );
}
