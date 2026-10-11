import { CircleAlert } from "lucide-react";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthForm, EmailField, SubmitButton } from "@/components/auth/auth-form-controls";
import { AuthPage } from "@/components/auth/auth-page";
import { Notice } from "@/components/auth/notice";
import { getAuthStatus } from "@/server/auth.functions";

const errorMessages: Record<string, string> = {
  "invalid-input": "Enter a valid email address.",
  "rate-limited": "Too many attempts. Wait a minute and try again.",
};

export const Route = createFileRoute("/forgot-password")({
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  loader: async () => {
    const status = await getAuthStatus();
    if (!status.canResetPassword) throw redirect({ to: "/login" });
    return status;
  },
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { error } = Route.useSearch();
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
      <AuthForm action="/auth/forgot-password">
        <EmailField />
        <SubmitButton>Send reset link</SubmitButton>
      </AuthForm>
    </AuthPage>
  );
}
