import { notFound } from "next/navigation";
import { requireReportsAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tagReportData, type TagReportKind } from "@/lib/tag-report";
import { resolveTagReportScope } from "@/lib/tag-report-access";
import { TagReportPreview } from "./tag-report-preview";

export const dynamic = "force-dynamic";

const KINDS: Record<string, { kind: TagReportKind; route: string }> = {
  "quality-area": { kind: "quality_area", route: "/reports/quality-area" },
  "child-safety-standards": { kind: "child_safe_standard", route: "/reports/child-safety-standards" },
};

export default async function TagReportPreviewPage(props: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ service?: string }>;
}) {
  const me = await requireReportsAccess();
  const { kind: slug } = await props.params;
  const { service } = await props.searchParams;
  const def = KINDS[slug];
  if (!def || !me.organisation_id) notFound();

  const scope = resolveTagReportScope(me, service ?? null);
  if (!scope.ok) return <p className="text-sm text-slate-600">{scope.message}</p>;

  const supabase = createClient();
  const report = await tagReportData(supabase, {
    kind: def.kind,
    organisationId: me.organisation_id,
    timezone: me.organisation_timezone,
    serviceId: scope.serviceId,
  });

  return <TagReportPreview report={report} route={def.route} service={scope.serviceId ?? "all"} />;
}
