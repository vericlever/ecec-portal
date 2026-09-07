import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-lg font-semibold">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter your email and we will send you a link to set a new password.
      </p>
      <ForgotPasswordForm />
      <p className="mt-4 text-sm">
        <Link href="/login" className="text-slate-500 hover:text-slate-900">
          ← Back to sign in
        </Link>
      </p>
    </div>
  );
}
