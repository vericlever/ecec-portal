import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function UploadOutcomeDataPage() {
  const me = await requireManager();
  const supabase = createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name")
    .eq("organisation_id", me.organisation_id!)
    .order("name");

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Upload outcome data</h1>
      <UploadForm services={(services ?? []) as { id: string; name: string }[]} />
    </div>
  );
}
