import { CircleAlert } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { AuthForm, PasswordField, SubmitButton } from "@/components/auth/auth-form-controls";
import { AuthPage } from "@/components/auth/auth-page";
import { Notice } from "@/components/auth/notice";

const errorMessages: Record<string, string> = {
  "invalid-input": "Choose a password with at least 8 characters.",
  "rate-limited": "Too many attempts. Wait a minute and try again.",
};

const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { error?: string; token?: string } => ({
    error: asString(search.error),
    token: asString(search.token),
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { error, token } = Route.useSearch();

  return (
    <AuthPage
      description="Choose the password you will use from now on."
      title="Choose a new password"
    >
      {error === "invalid-reset" && (
        <Notice icon={<CircleAlert />} role="alert" tone="error">
          That reset link is invalid or has expired.{" "}
          <Link className="font-medium underline underline-offset-4" to="/forgot-password">
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
      <AuthForm action="/auth/reset-password">
        {token && <input name="token" type="hidden" value={token} />}
        <PasswordField isSignUp label="New password" />
        <SubmitButton>Update password</SubmitButton>
      </AuthForm>
    </AuthPage>
  );
}
