import { getProfile, isAdmin } from "@/lib/auth";
import { templateCsv } from "@/lib/nqaits-import";

// The blank import template (header row plus one worked example row).
export async function GET() {
  const me = await getProfile();
  if (!me || !isAdmin(me.access_tier)) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(templateCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        'attachment; filename="vericlever-staff-import-template.csv"',
    },
  });
}
