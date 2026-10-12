import { requireManager } from "@/lib/auth";
import { listPolicies } from "../actions";
import { FlagPolicyForm } from "./flag-policy-form";

export const dynamic = "force-dynamic";

export default async function FlagPolicyPage() {
  await requireManager();
  const policies = await listPolicies();

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold">Flag a policy</h1>
      <p className="mt-1 text-sm text-slate-500">
        A note that a policy may need attention, waiting on that policy&apos;s next review.
      </p>
      <FlagPolicyForm policies={policies} />
    </div>
  );
}
