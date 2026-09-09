import { reportsProfileOrResponse } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { organisationName, versionChangeHistoryData } from "@/lib/reports";
import { pdfResponse } from "@/lib/pdf";
import { ChangeHistoryPdf } from "./pdf";

export const runtime = "nodejs";

export async function GET() {
  const auth = await reportsProfileOrResponse();
  if (!auth.ok) return auth.response;

  const supabase = createClient();
  const [orgName, entries] = await Promise.all([
    organisationName(supabase, auth.profile.organisation_id),
    versionChangeHistoryData(supabase),
  ]);

  return pdfResponse(
    ChangeHistoryPdf({ orgName, entries }),
    "Version and change history report.pdf",
  );
}
