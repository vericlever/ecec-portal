import { redirect } from "next/navigation";
import { getProfile, isManager } from "@/lib/auth";
import { Landing } from "@/components/marketing/landing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const profile = await getProfile();
  if (profile) {
    // Leaders land on the overview; everyone else on their SOPs.
    if (isManager(profile.access_tier) || profile.hr_manager) redirect("/admin");
    redirect("/sops");
  }
  return <Landing />;
}
