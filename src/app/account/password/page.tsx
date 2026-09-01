import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: { welcome?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reached only with a valid session, which /auth/confirm establishes from the
  // email link. No session means the link was bad or expired.
  if (!user) redirect("/login?error=link");

  const welcome = searchParams.welcome === "1";

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-lg font-semibold">
        {welcome ? "Welcome to VeriClever" : "Set a new password"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {welcome
          ? "Choose a password to finish setting up your account."
          : "Choose a new password for your account."}
      </p>
      <SetPasswordForm />
    </div>
  );
}
