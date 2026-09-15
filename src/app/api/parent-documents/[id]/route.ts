import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocumentUrl } from "@/lib/documents/store";
import { parentAccessCookieName, verifyParentCookie } from "@/lib/parent-access";

// The parent-portal equivalent of src/app/api/documents/[id]/route.ts: serves
// a policy's original file by redirecting to a short-lived signed URL. No
// staff session exists here at all, so access is gated entirely on the
// service's shared access code (via a signed cookie set by
// src/app/parent/[serviceId]/actions.ts) plus a fresh re-check, right here,
// that the requested document is actually that service's own published,
// parent-facing policy - never trust the query string alone.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const serviceId = request.nextUrl.searchParams.get("service");
  if (!serviceId) return new NextResponse("Not found", { status: 404 });

  const admin = createAdminClient();

  const { data: access } = await admin
    .from("service_parent_access")
    .select("code")
    .eq("service_id", serviceId)
    .maybeSingle();
  const cookieValue = request.cookies.get(parentAccessCookieName(serviceId))?.value;
  if (!access || !verifyParentCookie(serviceId, access.code, cookieValue)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: service } = await admin
    .from("services")
    .select("id, organisation_id")
    .eq("id", serviceId)
    .maybeSingle();
  if (!service) return new NextResponse("Not found", { status: 404 });

  // Looking the policy up BY its source_document_id (rather than looking the
  // document up by id first) means the row we find is, by construction, the
  // policy's own current designated public file - not just some document
  // that happens to share the requested id.
  const { data: policy } = await admin
    .from("policies")
    .select("id, organisation_id, service_id, is_parent_facing, published_version")
    .eq("source_document_id", params.id)
    .maybeSingle();

  if (
    !policy ||
    policy.organisation_id !== service.organisation_id ||
    !policy.is_parent_facing ||
    policy.published_version == null ||
    (policy.service_id !== null && policy.service_id !== serviceId)
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const signed = await signedDocumentUrl(params.id);
  if (!signed) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(signed.url);
}
