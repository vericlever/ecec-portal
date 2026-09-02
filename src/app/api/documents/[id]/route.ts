import { type NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { signedDocumentUrl } from "@/lib/documents/store";

// Serves the original uploaded file by redirecting to a short-lived signed URL.
// Access is re-checked here against the owning record, not left to the
// documents-table RLS.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getProfile();
  if (!me) return new NextResponse("Sign in", { status: 401 });

  const supabase = createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, owner_type, owner_id, organisation_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!doc || doc.organisation_id !== me.organisation_id) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (doc.owner_type === "policy" || doc.owner_type === "sop") {
    // A content editor can see any policy or SOP document; anyone else only
    // once it is published.
    if (!canEditContent(me.access_tier)) {
      const { data: owner } = await supabase
        .from(doc.owner_type === "policy" ? "policies" : "sops")
        .select("id, published_version")
        .eq("id", doc.owner_id)
        .maybeSingle();
      if (!owner || owner.published_version == null) {
        return new NextResponse("Not found", { status: 404 });
      }
    }
  } else if (doc.owner_type === "contract" || doc.owner_type === "identity") {
    // The staff member sees their own; a manager or HR manager sees it via the
    // RLS on the owning row (contracts_select / identity_documents_rw).
    const table = doc.owner_type === "contract" ? "contracts" : "identity_documents";
    const { data: owner } = await supabase
      .from(table)
      .select("id")
      .eq("id", doc.owner_id)
      .maybeSingle();
    if (!owner) return new NextResponse("Not found", { status: 404 });
  } else if (!canEditContent(me.access_tier)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const signed = await signedDocumentUrl(params.id);
  if (!signed) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(signed.url);
}
