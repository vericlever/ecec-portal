import { reportsProfileOrResponse, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hrExpiringItemsData, organisationName, resolveReportScope } from "@/lib/reports";
import { pdfResponse } from "@/lib/pdf";
import { HrExpiringItemsPdf } from "./pdf";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await reportsProfileOrResponse();
  if (!auth.ok) return auth.response;
  const { profile } = auth;

  const url = new URL(req.url);
  const requested = url.searchParams.get("service");
  // "all" is only meaningful for Admin; resolveReportScope pins everyone else
  // to their own service regardless of what is asked for.
  const requestedServiceId = requested === "all" || !requested ? null : requested;
  const { serviceId } = resolveReportScope(profile, requestedServiceId);

  const supabase = createClient();
  const [orgName, service, people] = await Promise.all([
    organisationName(supabase, profile.organisation_id),
    serviceId
      ? supabase.from("services").select("name").eq("id", serviceId).maybeSingle()
      : Promise.resolve({ data: null }),
    hrExpiringItemsData(supabase, serviceId),
  ]);

  const scopeLabel = serviceId
    ? ((service.data?.name as string | undefined) ?? "Unknown service")
    : isAdmin(profile.access_tier)
      ? "All services"
      : "Not assigned to a service";

  return pdfResponse(
    HrExpiringItemsPdf({ orgName, scopeLabel, people }),
    `HR expiring items - ${scopeLabel}.pdf`,
  );
}
