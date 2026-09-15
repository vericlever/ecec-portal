import type { SopSigningWindow } from "@/lib/constants";

// Step 1's "defaults for this batch" picker (job roles, category, site,
// review period, signing window, quality areas, child safe standards) is a
// pure client-side prefill for step 2's per-row form - nothing durable is
// created until commit either way, so this is sessionStorage rather than a
// new staging-table column. Cleared after being read once.

export type BulkSopDefaults = {
  jobRoleIds: string[];
  categoryId: string;
  serviceId: string;
  reviewPeriod: number;
  signingWindow: SopSigningWindow;
  qualityAreaIds: number[];
  childSafeStandardIds: number[];
};

export const EMPTY_BULK_SOP_DEFAULTS: BulkSopDefaults = {
  jobRoleIds: [],
  categoryId: "",
  serviceId: "",
  reviewPeriod: 6,
  signingWindow: "week",
  qualityAreaIds: [],
  childSafeStandardIds: [],
};

function key(batchId: string) {
  return `sop-bulk-defaults:${batchId}`;
}

export function writeBulkSopDefaults(batchId: string, defaults: BulkSopDefaults) {
  try {
    sessionStorage.setItem(key(batchId), JSON.stringify(defaults));
  } catch {
    // sessionStorage can throw in a locked-down/private context - the
    // review page just falls back to its own empty defaults, nothing lost.
  }
}

export function readBulkSopDefaults(batchId: string): BulkSopDefaults {
  try {
    const raw = sessionStorage.getItem(key(batchId));
    sessionStorage.removeItem(key(batchId));
    if (!raw) return EMPTY_BULK_SOP_DEFAULTS;
    return { ...EMPTY_BULK_SOP_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return EMPTY_BULK_SOP_DEFAULTS;
  }
}
