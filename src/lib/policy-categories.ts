import { createClient } from "@/lib/supabase/server";

type ServerClient = ReturnType<typeof createClient>;

export type PolicyCategory = {
  id: string;
  slug: string;
  name: string;
  is_parent_facing: boolean;
  sort_order: number;
};

export async function policyCategories(
  supabase: ServerClient,
): Promise<PolicyCategory[]> {
  const { data } = await supabase
    .from("policy_categories")
    .select("id, slug, name, is_parent_facing, sort_order")
    .order("sort_order");
  return (data ?? []) as PolicyCategory[];
}

// The same table, filtered to the categories a procedure may pick (build
// addendum item 4). Procedures use a single category (sops.category_id),
// not the policy tier's multi-select junction, so callers just need the
// list, not a links map.
export async function procedureCategories(
  supabase: ServerClient,
): Promise<PolicyCategory[]> {
  const { data } = await supabase
    .from("policy_categories")
    .select("id, slug, name, is_parent_facing, sort_order")
    .eq("applies_to_procedures", true)
    .order("sort_order");
  return (data ?? []) as PolicyCategory[];
}

// category id -> policy ids, and policy id -> category ids, for a set of
// policies (or all, if ids omitted).
export async function policyCategoryLinks(
  supabase: ServerClient,
  policyIds?: string[],
): Promise<Map<string, string[]>> {
  let q = supabase
    .from("policy_category_links")
    .select("policy_id, category_id");
  if (policyIds && policyIds.length) q = q.in("policy_id", policyIds);
  const { data } = await q;
  const byPolicy = new Map<string, string[]>();
  for (const l of data ?? []) {
    const list = byPolicy.get(l.policy_id as string) ?? [];
    list.push(l.category_id as string);
    byPolicy.set(l.policy_id as string, list);
  }
  return byPolicy;
}
