import { redirect } from "next/navigation";
import { getProfile, isManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  // Leaders land on the overview of what needs doing; everyone else on their
  // SOPs.
  if (isManager(profile.access_tier) || profile.hr_manager) redirect("/admin");
  redirect("/sops");
}
