import { reportsProfileOrResponse, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { organisationName, resolveReportScope, serviceOverviewData } from "@/lib/reports";
import { pdfResponse } from "@/lib/pdf";
import { ServiceOverviewPdf } from "./pdf";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await reportsProfileOrResponse();
  if (!auth.ok) return auth.response;
  const { profile } = auth;

  const url = new URL(req.url);
  const requested = url.searchParams.get("service");
  const { serviceId } = resolveReportScope(profile, requested || null);
  if (!serviceId) {
    return new Response(
      isAdmin(profile.access_tier)
        ? "Choose a service."
        : "You are not assigned to a service.",
      { status: 400 },
    );
  }

  const supabase = createClient();
  const [orgName, data] = await Promise.all([
    organisationName(supabase, profile.organisation_id),
    serviceOverviewData(supabase, serviceId, profile.id),
  ]);

  return pdfResponse(
    ServiceOverviewPdf({ orgName, data }),
    `Service overview - ${data.serviceName}.pdf`,
  );
}
