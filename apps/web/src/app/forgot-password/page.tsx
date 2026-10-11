import { CircleAlert } from "lucide-react";
import { redirect } from "next/navigation";

import { requestPasswordReset } from "@/app/actions/auth";
import { EmailField, SubmitButton } from "@/app/login/_components/auth-form-controls";
import { AuthPage } from "@/app/login/_components/auth-page";
import { Notice } from "@/app/login/_components/notice";
import { getAuth, isAuthConfigured } from "@/server/auth";

const errorMessages: Record<string, string> = {
  "invalid-input": "Enter a valid email address.",
  "rate-limited": "Too many attempts. Wait a minute and try again.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isAuthConfigured() || !(await getAuth()).canResetPassword) redirect("/login");
  const { error } = await searchParams;
  const message = error ? errorMessages[error] : undefined;

  return (
    <AuthPage
      description="Enter your account's email and we will send you a link to choose a new password."
      title="Reset your password"
    >
      {message && (
        <Notice icon={<CircleAlert />} role="alert" tone="error">
          {message}
        </Notice>
      )}
      <form action={requestPasswordReset} className="grid gap-5">
        <EmailField />
        <SubmitButton>Send reset link</SubmitButton>
      </form>
    </AuthPage>
  );
}
