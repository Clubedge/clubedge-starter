import { ArrowLeft, CircleAlert, CircleCheck } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { buttonVariants } from "@clubedge/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clubedge/ui/components/card";
import { Input } from "@clubedge/ui/components/input";
import { Label } from "@clubedge/ui/components/label";
import { AuthForm, PasswordField, SubmitButton } from "@/components/auth/auth-form-controls";
import { Notice } from "@/components/auth/notice";
import { getSettings } from "@/server/settings.functions";

const results: Record<string, { tone: "info" | "error"; text: string }> = {
  "profile-saved": { tone: "info", text: "Your profile was saved." },
  "password-changed": { tone: "info", text: "Your password was changed." },
  "invalid-password": { tone: "error", text: "That password is not correct." },
  "invalid-input": {
    tone: "error",
    text: "Check the form: names have up to 80 characters, and passwords at least 8.",
  },
  "rate-limited": { tone: "error", text: "Too many attempts. Wait a minute and try again." },
  unavailable: {
    tone: "error",
    text: "Password checks are unavailable right now. Try again in a few minutes.",
  },
  "active-subscription": {
    tone: "error",
    text: "Cancel your subscription with Manage billing on the dashboard before deleting your account.",
  },
  "delete-unavailable": {
    tone: "error",
    text: "Deleting an account is not set up for this app yet.",
  },
};

const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): { status?: string; error?: string } => ({
    status: asString(search.status),
    error: asString(search.error),
  }),
  head: () => ({ meta: [{ title: "Settings" }] }),
  loader: () => getSettings(),
  component: SettingsPage,
});

function SettingsPage() {
  const settings = Route.useLoaderData();
  const { status, error } = Route.useSearch();
  const result = results[error ?? status ?? ""];

  if (!settings.configured) {
    return (
      <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Sign-in is not configured yet, so there is no account to manage.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
      <div className="grid gap-2">
        <Link
          to="/dashboard"
          className={buttonVariants({ className: "w-fit", size: "sm", variant: "ghost" })}
        >
          <ArrowLeft aria-hidden="true" /> Dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Signed in as {settings.email}.</p>
      </div>

      {result && (
        <Notice
          icon={result.tone === "error" ? <CircleAlert /> : <CircleCheck />}
          role={result.tone === "error" ? "alert" : "status"}
          tone={result.tone}
        >
          {result.text}
        </Notice>
      )}

      <Card id="profile">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>The name shown in the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthForm action="/auth/update-profile">
            <div className="grid gap-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                autoComplete="name"
                className="h-11"
                defaultValue={settings.displayName ?? ""}
                id="displayName"
                maxLength={80}
                name="displayName"
              />
            </div>
            <SubmitButton>Save profile</SubmitButton>
          </AuthForm>
        </CardContent>
      </Card>

      <Card id="change-password">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Confirm your current password to choose a new one.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthForm action="/auth/change-password">
            <PasswordField
              isSignUp={false}
              label="Current password"
              name="currentPassword"
              minLength={1}
            />
            <PasswordField isSignUp label="New password" name="newPassword" />
            <SubmitButton>Change password</SubmitButton>
          </AuthForm>
        </CardContent>
      </Card>

      <Card id="delete-account">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Deletes your account and the data the app keeps for it. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settings.canDeleteAccount ? (
            <AuthForm action="/auth/delete-account">
              <PasswordField isSignUp={false} label="Password" name="password" minLength={1} />
              <SubmitButton variant="destructive">Delete my account</SubmitButton>
            </AuthForm>
          ) : (
            <p className="text-sm text-muted-foreground">
              Deleting an account is not set up for this app yet.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
