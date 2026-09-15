import { requireManager, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format-date";
import { generateParentAccessCode } from "./actions";
import { CopyButton } from "./copy-button";

export const dynamic = "force-dynamic";

type ServiceRow = { id: string; name: string };
type AccessRow = { service_id: string; code: string; updated_at: string };

export default async function ParentPortalPage() {
  const me = await requireManager();
  const supabase = createClient();

  // services_select is org-wide (any staff member may read the services
  // list), so this is narrowed to what the current person actually covers -
  // an Admin sees every service, a Manager only the one they belong to -
  // rather than showing other services' rows with no code and no way to
  // read or change them.
  const { data: services } = await supabase
    .from("services")
    .select("id, name")
    .order("name");
  const visibleServices = ((services ?? []) as ServiceRow[]).filter(
    (s) => isAdmin(me.access_tier) || s.id === me.service_id,
  );

  // service_parent_access_select (migration 0067) is the real gate here: a
  // Manager's query only ever returns their own service's row regardless of
  // what this app code asks for, an Admin's returns every service in the org.
  const { data: accessRows } = visibleServices.length
    ? await supabase
        .from("service_parent_access")
        .select("service_id, code, updated_at")
        .in("service_id", visibleServices.map((s) => s.id))
    : { data: [] as AccessRow[] };
  const accessByService = new Map(
    (accessRows ?? []).map((r) => [r.service_id as string, r as AccessRow]),
  );

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.vericlever.site").replace(
    /\/+$/,
    "",
  );

  return (
    <div>
      <h1 className="text-xl font-semibold">Parent portal access</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Each service has its own link and access code for the public,
        no-login page that lists its parent-facing policies as downloads.
        The code is shared by every parent at that service, the same way a
        noticeboard door code would be - it is not a personal login.{" "}
        {isAdmin(me.access_tier)
          ? "Only an Admin can generate or reset a code."
          : "Ask an Admin if a code needs to be generated or reset."}
      </p>

      <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {visibleServices.map((s) => {
          const access = accessByService.get(s.id);
          const url = `${site}/parent/${s.id}`;
          return (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <div className="text-sm font-medium">{s.name}</div>
                {access ? (
                  <div className="mt-1.5 flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="truncate">{url}</span>
                      <CopyButton value={url} label="Copy link" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>
                        Code:{" "}
                        <span className="font-mono text-sm font-semibold tracking-wider text-slate-900">
                          {access.code}
                        </span>
                      </span>
                      <CopyButton value={access.code} label="Copy code" />
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Last changed {fmtDateTime(access.updated_at, me.organisation_timezone)}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-slate-400">
                    No code generated yet.
                  </div>
                )}
              </div>

              {isAdmin(me.access_tier) && (
                <form action={generateParentAccessCode.bind(null, s.id)}>
                  <button
                    type="submit"
                    className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {access ? "Reset code" : "Generate code"}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
