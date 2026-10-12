import { reportsProfileOrResponse } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { organisationName } from "@/lib/reports";
import { pdfResponse } from "@/lib/pdf";
import { tagReportData, type TagReportKind } from "@/lib/tag-report";
import { resolveTagReportScope } from "@/lib/tag-report-access";
import { TagReportPdf } from "./tag-report";

// Shared handler behind /reports/quality-area and /reports/child-safety-standards.
// GET downloads the auto-drafted report; POST carries the QIP statements the
// reader edited on the preview page.
export async function tagReportResponse(
  kind: TagReportKind,
  requestedService: string | null,
  statements?: Record<string, string>,
): Promise<Response> {
  const auth = await reportsProfileOrResponse();
  if (!auth.ok) return auth.response;
  const { profile } = auth;
  if (!profile.organisation_id) return new Response("No organisation.", { status: 400 });

  const scope = resolveTagReportScope(profile, requestedService);
  if (!scope.ok) return new Response(scope.message, { status: 400 });

  const supabase = createClient();
  const [orgName, report] = await Promise.all([
    organisationName(supabase, profile.organisation_id),
    tagReportData(supabase, {
      kind,
      organisationId: profile.organisation_id,
      timezone: profile.organisation_timezone,
      serviceId: scope.serviceId,
    }),
  ]);

  return pdfResponse(
    TagReportPdf({ orgName, report, statements }),
    `${report.title} - ${report.serviceLabel}.pdf`,
  );
}

export function statementsFrom(body: unknown): Record<string, string> {
  const raw = (body as { statements?: unknown } | null)?.statements;
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v.slice(0, 4000);
    }
  }
  return out;
}
