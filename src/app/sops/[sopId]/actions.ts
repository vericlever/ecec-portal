"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import {
  RSG_ORGANISATION_ID,
  DEV_USER_ID,
  DEV_USER_SITE_ID,
} from "@/lib/constants";

type SignResult = { ok: true } | { ok: false; error: string };

// Records that the hardcoded dev user has read and signed the current version of
// a SOP. Idempotent: signing again for the same version is a no-op.
export async function signSop(sopId: string): Promise<SignResult> {
  try {
    const [sop] = await query<{ id: string; current_version: number }>(
      `select id, current_version from sops where id = $1 and organisation_id = $2`,
      [sopId, RSG_ORGANISATION_ID],
    );

    if (!sop) return { ok: false, error: "SOP not found." };

    await query(
      `
      insert into sign_offs
        (organisation_id, site_id, user_id, sop_id, sop_version, comprehension_check_passed)
      values ($1, $2, $3, $4, $5, null)
      on conflict (user_id, sop_id, sop_version) do nothing
      `,
      [
        RSG_ORGANISATION_ID,
        DEV_USER_SITE_ID,
        DEV_USER_ID,
        sop.id,
        sop.current_version,
      ],
    );

    revalidatePath("/sops");
    revalidatePath(`/sops/${sopId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
