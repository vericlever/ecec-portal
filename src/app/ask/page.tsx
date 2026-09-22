import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AskForm } from "./ask-form";

export const dynamic = "force-dynamic";

export default async function AskPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  let enabled = false;
  if (profile.organisation_id) {
    const { data: org } = await supabase
      .from("organisations")
      .select("ai_qa_enabled")
      .eq("id", profile.organisation_id)
      .maybeSingle();
    enabled = Boolean(org?.ai_qa_enabled);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Ask</h1>
      <p className="mt-1 text-sm text-slate-500">
        Answers are drawn only from your organisation&apos;s own published policies and
        procedures - a suggestion, not a decision. Nothing here replaces checking with
        your director.
      </p>

      {enabled ? (
        <AskForm />
      ) : (
        <p className="mt-4 max-w-prose text-sm text-slate-500">
          This isn&apos;t available for your organisation yet.
        </p>
      )}
    </div>
  );
}
