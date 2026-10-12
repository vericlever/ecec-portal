import { redirect } from "next/navigation";

// Step 59, B1: Staff outcome flags was renamed and moved to Our Outcomes.
// This route stays as a redirect for anything still linking to the old path.
export default function OutcomeFlagsRedirect() {
  redirect("/admin/our-outcomes");
}
