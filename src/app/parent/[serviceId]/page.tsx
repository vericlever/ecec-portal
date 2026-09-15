import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { LogoMark } from "@/components/bauhaus";
import { parentAccessCookieName, verifyParentCookie } from "@/lib/parent-access";
import { verifyParentCode } from "./actions";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PolicyRow = {
  id: string;
  name: string;
  service_id: string | null;
  source_document_id: string | null;
};

export default async function ParentPolicyPage({
  params,
  searchParams,
}: {
  params: { serviceId: string };
  searchParams: { error?: string };
}) {
  if (!UUID_RE.test(params.serviceId)) notFound();

  const admin = createAdminClient();
  const { data: service } = await admin
    .from("services")
    .select("id, name, organisation_id, organisations(name, display_name)")
    .eq("id", params.serviceId)
    .maybeSingle();
  if (!service) notFound();

  const orgRaw = service.organisations as
    | { name: string; display_name: string | null }
    | { name: string; display_name: string | null }[]
    | null;
  const org = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw;
  const orgName = org?.display_name || org?.name || "";

  const { data: access } = await admin
    .from("service_parent_access")
    .select("code")
    .eq("service_id", params.serviceId)
    .maybeSingle();

  const cookieValue = cookies().get(parentAccessCookieName(params.serviceId))?.value;
  const verified = Boolean(
    access && verifyParentCookie(params.serviceId, access.code, cookieValue),
  );

  return (
    <div className="font-jost flex min-h-screen flex-col bg-paper text-ink">
      <header className="border-b-[10px] border-ink">
        <div className="mx-auto flex max-w-[720px] items-center gap-2.5 px-5 py-5">
          <LogoMark size={26} />
          <span className="text-[15px] font-semibold tracking-[0.2em]">
            VERICLEVER
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-5 py-12">
        <p className="text-[13px] font-semibold uppercase tracking-[0.24em] text-outcomes">
          Parent portal
        </p>
        <h1 className="mt-2 text-[clamp(26px,4vw,36px)] font-semibold leading-tight">
          {service.name}
        </h1>
        {orgName && (
          <p className="mt-1 text-[15px] text-ink-muted">{orgName}</p>
        )}

        {!verified ? (
          <div className="mt-8 max-w-[420px]">
            {!access && (
              <p className="mb-5 border-l-2 border-training py-1 pl-3 text-[15px] text-ink">
                No access code has been set up for this service yet. Please
                contact the centre directly.
              </p>
            )}
            <p className="text-[16px] leading-relaxed text-ink-muted">
              Enter the access code your service gave you to view its
              policies.
            </p>
            {searchParams.error && (
              <p className="mt-4 border-l-2 border-training py-1 pl-3 text-[15px] text-ink">
                That code wasn&apos;t right. Please try again, or check with
                your service.
              </p>
            )}
            <form
              action={verifyParentCode.bind(null, params.serviceId)}
              className="mt-5 flex flex-col gap-4"
            >
              <input
                name="code"
                type="text"
                autoComplete="off"
                required
                placeholder="Access code"
                className="w-full border-2 border-ink bg-paper px-4 py-[15px] font-jost text-[17px] uppercase tracking-[0.1em] text-ink placeholder:normal-case placeholder:tracking-normal placeholder:text-[#9A9488] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-outcomes"
              />
              <button
                type="submit"
                className="bg-outcomes px-[26px] py-[15px] text-center text-[16px] font-medium text-paper hover:bg-outcomes-hover"
              >
                View policies
              </button>
            </form>
          </div>
        ) : (
          <PolicyList serviceId={params.serviceId} organisationId={service.organisation_id} />
        )}
      </main>
    </div>
  );
}

async function PolicyList({
  serviceId,
  organisationId,
}: {
  serviceId: string;
  organisationId: string;
}) {
  const admin = createAdminClient();
  const { data: policies } = await admin
    .from("policies")
    .select("id, name, service_id, source_document_id")
    .eq("organisation_id", organisationId)
    .eq("is_parent_facing", true)
    .not("published_version", "is", null)
    .order("name");

  const forThisService = ((policies ?? []) as PolicyRow[]).filter(
    (p) => p.service_id === null || p.service_id === serviceId,
  );
  const downloadable = forThisService.filter((p) => p.source_document_id);

  if (downloadable.length === 0) {
    return (
      <p className="mt-8 text-[16px] text-ink-muted">
        No policies have been made available here yet.
      </p>
    );
  }

  return (
    <ul className="mt-8 flex flex-col divide-y-2 divide-ink/10 border-2 border-ink">
      {downloadable.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-4">
          <span className="text-[16px]">{p.name}</span>
          <a
            href={`/api/parent-documents/${p.source_document_id}?service=${serviceId}`}
            className="shrink-0 border border-ink px-4 py-2 text-[14px] text-ink hover:bg-ink hover:text-paper"
          >
            Download
          </a>
        </li>
      ))}
    </ul>
  );
}
