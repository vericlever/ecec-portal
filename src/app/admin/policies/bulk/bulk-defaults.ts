// Step 1's "defaults for this batch" picker is a pure client-side prefill for
// step 2's per-row form - nothing durable is created until commit either way,
// so this is sessionStorage rather than a new staging-table column. Same
// pattern as src/app/admin/sops/bulk/bulk-defaults.ts. Deliberately excludes
// a next-review-date default: the review screen already has a purpose-built
// "Spread from here" control that staggers dates a week apart across rows,
// and defaulting every row to the same date would work against that.

export type BulkPolicyDefaults = {
  categoryIds: string[];
  serviceId: string;
  reviewPeriod: number;
  qualityAreaIds: number[];
  childSafeStandardIds: number[];
};

export const EMPTY_BULK_POLICY_DEFAULTS: BulkPolicyDefaults = {
  categoryIds: [],
  serviceId: "",
  reviewPeriod: 6,
  qualityAreaIds: [],
  childSafeStandardIds: [],
};

function key(batchId: string) {
  return `policy-bulk-defaults:${batchId}`;
}

export function writeBulkPolicyDefaults(batchId: string, defaults: BulkPolicyDefaults) {
  try {
    sessionStorage.setItem(key(batchId), JSON.stringify(defaults));
  } catch {
    // sessionStorage can throw in a locked-down/private context - the review
    // page just falls back to its own empty defaults, nothing lost.
  }
}

export function readBulkPolicyDefaults(batchId: string): BulkPolicyDefaults {
  try {
    const raw = sessionStorage.getItem(key(batchId));
    sessionStorage.removeItem(key(batchId));
    if (!raw) return EMPTY_BULK_POLICY_DEFAULTS;
    return { ...EMPTY_BULK_POLICY_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return EMPTY_BULK_POLICY_DEFAULTS;
  }
}
