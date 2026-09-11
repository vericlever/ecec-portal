import { redirect } from "next/navigation";
import { getProfile, isManager } from "@/lib/auth";
import { Landing } from "@/components/marketing/landing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const profile = await getProfile();
  if (profile) {
    // Leaders land on the overview (Step 27, unchanged). Plain staff land on
    // the orientation worklist (build addendum item 2) rather than straight
    // into their procedure list.
    if (isManager(profile.access_tier) || profile.hr_manager) redirect("/admin");
    redirect("/home");
  }
  return <Landing />;
}
