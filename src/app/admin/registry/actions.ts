"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseComponentExtract,
  parseRtoExtract,
  type RegistryKind,
} from "@/lib/registry-import";

export type RefreshResult =
  | { ok: false; error: string }
  | {
      ok: true;
      kind: RegistryKind;
      rowsSeen: number;
      rowsUpserted: number;
      skipped: number;
    };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function refreshRegistry(
  text: string,
  kind: RegistryKind,
  sourceName: string,
): Promise<RefreshResult> {
  const me = await requireAdmin();
  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (kind === "rto") {
    const parsed = parseRtoExtract(text);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    let upserted = 0;
    for (const batch of chunk(parsed.rows, 500)) {
      const { error } = await admin
        .from("rto_registry")
        .upsert(
          batch.map((r) => ({ ...r, refreshed_at: now })),
          { onConflict: "code" },
        );
      if (error) return { ok: false, error: error.message };
      upserted += batch.length;
    }

    await admin.from("registry_refreshes").insert({
      kind: "rto",
      source: sourceName || "upload",
      rows_seen: parsed.rows.length + parsed.skipped,
      rows_upserted: upserted,
      ran_by: me.id,
    });

    revalidatePath("/admin/registry");
    return {
      ok: true,
      kind: "rto",
      rowsSeen: parsed.rows.length + parsed.skipped,
      rowsUpserted: upserted,
      skipped: parsed.skipped,
    };
  }

  const parsed = parseComponentExtract(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  let upserted = 0;
  for (const batch of chunk(parsed.rows, 500)) {
    const { error } = await admin
      .from("training_components")
      .upsert(
        batch.map((r) => ({ ...r, refreshed_at: now })),
        { onConflict: "code" },
      );
    if (error) return { ok: false, error: error.message };
    upserted += batch.length;
  }

  await admin.from("registry_refreshes").insert({
    kind: "component",
    source: sourceName || "upload",
    rows_seen: parsed.rows.length + parsed.skipped,
    rows_upserted: upserted,
    ran_by: me.id,
  });

  revalidatePath("/admin/registry");
  return {
    ok: true,
    kind: "component",
    rowsSeen: parsed.rows.length + parsed.skipped,
    rowsUpserted: upserted,
    skipped: parsed.skipped,
  };
}
