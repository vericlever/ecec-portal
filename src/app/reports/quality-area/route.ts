import { reportsProfileOrResponse } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { qualityAreaReport, organisationName } from "@/lib/reports";
import { pdfResponse } from "@/lib/pdf";
import { TagReportPdf } from "../_pdf/tag-report";

export const runtime = "nodejs";

export async function GET() {
  const auth = await reportsProfileOrResponse();
  if (!auth.ok) return auth.response;

  const supabase = createClient();
  const [orgName, sections] = await Promise.all([
    organisationName(supabase, auth.profile.organisation_id),
    qualityAreaReport(supabase),
  ]);

  return pdfResponse(
    TagReportPdf({ orgName, title: "Quality area report", sections }),
    "Quality area report.pdf",
  );
}
