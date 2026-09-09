import { reportsProfileOrResponse } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { organisationName, perStaffComplianceData } from "@/lib/reports";
import { pdfResponse } from "@/lib/pdf";
import { PerStaffCompliancePdf } from "./pdf";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await reportsProfileOrResponse();
  if (!auth.ok) return auth.response;
  const { profile } = auth;

  const url = new URL(req.url);
  const profileId = url.searchParams.get("profile");
  if (!profileId) return new Response("Missing profile parameter", { status: 400 });

  const supabase = createClient();
  // perStaffComplianceData reads the target profile through the caller's RLS
  // client, so a Manager (policy) requesting someone outside their service
  // gets null here (RLS hides the row) - same reach as everywhere else, not a
  // second permission system.
  const [orgName, data] = await Promise.all([
    organisationName(supabase, profile.organisation_id),
    perStaffComplianceData(supabase, profileId),
  ]);
  if (!data) return new Response("Not found", { status: 404 });

  return pdfResponse(
    PerStaffCompliancePdf({ orgName, data }),
    `Compliance report - ${data.fullName}.pdf`,
  );
}
