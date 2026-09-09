import { reportsProfileOrResponse } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { organisationName, stakeholderNotificationData } from "@/lib/reports";
import { pdfResponse } from "@/lib/pdf";
import { StakeholderNotificationsPdf } from "./pdf";

export const runtime = "nodejs";

export async function GET() {
  const auth = await reportsProfileOrResponse();
  if (!auth.ok) return auth.response;

  const supabase = createClient();
  const [orgName, notifications] = await Promise.all([
    organisationName(supabase, auth.profile.organisation_id),
    stakeholderNotificationData(),
  ]);

  return pdfResponse(
    StakeholderNotificationsPdf({ orgName, notifications }),
    "Stakeholder notification report.pdf",
  );
}
