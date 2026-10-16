import { CircleAlert } from "lucide-react";
import { linkToken } from "@clubedge/auth";
import Link from "next/link";

import { resetPassword } from "@/app/actions/auth";
import { PasswordField, SubmitButton } from "@/app/login/_components/auth-form-controls";
import { AuthPage } from "@/app/login/_components/auth-page";
import { Notice } from "@/app/login/_components/notice";

const errorMessages: Record<string, string> = {
  "invalid-input": "Choose a password with at least 8 characters.",
  "rate-limited": "Too many attempts. Wait a minute and try again.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string; userId?: string; secret?: string }>;
}) {
  const search = await searchParams;
  const { error } = search;
  // Appwrite's links carry userId and secret instead of a token.
  const token = linkToken(search, "token") ?? undefined;

  return (
    <AuthPage
      description="Choose the password you will use from now on."
      title="Choose a new password"
    >
      {error === "invalid-reset" && (
        <Notice icon={<CircleAlert />} role="alert" tone="error">
          That reset link is invalid or has expired.{" "}
          <Link className="font-medium underline underline-offset-4" href="/forgot-password">
            Request a new one
          </Link>
          .
        </Notice>
      )}
      {error && errorMessages[error] && (
        <Notice icon={<CircleAlert />} role="alert" tone="error">
          {errorMessages[error]}
        </Notice>
      )}
      <form action={resetPassword} className="grid gap-5">
        {token && <input name="token" type="hidden" value={token} />}
        <PasswordField isSignUp label="New password" />
        <SubmitButton>Update password</SubmitButton>
      </form>
    </AuthPage>
  );
}
