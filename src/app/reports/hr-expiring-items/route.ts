import { reportsProfileOrResponse } from "@/lib/auth";
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
  // "all" is only meaningful for an unrestricted viewer (Admin, or a manager/
  // HR manager with all_services reach); resolveReportScope pins everyone
  // else to their own service regardless of what is asked for.
  const requestedServiceId = requested === "all" || !requested ? null : requested;
  const { serviceId, restricted } = resolveReportScope(profile, requestedServiceId);

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
    : restricted
      ? "Not assigned to a service"
      : "All services";

  return pdfResponse(
    HrExpiringItemsPdf({ orgName, scopeLabel, people, timezone: profile.organisation_timezone }),
    `HR expiring items - ${scopeLabel}.pdf`,
  );
}
