import Link from "next/link";
import { requireProfile, isManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime } from "@/lib/format-date";
import { AcceptForm } from "./accept-form";

export const dynamic = "force-dynamic";

// Step 51. Presented at first login before anything else (the middleware
// gate in lib/supabase/middleware.ts sends every authenticated user here
// until they have accepted the current version), and permanently reachable
// afterwards from /account to reopen and re-read it - one page serves both,
// switching on whether this profile has already accepted the current version.
export default async function AcceptTermsPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const me = await requireProfile();
  const supabase = createClient();

  const { data: notice } = await supabase
    .from("platform_notices")
    .select("version, title, body, effective_at")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fallback = isManager(me.access_tier) || me.hr_manager ? "/admin" : "/home";
  const next = searchParams.next?.startsWith("/") && searchParams.next !== "/accept-terms"
    ? searchParams.next
    : fallback;

  if (!notice) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-slate-500">
          No platform terms are on file yet.{" "}
          <Link href={fallback} className="underline">
            Continue
          </Link>
          .
        </p>
      </div>
    );
  }

  const { data: acceptance } = await supabase
    .from("platform_notice_acceptances")
    .select("accepted_at")
    .eq("profile_id", me.id)
    .eq("notice_version", notice.version)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold text-slate-900">{notice.title}</h1>
      <p className="mt-1 text-xs text-slate-400">
        Version {notice.version}
        {notice.effective_at && ` · effective ${fmtDate(notice.effective_at)}`}
      </p>

      {acceptance ? (
        <p className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          You accepted this version on{" "}
          {fmtDateTime(acceptance.accepted_at, me.organisation_timezone, { time: true })}.
        </p>
      ) : (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          You need to accept this before you can continue.
        </p>
      )}

      <div
        className="mt-6 max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-700"
        dangerouslySetInnerHTML={{ __html: notice.body }}
      />

      {acceptance ? (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <Link
            href={next}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Continue
          </Link>
        </div>
      ) : (
        <AcceptForm version={notice.version} next={next} />
      )}
    </div>
  );
}
