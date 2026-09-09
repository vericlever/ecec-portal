import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { organisationName } from "@/lib/reports";
import { pdfResponse } from "@/lib/pdf";
import type { ContractRow } from "@/lib/contracts";
import { ContractPdf } from "./pdf";

export const runtime = "nodejs";

// Access follows contracts_select RLS exactly: the staff member reads their
// own, an Admin or HR manager at the worker's service reads theirs. The route
// queries through the caller's own client (not the admin client), so a bug
// here can't leak past what the caller's tier already sees.
export async function GET(req: Request) {
  const me = await getProfile();
  if (!me) return new Response("Sign in", { status: 401 });

  const url = new URL(req.url);
  const contractId = url.searchParams.get("contract");
  if (!contractId) return new Response("Missing contract parameter", { status: 400 });

  const supabase = createClient();
  const { data: contract } = await supabase
    .from("contracts")
    .select(
      "id, profile_id, start_date, period_type, duration_months, expiry_date, document_id, notes, superseded_at, signed_at, signed_name, signed_by, signed_content_hash, is_deed, countersigned_at, countersigned_name, countersigned_by, countersigned_content_hash, created_at",
    )
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return new Response("Not found", { status: 404 });

  const { data: worker } = await supabase
    .from("profiles")
    .select("full_name, organisation_id")
    .eq("id", contract.profile_id)
    .maybeSingle();
  if (!worker) return new Response("Not found", { status: 404 });

  const orgName = await organisationName(supabase, worker.organisation_id as string | null);

  return pdfResponse(
    ContractPdf({
      orgName,
      staffName: worker.full_name as string,
      contract: contract as ContractRow,
    }),
    `Contract - ${worker.full_name}.pdf`,
  );
}
