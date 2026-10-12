import { tagReportResponse, statementsFrom } from "../_pdf/tag-report-route";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const service = new URL(req.url).searchParams.get("service");
  return tagReportResponse("child_safe_standard", service);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const service = typeof body?.service === "string" ? body.service : null;
  return tagReportResponse("child_safe_standard", service, statementsFrom(body));
}
