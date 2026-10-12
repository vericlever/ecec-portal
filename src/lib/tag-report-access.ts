// Service scoping shared by the tag report PDF routes and the preview page.
// An admin, or a manager whose reach spans every service, may ask for All
// Services (null) or any one service. Everyone else is pinned to their own
// service whatever the request says (resolveReportScope).

import type { Profile } from "@/lib/auth";
import { resolveReportScope } from "@/lib/reports";

export type TagReportScope =
  | { ok: true; serviceId: string | null }
  | { ok: false; message: string };

export function resolveTagReportScope(profile: Profile, requested: string | null): TagReportScope {
  const wanted = requested && requested !== "all" ? requested : null;
  const { serviceId, restricted } = resolveReportScope(profile, wanted);
  if (restricted && !serviceId) return { ok: false, message: "You are not assigned to a service." };
  return { ok: true, serviceId };
}
