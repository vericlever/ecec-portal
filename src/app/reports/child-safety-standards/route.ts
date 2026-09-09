import { reportsProfileOrResponse } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { childSafetyStandardsReport, organisationName } from "@/lib/reports";
import { pdfResponse } from "@/lib/pdf";
import { TagReportPdf } from "../_pdf/tag-report";

export const runtime = "nodejs";

export async function GET() {
  const auth = await reportsProfileOrResponse();
  if (!auth.ok) return auth.response;

  const supabase = createClient();
  const [orgName, sections] = await Promise.all([
    organisationName(supabase, auth.profile.organisation_id),
    childSafetyStandardsReport(supabase),
  ]);

  return pdfResponse(
    TagReportPdf({ orgName, title: "Child safety standards report", sections }),
    "Child safety standards report.pdf",
  );
}
